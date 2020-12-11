# ProxyObserver.js

[![Build Status](https://travis-ci.com/createvibe/proxyobserver.svg?branch=master)](https://travis-ci.com/createvibe/proxyobserver)

Use a proxy object to observe deep changes in any javascript object (or array) and maintain the object path,
from the root property to the nested property that was modified.

When nested objects are accessed, a new ProxyObserver is returned for the nested object, instead of the object itself.
This allows deep path observations in complex objects.

Nothing is mapped, objects are wrapped on demand. 
This saves memory, processing, and allows the source object to be unharmed by the nested proxies.

Reflection is used to achieve this.


# The Implementation

The implementation is a simple recursive function.

- Data input is wrapped in a Proxy with a custom handler for get and set operations.
    - The getter wraps nested objects by recursively calling ProxyObserver
    - The setter uses Reflection to modify the underlying data object
- The proxy object is returned
- Use the proxy object to modify the source object
- Modifications trigger the setter which executes the observer callback.

The trick is maintaining the nested object path that was accessed to make the modification.

This is achieved using `Function.prototype.bind`. 

Each time `bind` is called on an already bound function, any arguments that are being bound are appended
to any arguments from previous bound operations.

All we do is pass around a reference to the observable callback function, but each time we recurse,
we bind the function reference with a new set of arguments, representing the current object path.

The observable callback is only executed once per modification.
When it is executed, the entire argument chain is passed to the callback function, in order from 
root to inner-most child.

Each argument in the chain contains the following information:

1. `target`: The object being modified.
1. `prop`: The property name, on the target, that is being modified.
1. `value`: The new value.
1. `oldValue`: `undefined` OR The value of the property on the target before being modified.
1. `receiver`: The value of `this` provided for the call to target if a getter is encountered. 
   When used with Proxy, it can be an object that inherits from target.

The callback is executed like this: `observer( {}, {}, {}, {} )`

If an object is modified like this: `root.child.data = 5;` the observable callback gets executed once. 
Each argument passed to the callback represents a level in the object path:
(1) `root`, (2) `child`, (3) `data`.

```
observer({target: {..}, prop: 'root', value: {..}},
         {target: {..}, prop: 'child', value: {..}),
         {target: {..}, prop: 'data', value: 5, oldValue: ... });
```
# The Code Is Small

No really, this is all there is.

```
function ProxyObserver(target, observer) {
    if (typeof observer !== 'function') {
        throw new TypeError('Expecting observer to be a callable function.');
    }
    return new Proxy(target, {
        get: (target, prop, receiver) => {
            const value = target[prop];
            if (typeof value === 'object') {
                return ProxyObserver(value, observer.bind(null, {target, prop, value, oldValue:undefined, receiver}));
            }
            return value;
        },
        set: (target, prop, value, receiver) => {
            const oldValue = Reflect.get(target, prop, receiver);
            if (oldValue === value) {
                return true;
            }
            observer({target, prop, value, oldValue, receiver});
            return Reflect.set(target, prop, value, receiver);
        },
        deleteProperty: (target, prop) => {
            if (prop in target) {
                const oldValue = Reflect.get(target, prop);
                observer({target, prop, value:undefined, oldValue, receiver:undefined});
                Reflect.deleteProperty(target, prop);
            }
        }
    });
}

```

# Usage Example

Consider the following data array.

```
const data = {
    one: 'foo',
    two: [1,'two',3,'four',5,[6,7]],
    three: {
        foo: 'test',
        bar: 'test'
    }
};
```

Here is a simple example that records the root property being accessed and the 
child value it's being modified with.

```
const proxy = ProxyObserver(data, function() {

    const chain = Array.prototype.slice.call(arguments);
    
    const { prop } = chain[0];
    const { value, oldValue } = chain[chain.length - 1];

    console.log('the root property', 
                prop, 
                'had a nested object modified with the value', 
                value,
                'which had an old value of',
                oldValue);

});
```

Here is a verbose example that traverses the entire observed callback chain 
to reassemble the object path that was accessed to make the modification.

```
const proxy = ProxyObserver(data, function() {

    console.log('we got a changed value!');

    let name, value;
    const path = [];
    const chain = Array.prototype.slice.call(arguments);
    while (chain.length !== 0) {
        const link = chain.shift();
        path.push( link.prop );
        if (!name) {
            name = link.prop;
        }
        value = link.value;
    }

    console.log('>', name, '<', path.join('.'), '=', value);

    // name holds the root property in the proxy that was modified
    // value holds the new value for the last property in the chain
});

proxy.two[5][1] = 'XXX';

// console: we got a changed value!
// console: > two < two.5.1 = XXX

proxy.three.foo = 'testing nested object';

// console: we got a changed value!
// console: > three < three.foo = testing nested object

proxy.three.bar = {
  test: 'new object',
  list: [1,2,3]
};

// console: we got a changed value!
// console: > three < three.bar = {test: "new object", list: Array(3)}

proxy.three.bar.list.push(4);

// console: we got a changed value!
// console: > three < three.bar.list.3 = 4

proxy.three.bar.list.splice(2,0,9);

// console: we got a changed value!
// console:  > three < three.bar.list.4 = 4

// console:  we got a changed value!
// console: > three < three.bar.list.3 = 3

// console: we got a changed value!
// console: > three < three.bar.list.2 = 9

console.log(proxy.three.bar.list.slice());

// console: (5) [1, 2, 9, 3, 4]

console.log(data.three.bar.list);

// console: (5) [1, 2, 9, 3, 4]
```
