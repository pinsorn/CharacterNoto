// Self-check for the public-view filter. Run: node src/lib/publicview.test.mjs
import assert from 'node:assert';
import { buildPublicView, imageIdsOf } from './publicview.js';

let n = 0;
const ok = (m) => { n++; console.log(`  ok ${n} - ${m}`); };

const state = {
  characters: [
    { id: 'a', name: 'Rio', avatarId: 'img1' },
    { id: 'b', name: 'SecretNPC', hidden: true, avatarId: 'img2' },
  ],
  badges: [{ name: 'x' }],
  itemDatabase: [{ name: 'apple' }, { name: 'dmOnly', hidden: true }],
  craftingRecipes: [{ name: 'bread' }],
  mapData: { backgroundId: 'bg1', regions: [{ id: 'r1', name: 'Forest' }, { id: 'r2', name: 'Trap', hidden: true }] },
  relationships: { axes: [{ id: 'ax' }], edges: [{ id: 'e1' }, { id: 'e2', hidden: true }], positions: {} },
  diceSet: [{ id: 'd1', faces: ['1', '2'] }],
};

// only shared tabs appear
{
  const v = buildPublicView(state, { characters: true, items: false, map: true });
  assert.ok(v.characters, 'characters shared');
  assert.ok(!('itemDatabase' in v), 'items not shared → absent');
  assert.ok(v.mapData, 'map shared');
  assert.ok(!('relationships' in v), 'relationships not shared → absent');
  ok('only shared tabs included');
}

// hidden entities filtered out
{
  const v = buildPublicView(state, { characters: true, items: true, map: true, relationships: true });
  assert.deepEqual(v.characters.map((c) => c.name), ['Rio'], 'hidden character dropped');
  assert.deepEqual(v.itemDatabase.map((i) => i.name), ['apple'], 'hidden item dropped');
  assert.deepEqual(v.mapData.regions.map((r) => r.name), ['Forest'], 'hidden region dropped');
  assert.deepEqual(v.relationships.edges.map((e) => e.id), ['e1'], 'hidden edge dropped');
  ok('hidden entities filtered');
}

// image ids only for visible entities
{
  const v = buildPublicView(state, { characters: true, map: true });
  const ids = imageIdsOf(v).sort();
  assert.deepEqual(ids, ['bg1', 'img1'], 'img2 (hidden NPC avatar) excluded, img1 + bg1 kept');
  ok('imageIdsOf excludes hidden-entity images');
}

// nothing shared → minimal view (share + hides maps only, no data)
{
  const v = buildPublicView(state, {});
  assert.deepEqual(Object.keys(v).sort(), ['hides', 'share'], 'empty share → only share+hides maps');
  ok('empty share → nothing leaked');
}

// DM-forced hides pass through to the view
{
  const v = buildPublicView(state, { characters: true }, { charItems: true, relLabels: true });
  assert.equal(v.hides.charItems, true, 'hides carried');
  assert.equal(v.hides.relLabels, true, 'hides carried (2)');
  ok('hides pass through');
}

console.log(`\nAll ${n} checks passed.`);
