// Self-check for the dice-set roll. Run: node src/lib/dice3d.test.mjs
import assert from 'node:assert';
import { rollDiceSet, sumIfNumeric } from './dice3d.js';

let n = 0;
const ok = (m) => { n++; console.log(`  ok ${n} - ${m}`); };
const seq = (vals) => { const q = [...vals]; return () => (q.length ? q.shift() : 0); };

// bounds + label mapping
{
  const set = [
    { id: 'a', faces: ['1', '2', '3', '4', '5', '6'] },
    { id: 'b', faces: ['hit', 'miss'] },
  ];
  // rng 0 → idx 0 (die a → '1'); rng 0.99 → idx 1 (die b → 'miss')
  const res = rollDiceSet(set, seq([0, 0.99]));
  assert.deepEqual(res, [{ id: 'a', idx: 0, label: '1' }, { id: 'b', idx: 1, label: 'miss' }]);
  ok('rollDiceSet maps idx → label, in bounds');
}

// upper bound clamp (rng→0.999 picks last face)
{
  const res = rollDiceSet([{ id: 'd', faces: ['x', 'y', 'z'] }], seq([0.999]));
  assert.equal(res[0].idx, 2, 'last face when rng≈1');
  ok('upper-bound face');
}

// sum when numeric
{
  const res = [{ label: '3' }, { label: '4' }, { label: '10' }];
  assert.equal(sumIfNumeric(res), 17, 'numeric labels sum');
  ok('sumIfNumeric sums numbers');
}

// null when any non-numeric
{
  assert.equal(sumIfNumeric([{ label: '3' }, { label: 'hit' }]), null, 'non-numeric → null');
  assert.equal(sumIfNumeric([{ label: '' }]), null, 'empty → null');
  ok('sumIfNumeric null on non-numeric');
}

console.log(`\nAll ${n} checks passed.`);
