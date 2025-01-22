const identity = (x) => x;

/**
 * @param {{[p: string]: T}} obj
 * @param {Set} keys
 * @param {function([PropertyKey, any]): [PropertyKey, any]} mapper
 */
export function selectKeys(obj, keys, mapper = identity) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([key]) => keys.has(key))
      .map(mapper),
  );
}
