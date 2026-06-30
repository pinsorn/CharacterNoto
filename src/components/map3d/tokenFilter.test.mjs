// Runnable check: node src/components/map3d/tokenFilter.test.mjs
import assert from 'node:assert';
import { filterTokens } from './tokenFilter.js';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('ok   -', n); } catch (e) { fail++; console.error('FAIL -', n, '\n      ', e.message); } };
const toks = [
  { id: '1', label: 'Goblin', cell: { gx: 1, gz: 2 } },
  { id: '2', label: 'Hero Knight', cell: { gx: 3, gz: 4 } },
  { id: '3', label: 'goblin scout', cell: { gx: 5, gz: 6 } },
];

t('empty query returns all', () => assert.equal(filterTokens(toks, '').length, 3));
t('blank/whitespace returns all', () => assert.equal(filterTokens(toks, '  ').length, 3));
t('case-insensitive label match', () => assert.equal(filterTokens(toks, 'goblin').length, 2));
t('partial match', () => assert.equal(filterTokens(toks, 'knight').length, 1));
t('no match returns empty', () => assert.equal(filterTokens(toks, 'dragon').length, 0));
t('null tokens -> empty', () => assert.equal(filterTokens(null, 'x').length, 0));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
