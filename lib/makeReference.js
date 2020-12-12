/*
 * This file is part of the @createvibe/proxyobserver project.
 *
 * (c) Anthony Matarazzo <email@anthonym.us>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Make a reference to the inner-most link in an object-chain
 * @param {{}} observed Information about an observed modification / mutation
 * @param {*} reference The source object before any changes
 * @return {*}
 */
function makeReference(observed, reference) {
    let node;
    const chain = observed.chain.slice(0, -1);
    while (node = chain.shift()) {
        const { prop, oldValue } = node;
        if (!(prop in reference)) {
            Reflect.defineProperty(reference, prop, {
                value: oldValue,
                enumerable: true,
                configurable: true,
                writable: true
            });
        }
        reference = reference[prop];
    }
    return reference;
}
module.exports = makeReference;