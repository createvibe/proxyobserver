const ProxyObserver = require('proxyobserver');

function getData() {
	return {
	    one: 'foo',
	    two: [1,'two',3,'four',5,[6,7]],
	    three: {
	        foo: 'test',
	        bar: 'this'
	    }
	};
};

describe('it should work', () => {

	test('it should wrap an object in a Proxy', () => {
		const data = getData();
		const proxy = ProxyObserver(data, function() { }); 
		expect(proxy.one).toEqual(data.one);
		expect(proxy.two).toEqual(data.two);
		expect(proxy.three).toEqual(data.three);
		proxy.one = 'modified';
		expect(proxy.one).toEqual('modified');
		expect(data.one).toEqual('modified');
	});

	test('it should observe shallow changes to an object', () => {
		let chain, link;
		const data = getData();
		const proxy = ProxyObserver(data, function() {
			chain = Array.prototype.slice.call(arguments);
			expect(chain.length).toBe(1);
			link = chain.shift();
		});
		expect(data.one).toEqual('foo');
		expect(proxy.one).toEqual('foo');
		proxy.one = 'modified';
		expect(link.prop).toEqual('one');
		expect(link.value).toEqual('modified');
		expect(link.oldValue).toEqual('foo');
		expect(data.one).toEqual('modified');
	});

	test('it should observe an array', () => {
		let link = {};
		const array = getData().two;
		const proxy = ProxyObserver(array, function() {
			const chain = Array.prototype.slice.call(arguments);
			link = chain.shift();
		});
		expect(array[1]).toEqual('two');
		expect(proxy[1]).toEqual('two');
		proxy[1] = 'modified';
		expect(link.prop).toEqual('1');
		expect(link.value).toEqual('modified');
		expect(link.oldValue).toEqual('two');
		expect(proxy[1]).toEqual('modified');
		expect(array[1]).toEqual('modified');
	});

	test('it should should observe an instance of a user defined class', () => {
		const Test = (function() {
			const symbol = Symbol();
			class Test {
				constructor() {
					this.foo = 'I am public';
					Object.defineProperty(this, symbol, {
						value: 'I am super private!',
						emumerable: false,
						writable: true,
						configurable: false,
					});
				}
				setPrivateData(data) {
					Reflect.set(this, symbol, data);
				}
				getPrivateData() {
					return Reflect.get(this, symbol);
				}
				setProperty(name, value) {
					Reflect.set(this, name, value);
				}
				removeProperty(name) {
					Reflect.deleteProperty(this, name);
				}
			}
			return Test;
		})();
		let chain, root, leaf;
		const instance = new Test();
		const proxy = ProxyObserver(instance, function() {
			chain = Array.prototype.slice.call(arguments);
			root = chain[0];
			leaf = chain[Math.min(chain.length - 1, 0)];
		});
		expect(proxy.getPrivateData()).toEqual('I am super private!');
		expect(instance.getPrivateData()).toEqual('I am super private!');
		proxy.setPrivateData('You cannot access me directly!');
		expect(proxy.getPrivateData()).toEqual('You cannot access me directly!');
		expect(instance.getPrivateData()).toEqual('You cannot access me directly!');
		expect(chain.length).toBe(1);
		expect(typeof leaf.prop).toEqual('symbol');
		expect(leaf.value).toEqual('You cannot access me directly!');
		expect(leaf.oldValue).toEqual('I am super private!');
		expect(proxy.getPrivateData()).toEqual('You cannot access me directly!');
		expect(instance.getPrivateData()).toEqual('You cannot access me directly!');
		expect(proxy[leaf.prop]).toEqual('You cannot access me directly!');
		expect(instance[leaf.prop]).toEqual('You cannot access me directly!');
		proxy[leaf.prop] = 'I changed a private thing';
		expect(chain.length).toBe(1);
		expect(leaf.value).toEqual('I changed a private thing');
		expect(leaf.oldValue).toEqual('You cannot access me directly!');
		expect(instance.getPrivateData()).toEqual('I changed a private thing');
		proxy.foo = 'I changed a public thing';
		expect(chain.length).toBe(1);
		expect(root.prop).toEqual('foo');
		expect(leaf.prop).toEqual('foo');
		expect(leaf.value).toEqual('I changed a public thing');
		expect(leaf.oldValue).toEqual('I am public');
		expect(instance.foo).toEqual('I changed a public thing');
		proxy.setProperty('newProperty', 'I made a new thing');
		expect(chain.length).toBe(1);
		expect(leaf.prop).toEqual('newProperty');
		expect(leaf.value).toEqual('I made a new thing');
		expect(leaf.oldValue).toEqual(undefined);
		expect(instance.newProperty).toEqual('I made a new thing');
		proxy.newProperty = 'modified';
		expect(chain.length).toBe(1);
		expect(leaf.prop).toEqual('newProperty');
		expect(leaf.value).toEqual('modified');
		expect(leaf.oldValue).toEqual('I made a new thing');
		expect(instance.newProperty).toEqual('modified');
		proxy.removeProperty('newProperty');
		expect(chain.length).toBe(1);
		expect(leaf.prop).toEqual('newProperty');
		expect(leaf.value).toEqual('modified');
		expect(leaf.oldValue).toEqual('I made a new thing');
		expect(instance.newProperty).toEqual(undefined);
	});

});

