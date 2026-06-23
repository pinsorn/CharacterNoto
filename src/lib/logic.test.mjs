// Self-check for the parity-critical pure logic. Run: node src/lib/logic.test.mjs
// No framework — plain assertions. Fails loud if ported behavior drifts from legacy.
import assert from 'node:assert';
import { applyItemEffects } from './effects.js';
import { maxCraftable, canCraft, craft } from './crafting.js';
import { validateItemDatabase, addMissingItemsFromInventories } from './normalize.js';
import { parseImport } from './io.js';

let n = 0;
const ok = (msg) => { n++; console.log(`  ok ${n} - ${msg}`); };

// --- effects: stat ---
{
  const c = { name: 'X', hunger: 90 };
  applyItemEffects(c, { effects: [{ type: 'stat', target: 'hunger', action: 'add', value: '20' }] });
  assert.equal(c.hunger, 100, 'stat add clamps to 100'); ok('stat add clamps to 100');

  applyItemEffects(c, { effects: [{ type: 'stat', target: 'hunger', action: 'subtract', value: '150' }] });
  assert.equal(c.hunger, 0, 'stat subtract clamps to 0'); ok('stat subtract clamps to 0');

  const c2 = { name: 'Y' };
  applyItemEffects(c2, { effects: [{ type: 'stat', target: 'mana', action: 'add', value: '10' }] });
  assert.equal(c2.mana, 60, 'missing stat seeds 50 then applies'); ok('missing stat seeds 50 then applies');
}

// --- effects: custom range + checkbox ---
{
  const c = { name: 'Z', custom: {} };
  applyItemEffects(c, { effects: [{ type: 'custom', target: 'mood', action: 'set', value: '200' }] });
  assert.equal(c.custom.mood.value, 100, 'custom range auto-creates and clamps to max');
  ok('custom range auto-creates + clamps');

  applyItemEffects(c, { effects: [{ type: 'custom', target: 'wet', paramType: 'checkbox', action: 'add', value: 'true' }] });
  assert.equal(c.custom.wet.value, true, 'checkbox set true (action ignored)');
  ok('checkbox set true');
  applyItemEffects(c, { effects: [{ type: 'custom', target: 'wet', action: 'set', value: 'false' }] });
  assert.equal(c.custom.wet.value, false, 'checkbox set false'); ok('checkbox set false');
}

// --- crafting ---
{
  const recipe = { materials: [{ name: 'wood', quantity: 2 }, { name: 'iron', quantity: 1 }], outputs: [{ name: 'axe', quantity: 1 }] };
  const c = { items: [{ name: 'wood', amount: 5 }, { name: 'iron', amount: 3 }] };
  assert.equal(maxCraftable(c, recipe), 2, 'maxCraftable = min(floor(5/2),floor(3/1))=2'); ok('maxCraftable normal');

  const noMat = { materials: [], outputs: [{ name: 'gift', quantity: 1 }] };
  assert.equal(maxCraftable(c, noMat), 1, 'no-materials recipe clamps Infinity to 1'); ok('Infinity edge -> 1');

  assert.equal(canCraft(c, recipe, 3), false, 'cannot craft 3 (only 2 worth of mats)'); ok('canCraft insufficient');
  assert.equal(craft(c, recipe, 2), true, 'craft 2 succeeds');
  assert.equal(c.items.find((i) => i.name === 'wood').amount, 1, 'wood 5-(2*2)=1');
  assert.equal(c.items.find((i) => i.name === 'iron').amount, 1, 'iron 3-(1*2)=1');
  assert.equal(c.items.find((i) => i.name === 'axe').amount, 2, 'axe output 1*2=2');
  ok('craft consumes materials + adds output');
}

// --- crafting: splice at <=0 ---
{
  const recipe = { materials: [{ name: 'stick', quantity: 1 }], outputs: [{ name: 'fire', quantity: 1 }] };
  const c = { items: [{ name: 'stick', amount: 1 }] };
  craft(c, recipe, 1);
  assert.equal(c.items.find((i) => i.name === 'stick'), undefined, 'stick spliced at 0');
  assert.equal(c.items.find((i) => i.name === 'fire').amount, 1, 'fire added');
  ok('material spliced at 0, output added');
}

// --- normalize ---
{
  const cleaned = validateItemDatabase([
    { name: ' Apple ' }, { name: 'apple' }, { name: '' }, { name: 'Sword', effects: null },
  ]);
  assert.equal(cleaned.length, 2, 'dedup case-insensitive + drop empty');
  assert.equal(cleaned[0].name, 'Apple', 'trimmed, first wins');
  assert.deepEqual(cleaned[1].effects, [], 'effects coerced to []');
  ok('validateItemDatabase dedup/trim/coerce');

  const merged = addMissingItemsFromInventories(
    [{ name: 'Apple', howToObtain: '', description: '', effects: [] }],
    [{ items: [{ name: 'apple', amount: 1 }, { name: 'Banana', amount: 2 }] }],
  );
  assert.equal(merged.length, 2, 'apple already present (case-insensitive), Banana added');
  assert.equal(merged[1].name, 'Banana'); ok('addMissingItemsFromInventories case-insensitive');
}

// --- io import quirk ---
{
  const a = parseImport('{"characters":[{"name":"A"}],"badges":[]}');
  assert.equal(a.characters[0].name, 'A', 'reads .characters key'); ok('import reads .characters');
  const b = parseImport('[{"name":"B"}]');
  assert.equal(b.characters[0].name, 'B', 'bare array payload IS characters'); ok('import bare-array quirk');
}

console.log(`\nAll ${n} checks passed.`);
