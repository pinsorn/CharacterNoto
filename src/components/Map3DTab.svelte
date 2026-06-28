<script>
  // 3D Map authoring (host-only). Reuses DiceScene's three.js lifecycle (onMount setup → rAF
  // tick → ResizeObserver for hidden-tab 0×0 mount → onDestroy). Spine slice S0: single chunk
  // @5ft, greedy mesh, raycast→cell edit loop, IndexedDB persistence, and a top-down ortho
  // snapshot rendered into mapData.backgroundId so the Map tab shows it as the topview.
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { mapData, characters } from '../lib/stores.js';
  import { putBlob, getBlob, delBlob, newImageId } from '../lib/blobstore.js';
  import { voxelUI, voxelEnv, voxelObjUI } from '../lib/voxel/store.js';
  import { CHUNK, CHUNK_DIM, WORLD_HEIGHT, MAP_SIZES, BIOMES, BLOCKS, colorOf } from '../lib/voxel/types.js';
  import { createChunk, resizeChunk, composeDense, placeBlock, eraseVoxel, surfaceY } from '../lib/voxel/world.js';
  import { greedyMesh } from '../lib/voxel/mesher.js';
  import { saveChunk, loadChunk, loadMeta } from '../lib/voxel/chunkStore.js';
  import { ChunkManager } from './map3d/chunkManager.js';
  import { PAINTER_TOOLS, applyBrush as paintBrush } from './map3d/brushes.js';
  import TokenPanel from './map3d/TokenPanel.svelte';
  import { createTokenGroup, syncTokenGroup, SIZES } from './map3d/tokens.js';
  import { loadTokenModel } from './map3d/tokenModels.js';
  import EnvPanel from './map3d/EnvPanel.svelte';
  import { createEnvironment } from './map3d/environment.js';
  import ObjectPanel from './map3d/ObjectPanel.svelte';
  import { createObjectLayer, syncObjectLayer, scatterInstances, PROPS } from './map3d/objects.js';
  import ObjectEditor from './map3d/ObjectEditor.svelte';
  import { customProps } from '../lib/voxel/customProps.js';
  import { buildPropGeometry } from '../lib/voxel/voxelProp.js';
  import ImageTerrainPanel from './map3d/ImageTerrainPanel.svelte';
  import { imageToHeights, imageToBiomes, imageToObjects } from '../lib/voxel/imageTerrain.js';

  const BLOCK_TOOLS = [
    { id: 'place', label: 'Place Block' },
    { id: 'erase', label: 'Erase' },
  ];
  // Which extra controls the current tool exposes (radius|strength|shape|falloff|target|biome).
  const toolParams = $derived(PAINTER_TOOLS.find((t) => t.id === $voxelUI.tool)?.params ?? []);

  let container;
  let renderer, scene, camera, controls, raf;
  let terrainMesh, terrainMat, gridHelper, pickPlane, topTarget;
  let tokenGroup;
  let objectLayer; // InstancedMesh group for scattered props
  let objSeed = 1;
  let lastScatterKey = null;
  let lastRev = 0; // tracks voxelUI.mapRev to reload when the Image Editor rewrites the map
  let bigMap = $state(false); // chunked map (> single-chunk size): rendered via streaming ChunkManager
  let manager = null; // ChunkManager for chunked maps (null = small single-chunk map)
  let bigTokensSynced = false; // re-snap tokens once the streaming window first meshes
  const VIEW_RADIUS = 2; // Chebyshev chunk radius kept loaded around the camera target (5×5 = 320²)
  let env; // environment system (sky/time/season/weather/fog)
  let envMinute = $state(720); // live clock when animated
  let lastT = 0;
  let lastDense = null; // cached for token surface-snap + remesh-driven re-place
  let chunk = createChunk();
  let dirtyMesh = false;
  let painting = false;
  let draggingTokenId = null;
  let strokeTargetH = 0;
  let strokeSeed = 0; // stable jitter within a stroke, varies per stroke (for roughen)
  let saveTimer, topTimer;
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  let mode = $state('terrain'); // 'terrain' | 'tokens'
  let selectedTokenId = $state(null);
  let possessing = $state(false);
  const look = { yaw: 0, pitch: 0, dragging: false, px: 0, py: 0 };

  // token placement helpers — chunked maps read the streaming manager; small maps the dense cache.
  const heightAt = (gx, gz) => (manager ? manager.heightAt(gx, gz) : lastDense ? surfaceY(lastDense, gx, gz, chunk.size) : 6);
  const mapExtentVox = () => (manager ? manager.extentX : chunk.size); // map side length in voxels
  const charLookup = (id) => {
    const c = get(characters).find((x) => x.id === id);
    return c ? { name: c.name || '?', color: c.color } : null;
  };
  // Imported token models: blob (IndexedDB) → object URL (cached per modelId) → loaded clone.
  const modelUrlCache = new Map();
  async function modelUrlFor(id) {
    if (modelUrlCache.has(id)) return modelUrlCache.get(id);
    const b = await getBlob(id);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    modelUrlCache.set(id, u);
    return u;
  }
  const modelProvider = (token) =>
    token.modelId ? modelUrlFor(token.modelId).then((u) => (u ? loadTokenModel(u, token.modelFormat || 'glb') : null)) : null;

  function syncTokens() {
    if (tokenGroup) syncTokenGroup(tokenGroup, get(mapData).tokens || [], charLookup, heightAt, THREE, modelProvider);
  }
  const PROP_BUILTIN = new Map(PROPS.map((p) => [p.id, p]));
  // Resolve geometry for a propId: built-in library first, else a user voxel prop.
  function geometryFor(pid, T) {
    const b = PROP_BUILTIN.get(pid);
    if (b) return b.build(T);
    const custom = get(customProps).find((p) => p.id === pid);
    return custom ? buildPropGeometry(custom, T) : null;
  }
  function syncObjects() {
    if (objectLayer) syncObjectLayer(objectLayer, get(mapData).objects || [], THREE, geometryFor);
  }
  function appendObjects(arr) {
    if (!arr?.length) return;
    mapData.update((d) => ({ ...d, objects: [...(d.objects || []), ...arr] }));
  }
  // Scatter brush / hand-place props on the terrain surface (objects mode).
  function scatterOrPlace(hit, start) {
    if (!hit) return;
    const o = get(voxelObjUI);
    const gx = clampCell(Math.floor(hit.point.x));
    const gz = clampCell(Math.floor(hit.point.z));
    if (o.mode === 'place') {
      if (!start) return; // one per click
      appendObjects([{ propId: o.propId, pos: { x: gx + 0.5, y: heightAt(gx, gz), z: gz + 0.5 }, yaw: o.yawRandom ? Math.random() * Math.PI * 2 : 0, scale: 1, seed: objSeed++ }]);
      return;
    }
    const key = `${gx},${gz}`;
    if (!start && key === lastScatterKey) return; // throttle: only when the cell changes
    lastScatterKey = key;
    appendObjects(scatterInstances(o.propId, gx, gz, { radius: o.radius, density: o.density, jitter: o.jitter, scaleVar: o.scaleVar, yawRandom: o.yawRandom, size: mapExtentVox() }, heightAt, objSeed++));
  }

  const clampCell = (v) => Math.min(mapExtentVox() - 1, Math.max(0, v));
  const colIdx = (x, z) => z * chunk.size + x;
  const denseGet = (dense) => (x, y, z) => dense[(y * chunk.size + z) * chunk.size + x];

  function rebuild() {
    const dense = composeDense(chunk);
    const m = greedyMesh([chunk.size, WORLD_HEIGHT, chunk.size], denseGet(dense), colorOf);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    g.computeBoundingSphere();
    if (terrainMesh) { terrainMesh.geometry.dispose(); terrainMesh.geometry = g; }
    else { terrainMesh = new THREE.Mesh(g, terrainMat); scene.add(terrainMesh); }
    lastDense = dense;
    syncTokens(); // terrain changed → re-snap token heights
  }

  function applyAt(hit, start) {
    if (!hit) return;
    const ui = get(voxelUI);
    const p = hit.point;
    const n = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0);
    if (ui.tool === 'place' || ui.tool === 'erase') {
      const off = ui.tool === 'place' ? 0.5 : -0.5;
      const x = Math.floor(p.x + n.x * off), y = Math.floor(p.y + n.y * off), z = Math.floor(p.z + n.z * off);
      const edit = (ch, lx, ly, lz) => (ui.tool === 'place' ? placeBlock(ch, lx, ly, lz, ui.blockId) : eraseVoxel(ch, lx, ly, lz));
      if (manager) manager.editBlockAtWorld(x, y, z, edit); // chunked map streams the re-mesh itself
      else { edit(chunk, x, y, z); dirtyMesh = true; }
      return;
    }
    const cx = clampCell(Math.floor(p.x - n.x * 0.01));
    const cz = clampCell(Math.floor(p.z - n.z * 0.01));
    // flatten: one shared baseline for the whole stroke (chunked → read via manager, not the dead chunk).
    if (start && ui.tool === 'flatten') strokeTargetH = manager ? manager.heightAt(cx, cz) : chunk.height[colIdx(cx, cz)];
    const opts = {
      tool: ui.tool, radius: ui.brushRadius, strength: ui.brushStrength,
      shape: ui.brushShape, falloff: ui.brushFalloff, target: ui.targetHeight,
      biomeId: ui.biomeId, seed: strokeSeed,
      baseline: ui.tool === 'flatten' ? strokeTargetH : undefined,
    };
    if (manager) manager.brushAtWorld(cx, cz, ui.brushRadius, (sc, lcx, lcz) => paintBrush(sc, lcx, lcz, opts));
    else { paintBrush(chunk, cx, cz, opts); dirtyMesh = true; }
  }

  function setNdc(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  function pick(e) {
    setNdc(e);
    const targets = manager ? manager.raycastTargets() : [terrainMesh, pickPlane].filter(Boolean);
    const hits = raycaster.intersectObjects(targets);
    return hits[0] || null;
  }
  function pickToken(e) {
    if (!tokenGroup) return null;
    setNdc(e);
    const hits = raycaster.intersectObjects(tokenGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData?.tokenId === undefined) o = o.parent;
      if (o?.userData?.tokenId) return o.userData.tokenId;
    }
    return null;
  }

  // --- token edits (immutable mapData updates → persist + P2P + reactive resync) ---
  function moveToken(id, gx, gz) {
    mapData.update((d) => ({ ...d, tokens: (d.tokens || []).map((t) => (t.id === id ? { ...t, cell: { gx, gz } } : t)) }));
  }
  function rotateSelected(delta) {
    if (!selectedTokenId) return;
    mapData.update((d) => ({ ...d, tokens: (d.tokens || []).map((t) => (t.id === selectedTokenId ? { ...t, facing: (t.facing || 0) + delta } : t)) }));
    scheduleTopview();
  }

  function onPointerDown(e) {
    if (possessing) {
      // POV: look with EITHER left or right drag (right matches build-mode orbit muscle memory).
      if (e.button !== 0 && e.button !== 2) return;
      look.dragging = true; look.px = e.clientX; look.py = e.clientY;
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    if (e.button !== 0) return; // left = act; right = orbit (OrbitControls)
    if (mode === 'tokens') {
      const id = pickToken(e);
      selectedTokenId = id;
      draggingTokenId = id;
      return;
    }
    if (mode === 'objects') {
      painting = true;
      lastScatterKey = null;
      scatterOrPlace(pick(e), true);
      return;
    }
    painting = true;
    strokeSeed++;
    applyAt(pick(e), true);
  }
  function onPointerMove(e) {
    if (possessing) {
      if (!look.dragging) return;
      look.yaw += (e.clientX - look.px) * 0.005;
      look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch - (e.clientY - look.py) * 0.005));
      look.px = e.clientX; look.py = e.clientY;
      return;
    }
    if (draggingTokenId) {
      const hit = pick(e);
      if (hit) moveToken(draggingTokenId, clampCell(Math.floor(hit.point.x)), clampCell(Math.floor(hit.point.z)));
      return;
    }
    if (!painting) return;
    if (mode === 'objects') scatterOrPlace(pick(e), false);
    else applyAt(pick(e), false);
  }
  function onPointerUp(e) {
    if (possessing) { look.dragging = false; try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ } return; }
    if (draggingTokenId) { draggingTokenId = null; scheduleTopview(); return; }
    if (!painting) return;
    painting = false;
    if (mode === 'objects') { scheduleTopview(); return; }
    scheduleSave();
    scheduleTopview();
  }

  // --- possession: cosmetic POV from a token (decision #7, no occlusion) ---
  const keys = new Set();
  function possess(id) {
    const t = (get(mapData).tokens || []).find((x) => x.id === id);
    if (!t || !camera) return;
    const { gx, gz } = t.cell;
    const baseY = t.heightOverride != null ? t.heightOverride : heightAt(gx, gz);
    const scale = SIZES[t.size]?.scale || 1;
    camera.position.set(gx + 0.5, baseY + 1.0 * scale + 0.6, gz + 0.5);
    look.yaw = t.facing || 0; look.pitch = 0;
    camera.fov = 72; camera.updateProjectionMatrix();
    controls.enabled = false;
    possessing = true;
    selectedTokenId = id;
    // hide our own pawn so it doesn't fill the view
    const me = tokenGroup?.children.find((c) => c.userData.tokenId === id);
    if (me) me.visible = false;
  }
  function exitPossession() {
    possessing = false;
    keys.clear();
    controls.enabled = true;
    if (camera) { camera.fov = 50; camera.updateProjectionMatrix(); }
    tokenGroup?.children.forEach((c) => (c.visible = true)); // un-hide the possessed pawn
    syncTokens();
    setPreset(get(voxelUI).cameraPreset);
  }
  function applyLook() {
    const cp = Math.cos(look.pitch);
    const dir = new THREE.Vector3(Math.sin(look.yaw) * cp, Math.sin(look.pitch), Math.cos(look.yaw) * cp);
    if (keys.size) {
      const sp = 0.25;
      const fwd = new THREE.Vector3(Math.sin(look.yaw), 0, Math.cos(look.yaw));
      const right = new THREE.Vector3(Math.cos(look.yaw), 0, -Math.sin(look.yaw));
      if (keys.has('w') || keys.has('arrowup')) camera.position.addScaledVector(fwd, sp);
      if (keys.has('s') || keys.has('arrowdown')) camera.position.addScaledVector(fwd, -sp);
      if (keys.has('d') || keys.has('arrowright')) camera.position.addScaledVector(right, sp);
      if (keys.has('a') || keys.has('arrowleft')) camera.position.addScaledVector(right, -sp);
    }
    camera.lookAt(camera.position.x + dir.x, camera.position.y + dir.y, camera.position.z + dir.z);
  }
  function onKeyDown(e) {
    if (possessing) {
      if (e.key === 'Escape') { exitPossession(); return; }
      keys.add(e.key.toLowerCase());
      return;
    }
    if (mode === 'tokens' && selectedTokenId) {
      if (e.key === 'q' || e.key === 'Q') rotateSelected(Math.PI / 8);
      else if (e.key === 'e' || e.key === 'E') rotateSelected(-Math.PI / 8);
    }
  }
  function onKeyUp(e) { keys.delete(e.key.toLowerCase()); }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => (manager ? manager.save() : saveChunk(get(voxelUI).mapId, chunk)), 500);
  }
  function scheduleTopview() {
    clearTimeout(topTimer);
    topTimer = setTimeout(renderTopview, 350);
  }

  // Top-down ortho snapshot over the FIXED map extent → PNG → mapData.backgroundId.
  // 16:9 framing matches the Map tab box so normalized region polygons stay aligned.
  function renderTopview() {
    if (!renderer || !terrainMesh) return;
    const W = 1024, H = 576;
    if (!topTarget) topTarget = new THREE.WebGLRenderTarget(W, H);
    const ext = chunk.size;
    const halfH = ext / 2, halfW = halfH * (W / H);
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000);
    cam.position.set(ext / 2, WORLD_HEIGHT + 20, ext / 2);
    cam.up.set(0, 0, -1); // north (−Z) up in the image
    cam.lookAt(ext / 2, 0, ext / 2);

    const gv = gridHelper.visible;
    gridHelper.visible = false;
    renderer.setRenderTarget(topTarget);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    gridHelper.visible = gv;

    const buf = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(topTarget, 0, 0, W, H, buf);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) { // GL origin is bottom-left → flip
      const srcRow = (H - 1 - y) * W * 4;
      img.data.set(buf.subarray(srcRow, srcRow + W * 4), y * W * 4);
    }
    ctx.putImageData(img, 0, 0);
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const oldId = get(mapData).backgroundId;
      const id = newImageId();
      await putBlob(id, blob);
      if (oldId) delBlob(oldId);
      mapData.update((d) => ({ ...d, backgroundId: id }));
    }, 'image/png');
  }

  function setPreset(preset) {
    voxelUI.update((u) => ({ ...u, cameraPreset: preset }));
    if (!camera) return;
    if (manager) {
      // Frame the streamed window around the current orbit target (not the whole huge map).
      const t = controls.target, d = CHUNK_DIM * 2.6;
      if (preset === 'top') camera.position.set(t.x, d * 1.7, t.z + 0.001);
      else camera.position.set(t.x + d, d, t.z + d);
      controls.update();
      return;
    }
    const c = chunk.size;
    if (preset === 'top') camera.position.set(c / 2, c * 1.7, c / 2 + 0.001);
    else camera.position.set(c * 1.15, c * 1.0, c * 1.15);
    controls.target.set(c / 2, 0, c / 2);
    controls.update();
  }

  // Switch the view into streaming mode for a chunked (big) map: drop the single-chunk mesh/grid,
  // spin up a ChunkManager, frame the map centre, and prime the first window.
  function setupBigMap(meta) {
    bigMap = true;
    bigTokensSynced = false;
    if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh = null; }
    if (gridHelper) gridHelper.visible = false;
    if (pickPlane) pickPlane.visible = false;
    lastDense = null;
    manager?.dispose();
    manager = new ChunkManager(scene, THREE, get(voxelUI).mapId, meta, terrainMat);
    const cx = manager.extentX / 2, cz = manager.extentZ / 2;
    controls.target.set(cx, 0, cz);
    setPreset(get(voxelUI).cameraPreset);
    manager.setView(cx, cz, VIEW_RADIUS);
  }
  // Leave streaming mode (a big map was replaced by a small single-chunk one).
  function teardownBigMap() {
    bigMap = false;
    manager?.dispose();
    manager = null;
    if (gridHelper) gridHelper.visible = true;
    if (pickPlane) pickPlane.visible = true;
  }

  // (Re)build the ground grid + invisible pick plane sized to the current map.
  function buildGrid() {
    const n = chunk.size;
    if (gridHelper) { scene.remove(gridHelper); gridHelper.geometry?.dispose(); gridHelper.material?.dispose?.(); }
    gridHelper = new THREE.GridHelper(n, n, 0x335577, 0x223344);
    gridHelper.position.set(n / 2, 0.02, n / 2);
    scene.add(gridHelper);
    if (pickPlane) { scene.remove(pickPlane); pickPlane.geometry.dispose(); pickPlane.material.dispose(); }
    pickPlane = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshBasicMaterial({ visible: false }));
    pickPlane.rotation.x = -Math.PI / 2;
    pickPlane.position.set(n / 2, 0, n / 2);
    scene.add(pickPlane);
  }

  function resizeMap(n) {
    if (manager) return; // chunked maps have a fixed grid extent — size is set by the Image Editor
    if (n === chunk.size) return;
    chunk = resizeChunk(chunk, n); // preserves the overlapping region
    voxelUI.update((u) => ({ ...u, mapSize: n }));
    buildGrid();
    rebuild();
    setPreset(get(voxelUI).cameraPreset);
    scheduleSave();
    scheduleTopview();
  }

  function resetMap() {
    if (manager) return; // streaming map: reset/regenerate from the Image Editor
    if (!confirm('Reset the 3D map to flat ground? This clears terrain edits.')) return;
    chunk = createChunk(0, 0, 6, 0, chunk.size);
    rebuild();
    scheduleSave();
    scheduleTopview();
  }

  // Apply an uploaded image to the terrain: height (brightness), biome (colour), or scatter objects.
  function applyImage(imageData, mode, opts) {
    if (manager) return; // single-chunk image import is for small maps; use the Image Editor tab for big maps
    const n = chunk.size;
    if (mode === 'height') {
      chunk.height = imageToHeights(imageData, n, opts);
      chunk.dirty = true;
    } else if (mode === 'biome') {
      chunk.biome = imageToBiomes(imageData, n);
      chunk.dirty = true;
    } else if (mode === 'object') {
      appendObjects(imageToObjects(imageData, n, { ...opts, heightAt }));
    }
    rebuild();
    scheduleSave();
    scheduleTopview();
  }

  onMount(() => {
    const w = container.clientWidth || 800, h = 460;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#9ec7e8');

    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    controls.maxPolarAngle = Math.PI * 0.495;

    // Environment owns all lights + sky + fog (time/season/weather driven).
    env = createEnvironment(scene, THREE);
    env.apply(get(voxelEnv));

    terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

    buildGrid();

    tokenGroup = createTokenGroup(THREE);
    scene.add(tokenGroup);
    objectLayer = createObjectLayer(scene, THREE);
    syncObjects();

    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Load persisted chunk (or start flat), then build + initial topview.
    lastRev = get(voxelUI).mapRev || 0; // baseline so the reload effect only fires on real bumps
    loadMeta(get(voxelUI).mapId).then((meta) => {
      if (meta && (meta.wChunks > 1 || meta.hChunks > 1)) { setupBigMap(meta); return; } // chunked → stream
      loadChunk(get(voxelUI).mapId, 0, 0).then((loaded) => {
        chunk = loaded || createChunk(0, 0, 6, 0, get(voxelUI).mapSize || CHUNK);
        buildGrid(); // size may differ from the initial default
        rebuild();
        setPreset(get(voxelUI).cameraPreset);
        renderer.render(scene, camera);
        if (!get(mapData).backgroundId) renderTopview();
      });
    });

    lastT = performance.now();
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, ((now || performance.now()) - lastT) / 1000);
      lastT = now || performance.now();
      if (possessing) applyLook();
      else controls.update();
      if (env) envMinute = env.update(dt, get(voxelEnv)).minuteOfDay;
      if (manager) {
        manager.setView(controls.target.x, controls.target.z, VIEW_RADIUS); // stream chunks around the orbit target
        if (!bigTokensSynced && manager.loadedCount() > 0) { bigTokensSynced = true; syncTokens(); } // snap once meshed
      }
      if (dirtyMesh) { rebuild(); dirtyMesh = false; }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      const ww = container.clientWidth;
      if (!ww) return;
      camera.aspect = ww / h;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, h);
    });
    ro.observe(container);
    container._cleanup = () => ro.disconnect();
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    container?._cleanup?.();
    manager?.dispose();
    env?.dispose();
    topTarget?.dispose();
    renderer?.dispose();
  });

  // Resync token meshes when the tokens array changes (add/edit/delete/move from the panel).
  $effect(() => {
    const _ = $mapData.tokens;
    if (tokenGroup) syncTokens();
  });

  // Re-apply environment when its settings change (panel edits).
  $effect(() => {
    const e = $voxelEnv;
    if (env) env.apply(e);
  });

  // Resync scattered props when the objects array changes.
  $effect(() => {
    const _ = $mapData.objects;
    if (objectLayer) syncObjects();
  });

  // Custom voxel props changed (created/edited in the Object Editor) → drop cached geometry so
  // edits re-render, then resync.
  $effect(() => {
    const _ = $customProps;
    if (objectLayer) {
      objectLayer.userData.geoCache.forEach((g) => g.dispose?.());
      objectLayer.userData.geoCache.clear();
      syncObjects();
    }
  });

  // Image Editor (another tab) rewrote the map → reload the chunk from IndexedDB + reframe.
  $effect(() => {
    const rev = $voxelUI.mapRev;
    if (!renderer || rev === lastRev) return;
    lastRev = rev;
    loadMeta(get(voxelUI).mapId).then((meta) => {
      if (meta && (meta.wChunks > 1 || meta.hChunks > 1)) { setupBigMap(meta); return; } // chunked → stream
      if (manager) teardownBigMap(); // a big map was replaced by a small single-chunk one
      loadChunk(get(voxelUI).mapId, 0, 0).then((loaded) => {
        if (!loaded) return;
        chunk = loaded;
        buildGrid();
        rebuild();
        setPreset(get(voxelUI).cameraPreset);
        scheduleTopview();
      });
    });
  });
