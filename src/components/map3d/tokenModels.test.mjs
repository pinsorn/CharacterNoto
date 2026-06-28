// node src/components/map3d/tokenModels.test.mjs — light checks (loadTokenModel needs a browser).
import assert from 'node:assert';
import { SUPPORTED_MODEL_FORMATS, formatFromName } from './tokenModels.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; };

t('formats', () => {
  for (const f of ['glb', 'gltf', 'obj', 'stl']) assert.ok(SUPPORTED_MODEL_FORMATS.includes(f), f);
});
t('formatFromName by extension (case-insensitive)', () => {
  assert.strictEqual(formatFromName('hero.glb'), 'glb');
  assert.strictEqual(formatFromName('HERO.GLTF'), 'gltf');
  assert.strictEqual(formatFromName('rock.obj'), 'obj');
  assert.strictEqual(formatFromName('print.STL'), 'stl');
  assert.strictEqual(formatFromName('avatar.png'), null);
  assert.strictEqual(formatFromName(''), null);
});

console.log(`tokenModels: ${pass} passed, 0 failed`);
