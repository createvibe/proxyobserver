# proxyobserver

[![Build Status](https://travis-ci.com/createvibe/proxyobserver.svg?branch=master)](https://travis-ci.com/createvibe/proxyobserver)

Use a proxy object to observe deep changes in any javascript object (or array) and maintain the object path,
from the root property to the nested property that was modified.

When nested objects are accessed, a new `proxyobserver` is returned for the nested object, instead of the object itself.
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

The code is small. It's a simple recursive function.

```
function proxyobserver(target, observer) {
    if (typeof observer !== 'function') {
        throw new TypeError('Expecting observer to be a callable function.');
    }
    return new Proxy(target, {
        get: (target, prop, receiver) => {
            const value = target[prop];
            if (typeof value === 'object') {
                return proxyobserver(value, observer.bind(null, {target, prop, value, oldValue:undefined, receiver}));
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
                return Reflect.deleteProperty(target, prop);
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

## Simple Example

Here is a simple example that records the root property being accessed and the 
child value it's being modified with.

```
const proxy = proxyobserver(data, function() {

    const chain = Array.prototype.slice.call(arguments);
    
    const { prop } = chain[0];
    const { value, oldValue } = chain[chain.length - 1];

    const path = chain.map(node => node.prop);

    console.log('the root property', 
                prop, 
                'had a nested object modified with the value', 
                path.join('.'),
                '=',
                value,
                'which had an old value of',
                oldValue);

});
```

## Complicated Example

Here is a complicated example that will record changes and reverse them.

> See [@createvibe/replayproxy](https://github.com/createvibe/replayproxy) for a full implementation.

Run it on RunKit [https://runkit.com/createvibe/5fd44d27b15b68001a522831](https://runkit.com/createvibe/5fd44d27b15b68001a522831).

```
const proxyobserver = require('@createvibe/proxyobserver');
const makeReference = require('@createvibe/proxyobserver/lib/makeReference');

const data = {initializing: true};
const reverse = [];

const proxy = proxyobserver(data, function() {
    const chain = Array.prototype.slice.call(arguments);
    const root = chain[0];
    const leaf = chain[chain.length - 1];
    const path = chain.map(link => link.prop);
    const observed = {chain: chain.slice(), root, leaf, path};
    leaf.value = leaf.value && JSON.parse(JSON.stringify(leaf.value)) || leaf.value;
    leaf.oldValue = leaf.oldValue && JSON.parse(JSON.stringify(leaf.oldValue)) || leaf.oldValue;
    reverse.push(() => {
        if (leaf.oldValue === undefined) {
            return Reflect.deleteProperty(leaf.target, leaf.prop);
        }
        const reference = makeReference(observed, proxy);
        if (leaf.prop in reference) {
            return Reflect.set(reference, leaf.prop, leaf.oldValue, leaf.receiver);
        }
        Reflect.defineProperty(reference, leaf.prop, {
            value: leaf.oldValue,
            enumerable: true,
            configurable: true,
            writable: true
        });
    });
});
```
Continue manipulating and mutating the proxy object.

```
// remove the initializing flag
delete proxy.initializing;

// add data to the object
proxy.one = 'test';
proxy.two = [1,2,3];
proxy.three = {
    nested: [4,5,6],
    data: {value: 'test'}
};

// modify data in the object
proxy.one = 'modified';
proxy.two[1] = 'test';
proxy.three.data.value = 'modified';
proxy.three.nested.push(7);
proxy.three.nested.splice(0,0,3);

// delete data
delete proxy.one;

// proxy.one === undefined

console.log('the updated data', JSON.stringify(data));
```
Now undo the last action.

```

reverse.pop().call(null);

// proxy.one === 'modified'

```
Now undo the rest of the changes.

```
// now reverse the rest of the changes!
while (reverse.length !== 0) {
    reverse.pop().call(null);
}
```
