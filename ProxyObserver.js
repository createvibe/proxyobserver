/*
 * This file is part of the @createvibe/proxyobserver project.
 *
 * (c) Anthony Matarazzo <email@anthonym.us>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * The ProxyObserver recursively wraps complex objects for observations
 * @param {{}|[]} target The target you want to observe
 * @param {function} observer
 * @throws TypeError if observer is not a function
 */
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
module.exports = ProxyObserver;