describe('it should observe deep changes to nested objects', () => {
	
	let chain, proxy, data, root, leaf;

	beforeEach(() => {
		chain = undefined;
		data = getData();
		proxy = ProxyObserver(data, function() {
			chain = Array.prototype.slice.call(arguments);
			root = chain[0];
			leaf = chain[ chain.length - 1 ];
		});
	});

	test('it should observe a shallow array property', () => {
		expect(data.two[1]).toEqual('two');
		expect(proxy.two[1]).toEqual('two');
		proxy.two[1] = 'modified';
		expect(root.prop).toBe('two');
		expect(leaf.prop).toEqual('1');
		expect(leaf.value).toEqual('modified');
		expect(leaf.oldValue).toEqual('two');
		expect(proxy.two[1]).toEqual('modified');
		expect(data.two[1]).toEqual('modified');
	});

	test('it should observe a nested array inside a shallow array property', () => {
		expect(data).toEqual(expect.objectContaining({two: [1,'two',3,'four',5,[6,7]]}));
		expect(proxy.two[5]).toEqual([6,7]);
		proxy.two[5].push(8);
		expect(chain.length).toEqual(3);
		expect(root.prop).toEqual('two');
		expect(leaf.prop).toEqual('2');
		expect(leaf.value).toEqual(8);
		expect(leaf.oldValue).toEqual(undefined);
		expect(chain[ chain.length - 2 ].prop).toEqual('5');
		expect(data.two[5]).toEqual([6,7,8]);
	});

	test('it should observe a nested object', () => {
		proxy.three.foo = 'modified';
		expect(chain.length).toBe(2);
		expect(leaf.prop).toEqual('foo');
		expect(leaf.value).toEqual('modified');
		expect(leaf.oldValue).toEqual('test');
		expect(data.three.foo).toEqual('modified');
	});

	test('it should create and observe a new nested object', () => {
		expect(typeof data.three.newProperty).toEqual('undefined');
		proxy.three.newProperty = {
			string: 'test',
			list: [1,2,3],
			data: {
				string: 'test'
			}
		};
		expect(chain.length).toBe(2);
		expect(leaf.prop).toEqual('newProperty');
		expect(typeof data.three.newProperty).toEqual('object');
		proxy.three.newProperty.data.string = 'modified';
		expect(chain.length).toBe(4);
		expect(leaf.prop).toEqual('string');
		expect(leaf.value).toEqual('modified');
		expect(leaf.oldValue).toEqual('test');
		expect(data.three.newProperty.data.string).toEqual('modified');
	});

});