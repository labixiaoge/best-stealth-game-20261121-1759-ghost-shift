// Seeded randomness for GHOST SHIFT: one tiny mulberry32 generator plus the
// helpers the world and the renderer use. A fixed seed makes a level's
// decoration (dust, speckles, book spines) identical on every load, so the
// screenshots are reproducible.
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max] from the generator. */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of the array, picked by the generator. */
export function randomPick(random, array) {
  return array[Math.floor(random() * array.length)];
}
