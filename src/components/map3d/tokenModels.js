// Imported 3D model loader for tokens (spec §8/§11): glTF/GLB, OBJ, STL → a normalized,
// clone-ready THREE.Group standing on its base (height ≈ 1.2 units, centered on X/Z). Cached by
// url so repeated tokens of the same model don't re-parse. (FBX deferred — heavy/best-effort.)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export const SUPPORTED_MODEL_FORMATS = ['glb', 'gltf', 'obj', 'stl'];

/** Extension → supported format (or null). */
export function formatFromName(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  return SUPPORTED_MODEL_FORMATS.includes(ext) ? ext : null;
}

const cache = new Map(); // url -> Promise<Group template>

async function parse(url, format) {
  let obj;
  if (format === 'glb' || format === 'gltf') {
    const g = await new GLTFLoader().loadAsync(url);
    obj = g.scene;
    obj.userData.clips = g.animations || [];
  } else if (format === 'obj') {
    obj = await new OBJLoader().loadAsync(url);
    obj.traverse((o) => {
      if (o.isMesh && !o.material) o.material = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.8 });
    });
  } else if (format === 'stl') {
    const geo = await new STLLoader().loadAsync(url);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    obj = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.7, metalness: 0.1 }));
  } else {
    throw new Error('Unsupported model format: ' + format);
  }
  // Normalize: scale to ~1.2 units tall, recenter X/Z, base at y=0.
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const scale = size.y > 1e-4 ? 1.2 / size.y : 1;
  obj.scale.setScalar(scale);
  obj.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  const wrap = new THREE.Group();
  wrap.add(obj);
  wrap.userData.clips = obj.userData.clips || [];
  return wrap;
}

/** Load (cached) + return a fresh clone ready to add to the scene. Rejects on parse failure. */
export function loadTokenModel(url, format) {
  if (!cache.has(url)) {
    cache.set(url, parse(url, format).catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url).then((tpl) => {
    const c = tpl.clone(true);
    c.userData.clips = tpl.userData.clips; // share clip data (read-only for AnimationMixer)
    return c;
  });
}

export function clearModelCache() { cache.clear(); }

/** Dispose a cloned model instance's geometries/materials/textures. */
export function disposeTokenModel(group) {
  group?.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}