</script>

<div>
  <div class="flex flex-wrap gap-2 items-center mb-3">
    <h2 class="text-2xl font-bold mr-auto">3D Map</h2>
    <div class="join">
      <button class="btn btn-xs join-item {mode === 'terrain' ? 'btn-active' : ''}" onclick={() => (mode = 'terrain')}>Terrain</button>
      <button class="btn btn-xs join-item {mode === 'tokens' ? 'btn-active' : ''}" onclick={() => (mode = 'tokens')}>Tokens</button>
      <button class="btn btn-xs join-item {mode === 'objects' ? 'btn-active' : ''}" onclick={() => (mode = 'objects')}>Objects</button>
    </div>
    <div class="join">
      <button class="btn btn-xs join-item {$voxelUI.cameraPreset === 'iso' ? 'btn-active' : ''}" onclick={() => setPreset('iso')}>ISO</button>
      <button class="btn btn-xs join-item {$voxelUI.cameraPreset === 'top' ? 'btn-active' : ''}" onclick={() => setPreset('top')}>Top</button>
    </div>
    {#if !bigMap}
      <label class="flex items-center gap-1 text-xs">Size
        <select class="select select-xs select-bordered" value={$voxelUI.mapSize} onchange={(e) => resizeMap(+e.target.value)}>
          {#each MAP_SIZES as n}<option value={n}>{n}×{n}</option>{/each}
        </select>
      </label>
      <button class="btn btn-xs btn-secondary" onclick={renderTopview}>Regenerate Topview</button>
      <button class="btn btn-xs btn-ghost" onclick={resetMap}>Reset</button>
    {/if}
  </div>

  <!-- Tools (terrain mode) -->
  {#if mode === 'terrain'}
  <div class="flex flex-wrap gap-2 items-center mb-2">
    <div class="join flex-wrap">
      {#each PAINTER_TOOLS as t}
        <button class="btn btn-xs join-item {$voxelUI.tool === t.id ? 'btn-primary' : ''}" onclick={() => voxelUI.update((u) => ({ ...u, tool: t.id }))}>{t.label}</button>
      {/each}
      {#each BLOCK_TOOLS as t}
        <button class="btn btn-xs join-item {$voxelUI.tool === t.id ? 'btn-primary' : ''}" onclick={() => voxelUI.update((u) => ({ ...u, tool: t.id }))}>{t.label}</button>
      {/each}
    </div>

    {#if toolParams.includes('biome')}
      <select class="select select-xs select-bordered" value={$voxelUI.biomeId} onchange={(e) => voxelUI.update((u) => ({ ...u, biomeId: +e.target.value }))}>
        {#each BIOMES as b}<option value={b.id}>{b.name}</option>{/each}
      </select>
    {/if}
    {#if $voxelUI.tool === 'place'}
      <select class="select select-xs select-bordered" value={$voxelUI.blockId} onchange={(e) => voxelUI.update((u) => ({ ...u, blockId: +e.target.value }))}>
        {#each BLOCKS as b}<option value={b.id}>{b.name}</option>{/each}
      </select>
    {/if}
    {#if toolParams.includes('radius')}
      <label class="flex items-center gap-1 text-xs">Radius
        <input type="range" min="0" max="6" class="range range-xs w-20" value={$voxelUI.brushRadius} oninput={(e) => voxelUI.update((u) => ({ ...u, brushRadius: +e.target.value }))} />
        <span class="w-4">{$voxelUI.brushRadius}</span>
      </label>
    {/if}
    {#if toolParams.includes('strength')}
      <label class="flex items-center gap-1 text-xs">Strength
        <input type="range" min="1" max="4" class="range range-xs w-16" value={$voxelUI.brushStrength} oninput={(e) => voxelUI.update((u) => ({ ...u, brushStrength: +e.target.value }))} />
        <span class="w-4">{$voxelUI.brushStrength}</span>
      </label>
    {/if}
    {#if toolParams.includes('target')}
      <label class="flex items-center gap-1 text-xs">Height
        <input type="range" min="0" max="40" class="range range-xs w-24" value={$voxelUI.targetHeight} oninput={(e) => voxelUI.update((u) => ({ ...u, targetHeight: +e.target.value }))} />
        <span class="w-5">{$voxelUI.targetHeight}</span>
      </label>
    {/if}
    {#if toolParams.includes('shape')}
      <button class="btn btn-xs btn-ghost" title="Brush shape" onclick={() => voxelUI.update((u) => ({ ...u, brushShape: u.brushShape === 'circle' ? 'square' : 'circle' }))}>
        {$voxelUI.brushShape === 'square' ? '■ square' : '● circle'}
      </button>
    {/if}
    {#if toolParams.includes('falloff')}
      <label class="flex items-center gap-1 text-xs cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" checked={$voxelUI.brushFalloff} onchange={(e) => voxelUI.update((u) => ({ ...u, brushFalloff: e.target.checked }))} /> Falloff
      </label>
    {/if}
  </div>

  {/if}

  <div class="text-xs opacity-60 mb-2">
    {#if possessing}POV — drag to look · WASD/arrows to move · Esc to exit
    {:else if mode === 'tokens'}Tokens — click to select · drag to move · Q/E to rotate · Possess for first-person POV
    {:else if mode === 'objects'}Objects — click/drag to scatter (or hand-place) props · pick prop & params below
    {:else}Left-drag = edit · Right-drag = orbit · Wheel = zoom · Middle-drag = pan. Edits auto-save & refresh the Map tab topview.{/if}
  </div>

  <div class="relative">
    <div bind:this={container} class="w-full rounded overflow-hidden bg-base-300" style="height: 460px;"></div>
    {#if possessing}
      <button class="btn btn-xs btn-error absolute top-2 right-2" onclick={exitPossession}>Exit POV (Esc)</button>
    {/if}
    {#if bigMap}
      <div class="absolute top-2 left-2 text-xs px-2 py-1 rounded bg-base-300/80 opacity-80 pointer-events-none">
        Streaming chunked map — right-drag to orbit · middle-drag to pan & explore
      </div>
    {/if}
  </div>

  <details class="collapse collapse-arrow bg-base-200 rounded mt-3">
    <summary class="collapse-title text-sm font-semibold py-2 min-h-0">Environment (time · season · weather · fog)</summary>
    <div class="collapse-content"><EnvPanel minuteLabel={envMinute} /></div>
  </details>

  {#if mode === 'terrain'}
    <details class="collapse collapse-arrow bg-base-200 rounded mt-3">
      <summary class="collapse-title text-sm font-semibold py-2 min-h-0">Import image → terrain (height · biome · objects)</summary>
      <div class="collapse-content"><ImageTerrainPanel onApply={applyImage} /></div>
    </details>
  {/if}
  {#if mode === 'tokens'}
    <div class="mt-3"><TokenPanel bind:selectedId={selectedTokenId} onPossess={possess} /></div>
  {/if}
  {#if mode === 'objects'}
    <div class="mt-3"><ObjectPanel /></div>
    <details class="collapse collapse-arrow bg-base-200 rounded mt-3">
      <summary class="collapse-title text-sm font-semibold py-2 min-h-0">Voxel Object Editor (build custom props)</summary>
      <div class="collapse-content"><ObjectEditor /></div>
    </details>
  {/if}
</div>
