// Token mesh builder for the 3D voxel map. Pure module — the ONLY dependency is the THREE
// instance the caller passes in, so it imports/runs cleanly in node tests (no stores, no Svelte,
// no top-level three import). A token is a 3D marker (creature/object/marker) placed on the voxel
// grid: 1 grid cell == 1 voxel column, world coords == voxel coords, 1 unit == 1 cell.
//
// Each token renders as a THREE.Group (userData.tokenId == token.id) containing:
//   • a thin base disc (CylinderGeometry) in the token colour,
//   • a body cone (lighter shade of the colour),
//   • a small facing notch (box at +Z on the base) so `facing` reads,
//   • a billboard label Sprite (CanvasTexture: white initial on the token colour) above the body.
// Geometries are created once per token; syncTokenGroup updates survivors via .scale / colour /
// label texture only (no per-frame rebuilds). Dispose mirrors DiceScene's disposeMesh traversal.

/** @typedef {{ foot:number, scale:number }} SizeSpec */

/** Size table: foot = footprint cells per side, scale = body/label scale. */
export const SIZES = {
  tiny: { foot: 1, scale: 0.6 },
  small: { foot: 1, scale: 0.8 },
  medium: { foot: 1, scale: 1 },
  large: { foot: 2, scale: 1.5 },
  huge: { foot: 3, scale: 2.2 },
  gargantuan: { foot: 4, scale: 3 },
};

const DEFAULT_COLOR = '#7c3aed';

/** @param {*} THREE @returns {*} the scene group to hold all token meshes. */
export function createTokenGroup(THREE) {
  const g = new THREE.Group();
  g.name = 'tokens';
  return g;
}

function sizeOf(token) {
  return SIZES[token.size] || SIZES.medium;
}

function resolveColor(token, charLookup) {
  const c = token.charId ? charLookup(token.charId) : null;
  return token.color || c?.color || DEFAULT_COLOR;
}

// First initial: creature uses the looked-up character name, else the token label.
function initialFor(token, charLookup) {
  const c = token.charId ? charLookup(token.charId) : null;
  const src = (c && c.name) || token.label || '?';
  return (String(src).trim()[0] || '?').toUpperCase();
}

// Lighter shade of a hex colour (lerp toward white).
function lighten(THREE, hex, amt) {
  return new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amt);
}

// White initial drawn on a filled disc of the token colour → CanvasTexture for the label sprite.
// Guarded by the caller; only invoked when `document` exists.
function makeLabelTexture(THREE, initial, colorHex) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = colorHex;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(s * 0.62)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, s / 2, s / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

// Build a token group once. Geometries are unit-ish; transforms/colours are set by updateToken.
function buildToken(THREE, token) {
  const grp = new THREE.Group();
  grp.userData.tokenId = token.id;

  // base disc: natural radius 0.45 → scaled by foot in x/z on update.
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20),
    new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 })
  );
  grp.add(base);

  // body cone: centred geometry → scaled uniformly and lifted so its base sits on the disc.
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.9, 16),
    new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 })
  );
  grp.add(body);

  // facing notch at +Z on the base edge (whole group rotates by facing, so this points "forward").
  const notch = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.2),
    new THREE.MeshStandardMaterial({ roughness: 0.6 })
  );
  grp.add(notch);

  // billboard label sprite — skipped in node (no document) so the module still imports/runs.
  let label = null;
  if (typeof document !== 'undefined') {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ transparent: true, depthTest: false })
    );
    sprite.userData.key = ''; // forces updateToken to create the texture once.
    grp.add(sprite);
    label = sprite;
  }

  grp.userData.parts = { base, body, notch, label };
  return grp;
}

// Update an existing token group's transform / colour / label to match the token (cheap; called
// on every sync). Size changes are pure .scale tweaks — no geometry rebuild.
function updateToken(THREE, grp, token, charLookup, heightAt) {
  const { foot, scale: s } = sizeOf(token);
  const colorHex = resolveColor(token, charLookup);
  const { base, body, notch, label } = grp.userData.parts;

  const gx = token.cell?.gx ?? 0;
  const gz = token.cell?.gz ?? 0;
  const baseY = token.heightOverride != null ? token.heightOverride : heightAt(gx, gz);
  grp.position.set(gx + 0.5, baseY, gz + 0.5);
  // facing = yaw (Y); optional pitch (X) / roll (Z) for tilted / flying tokens. Radians.
  grp.rotation.set(token.pitch || 0, token.facing || 0, token.roll || 0);

  base.scale.set(foot, 1, foot);
  base.position.set(0, 0.04, 0);
  base.material.color.set(colorHex);

  body.scale.set(s, s, s);
  body.position.set(0, 0.08 + 0.45 * s, 0); // cone half-height 0.45 → base rests on the disc top
  body.material.color.copy(lighten(THREE, colorHex, 0.35));

  notch.scale.set(s, 1, s);
  notch.position.set(0, 0.06, 0.45 * foot);
  notch.material.color.copy(lighten(THREE, colorHex, 0.55));

  if (label) {
    label.scale.set(0.7 * s, 0.7 * s, 1);
    label.position.set(0, 0.08 + 0.9 * s + 0.4 * s, 0);
    const initial = initialFor(token, charLookup);
    const key = initial + '|' + colorHex;
    if (label.userData.key !== key) {
      const old = label.material.map;
      label.material.map = makeLabelTexture(THREE, initial, colorHex);
      label.material.needsUpdate = true;
      if (old) old.dispose();
      label.userData.key = key;
    }
  }
}

/**
 * Reconcile `group`'s children to `tokens`, diffing by child.userData.tokenId:
 * add new, remove+dispose deleted, update transform/colour/label on survivors.
 * @param {*} group token group from createTokenGroup
 * @param {Array} tokens token objects
 * @param {(charId:string)=>({name:string,color?:string}|null)} charLookup
 * @param {(gx:number,gz:number)=>number} heightAt surface top y for placement
 * @param {*} THREE
 */
export function syncTokenGroup(group, tokens, charLookup, heightAt, THREE) {
  const want = new Map(tokens.map((t) => [t.id, t]));
  // remove + dispose tokens that no longer exist
  for (const child of [...group.children]) {
    if (!want.has(child.userData.tokenId)) {
      group.remove(child);
      disposeOne(child);
    }
  }
  // add new, update survivors
  const have = new Map(group.children.map((c) => [c.userData.tokenId, c]));
  for (const token of tokens) {
    let grp = have.get(token.id);
    if (!grp) {
      grp = buildToken(THREE, token);
      group.add(grp);
    }
    updateToken(THREE, grp, token, charLookup, heightAt);
  }
}

// Dispose every geometry/material/texture under a root (mirrors DiceScene.disposeMesh).
function disposeOne(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

/** Dispose all child geometries/materials/textures of the token group. */
export function disposeTokenGroup(group) {
  disposeOne(group);
}
