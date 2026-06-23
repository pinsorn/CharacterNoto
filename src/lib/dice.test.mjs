// Self-check for dice roller. Run: node src/lib/dice.test.mjs
import assert from 'node:assert';
import { rollDice } from './dice.js';

let n = 0;
const ok = (m) => { n++; console.log(`  ok ${n} - ${m}`); };
const seq = (vals) => { const q = [...vals]; return () => (q.length ? q.shift() : 0); };

// 2d6+3 with both dice maxed (rng 0.99 → 6): 6+6+3 = 15
{
  const r = rollDice('2d6+3', seq([0.99, 0.99]));
  assert.equal(r.total, 15, '2d6+3 maxed = 15');
  assert.deepEqual(r.terms[0].rolls, [6, 6], 'two d6 rolls');
  ok('2d6+3 maxed');
}

// 1d20 minimum (rng 0 → 1)
{
  const r = rollDice('1d20', seq([0]));
  assert.equal(r.total, 1, 'd20 min = 1');
  ok('1d20 min');
}

// implicit count: d8 == 1d8
{
  const r = rollDice('d8', seq([0.5]));
  assert.equal(r.terms[0].rolls.length, 1, 'd8 = one die');
  ok('implicit single die');
}

// subtraction + multiple terms: 1d6-2 with roll 4 → 2
{
  const r = rollDice('1d6-2', seq([0.5])); // 1+floor(0.5*6)=4
  assert.equal(r.total, 2, '4 - 2 = 2');
  ok('subtraction term');
}

// mixed: 2d6+1d4+2, rolls 6,6 and 4, +2 → 18
{
  const r = rollDice('2d6+1d4+2', seq([0.99, 0.99, 0.99]));
  assert.equal(r.total, 6 + 6 + 4 + 2, 'mixed terms');
  ok('mixed dice + flat');
}

// flat only
{
  assert.equal(rollDice('5', seq([])).total, 5, 'flat 5');
  ok('flat constant');
}

// invalid throws
{
  assert.throws(() => rollDice('', seq([])), 'empty throws');
  assert.throws(() => rollDice('2x6', seq([])), 'garbage throws');
  ok('invalid input throws');
}

console.log(`\nAll ${n} checks passed.`);
