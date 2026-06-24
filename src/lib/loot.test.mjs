// Self-check for region loot logic. Run: node src/lib/loot.test.mjs
import assert from 'node:assert';
import { rollRegion, mergeLootIntoItems } from './loot.js';

let n = 0;
const ok = (m) => { n++; console.log(`  ok ${n} - ${m}`); };

// Scripted rng: returns queued values, then 0.
function scriptedRng(values) {
  const q = [...values];
  return () => (q.length ? q.shift() : 0);
}

// dropChance 100 always drops; 0 never.
{
  const region = { items: [
    { name: 'always', dropChance: 100, perRoll: 1, infinite: true },
    { name: 'never', dropChance: 0, perRoll: 1, infinite: true },
  ]};
  // rng sequence: drop-roll for 'always' (0.5 → 50<100 drop), qty-roll (0.0 → 1), drop-roll 'never' (0.5 → 50>=0 skip)
  const loot = rollRegion(region, { randomizeQty: true }, scriptedRng([0.5, 0.0, 0.5]));
  assert.deepEqual(loot, [{ name: 'always', amount: 1 }], '100% drops, 0% never');
  ok('dropChance 100 drops, 0 never');
}

// randomizeQty bounds: randInt(1, perRoll). rng 0.99 → near-max.
{
  const region = { items: [{ name: 'gold', dropChance: 100, perRoll: 10, infinite: true }] };
  const loot = rollRegion(region, { randomizeQty: true }, scriptedRng([0.0, 0.99]));
  assert.equal(loot[0].amount, 1 + Math.floor(0.99 * 10), 'randInt(1,10) upper'); // = 10
  ok('randomizeQty bounds [1..perRoll]');
}

// randomizeQty=false → full perRoll.
{
  const region = { items: [{ name: 'gold', dropChance: 100, perRoll: 7, infinite: true }] };
  const loot = rollRegion(region, { randomizeQty: false }, scriptedRng([0.0]));
  assert.equal(loot[0].amount, 7, 'fixed perRoll when not randomized');
  ok('randomizeQty=false → perRoll');
}

// Finite depletion: stock 3, perRoll 10, not randomized → drop min(10,3)=3, stock→0; next roll skipped.
{
  const region = { items: [{ name: 'apple', dropChance: 100, perRoll: 10, infinite: false, stock: 3 }] };
  const first = rollRegion(region, { randomizeQty: false }, scriptedRng([0.0]));
  assert.deepEqual(first, [{ name: 'apple', amount: 3 }], 'takes min(perRoll, stock)');
  assert.equal(region.items[0].stock, 0, 'stock depleted to 0');
  const second = rollRegion(region, { randomizeQty: false }, scriptedRng([0.0]));
  assert.deepEqual(second, [], 'depleted item does not drop');
  ok('finite depletion + skip when empty');
}

// Infinite never depletes.
{
  const region = { items: [{ name: 'inf', dropChance: 100, perRoll: 5, infinite: true, stock: 2 }] };
  rollRegion(region, { randomizeQty: false }, scriptedRng([0.0]));
  assert.equal(region.items[0].stock, 2, 'infinite item stock untouched');
  ok('infinite never depletes');
}

// Empty region → [].
{
  assert.deepEqual(rollRegion({ items: [] }, {}, scriptedRng([])), [], 'empty region');
  ok('empty region → []');
}

// mergeLootIntoItems: case-sensitive merge.
{
  const items = [{ name: 'apple', amount: 1 }];
  mergeLootIntoItems(items, [{ name: 'apple', amount: 2 }, { name: 'Apple', amount: 5 }]);
  assert.equal(items.find((i) => i.name === 'apple').amount, 3, 'apple merged 1+2');
  assert.equal(items.find((i) => i.name === 'Apple').amount, 5, 'Apple separate (case-sensitive)');
  ok('mergeLootIntoItems case-sensitive');
}

// --- weighted mode: pick exactly one by cumulative weight ---
{
  const region = { items: [
    { name: 'a', dropChance: 30, perRoll: 1, infinite: true },
    { name: 'b', dropChance: 70, perRoll: 1, infinite: true },
  ]};
  // rng 0.1 → r = 0.1*100 = 10 < 30 → pick a (randomizeQty off → amount = perRoll = 1)
  let loot = rollRegion(region, { mode: 'weighted', randomizeQty: false }, scriptedRng([0.1]));
  assert.deepEqual(loot, [{ name: 'a', amount: 1 }], 'weighted low r picks first');
  // rng 0.5 → r = 50 → skip a(30), pick b
  loot = rollRegion(region, { mode: 'weighted', randomizeQty: false }, scriptedRng([0.5]));
  assert.deepEqual(loot, [{ name: 'b', amount: 1 }], 'weighted picks by cumulative weight');
  ok('weighted picks one by weight');
}

// --- weighted respects + depletes finite stock; empty pool → [] ---
{
  const region = { items: [{ name: 'x', dropChance: 100, perRoll: 10, infinite: false, stock: 3 }] };
  let loot = rollRegion(region, { mode: 'weighted', randomizeQty: false }, scriptedRng([0.0]));
  assert.deepEqual(loot, [{ name: 'x', amount: 3 }], 'weighted takes min(perRoll, stock)');
  assert.equal(region.items[0].stock, 0, 'weighted depleted stock to 0');
  loot = rollRegion(region, { mode: 'weighted', randomizeQty: false }, scriptedRng([0.0]));
  assert.deepEqual(loot, [], 'weighted empty pool → []');
  ok('weighted depletion + empty pool');
}

console.log(`\nAll ${n} checks passed.`);
