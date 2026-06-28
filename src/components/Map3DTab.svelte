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
  import { putBlob, delBlob, newImageId } from '../lib/blobstore.js';
  import { voxelUI } from '../lib/voxel/store.js';
  import { CHUNK, WORLD_HEIGHT, MAP_EXTENT, BIOMES, BLOCKS, colorOf } from '../lib/voxel/types.js';
  import { createChunk, composeDense, placeBlock, eraseVoxel, surfaceY } from '../lib/voxel/world.js';
  import { greedyMesh } from '../lib/voxel/mesher.js';
  import { saveChunk, loadChunk } from '../lib/voxel/chunkStore.js';
  import { PAINTER_TOOLS, applyBrush as paintBrush } from './map3d/brushes.js';
  import TokenPanel from './map3d/TokenPanel.svelte';
  import { createTokenGroup, syncTokenGroup, SIZES } from './map3d/tokens.js';

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

  // token placement helpers
  const heightAt = (gx, gz) => (lastDense ? surfaceY(lastDense, gx, gz) : 6);
  const charLookup = (id) => {
    const c = get(characters).find((x) => x.id === id);
    return c ? { name: c.name || '?', color: c.color } : null;
  };
  function syncTokens() {
    if (tokenGroup) syncTokenGroup(tokenGroup, get(mapData).tokens || [], charLookup, heightAt, THREE);
  }

  const clampCell = (v) => Math.min(CHUNK - 1, Math.max(0, v));
  const colIdx = (x, z) => z * CHUNK + x;
  const denseGet = (dense) => (x, y, z) => dense[(y * CHUNK + z) * CHUNK + x];

  function rebuild() {
    const dense = composeDense(chunk);
    const m = greedyMesh([CHUNK, WORLD_HEIGHT, CHUNK], denseGet(dense), colorOf);
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
      if (ui.tool === 'place') placeBlock(chunk, x, y, z, ui.blockId);
      else eraseVoxel(chunk, x, y, z);
    } else {
      const cx = clampCell(Math.floor(p.x - n.x * 0.01));
      const cz = clampCell(Math.floor(p.z - n.z * 0.01));
      if (start && ui.tool === 'flatten') strokeTargetH = chunk.height[colIdx(cx, cz)];
      paintBrush(chunk, cx, cz, {
        tool: ui.tool, radius: ui.brushRadius, strength: ui.brushStrength,
        shape: ui.brushShape, falloff: ui.brushFalloff, target: ui.targetHeight,
        biomeId: ui.biomeId, seed: strokeSeed,
        baseline: ui.tool === 'flatten' ? strokeTargetH : undefined,
      });
    }
    dirtyMesh = true;
  }

  function setNdc(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  function pick(e) {
    setNdc(e);
    const hits = raycaster.intersectObjects([terrainMesh, pickPlane].filter(Boolean));
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
    if (e.button !== 0) return; // left = act; right = orbit (OrbitControls)
    if (possessing) { look.dragging = true; look.px = e.clientX; look.py = e.clientY; return; }
    if (mode === 'tokens') {
      const id = pickToken(e);
      selectedTokenId = id;
      draggingTokenId = id;
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
    if (painting) applyAt(pick(e), false);
  }
  function onPointerUp() {
    if (possessing) { look.dragging = false; return; }
    if (draggingTokenId) { draggingTokenId = null; scheduleTopview(); return; }
    if (!painting) return;
    painting = false;
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
    syncTokens(); // restores hidden pawn visibility
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
    saveTimer = setTimeout(() => saveChunk(get(voxelUI).mapId, chunk), 500);
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
    const ext = MAP_EXTENT;
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
    const c = CHUNK;
    if (preset === 'top') camera.position.set(c / 2, c * 1.7, c / 2 + 0.001);
    else camera.position.set(c * 1.15, c * 1.0, c * 1.15);
    controls.target.set(c / 2, 0, c / 2);
    controls.update();
  }

  function resetMap() {
    if (!confirm('Reset the 3D map to flat ground? This clears terrain edits.')) return;
    chunk = createChunk();
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

    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a2f25, 0.7));
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.1);
    sun.position.set(CHUNK * 0.6, CHUNK * 1.4, CHUNK * 0.3);
    scene.add(sun);

    terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

    gridHelper = new THREE.GridHelper(CHUNK, CHUNK, 0x335577, 0x223344);
    gridHelper.position.set(CHUNK / 2, 0.02, CHUNK / 2);
    scene.add(gridHelper);

    pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(CHUNK, CHUNK),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickPlane.rotation.x = -Math.PI / 2;
    pickPlane.position.set(CHUNK / 2, 0, CHUNK / 2);
    scene.add(pickPlane);

    tokenGroup = createTokenGroup(THREE);
    scene.add(tokenGroup);

    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Load persisted chunk (or start flat), then build + initial topview.
    loadChunk(get(voxelUI).mapId, 0, 0).then((loaded) => {
      if (loaded) chunk = loaded;
      rebuild();
      setPreset(get(voxelUI).cameraPreset);
      renderer.render(scene, camera);
      if (!get(mapData).backgroundId) renderTopview();
    });

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (possessing) applyLook();
      else controls.update();
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
    topTarget?.dispose();
    renderer?.dispose();
  });

  // Resync token meshes when the tokens array changes (add/edit/delete/move from the panel).
  $effect(() => {
    const _ = $mapData.tokens;
    if (tokenGroup) syncTokens();
  });
</script>

<div>
  <div class="flex flex-wrap gap-2 items-center mb-3">
    <h2 class="text-2xl font-bold mr-auto">3D Map</h2>
    <div class="join">
      <button class="btn btn-xs join-item {mode === 'terrain' ? 'btn-active' : ''}" onclick={() => (mode = 'terrain')}>Terrain</button>
      <button class="btn btn-xs join-item {mode === 'tokens' ? 'btn-active' : ''}" onclick={() => (mode = 'tokens')}>Tokens</button>
    </div>
    <div class="join">
      <button class="btn btn-xs join-item {$voxelUI.cameraPreset === 'iso' ? 'btn-active' : ''}" onclick={() => setPreset('iso')}>ISO</button>
      <button class="btn btn-xs join-item {$voxelUI.cameraPreset === 'top' ? 'btn-active' : ''}" onclick={() => setPreset('top')}>Top</button>
    </div>
    <button class="btn btn-xs btn-secondary" onclick={renderTopview}>Regenerate Topview</button>
    <button class="btn btn-xs btn-ghost" onclick={resetMap}>Reset</button>
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
    {:else}Left-drag = edit · Right-drag = orbit · Wheel = zoom · Middle-drag = pan. Edits auto-save & refresh the Map tab topview.{/if}
  </div>

  <div class="relative">
    <div bind:this={container} class="w-full rounded overflow-hidden bg-base-300" style="height: 460px;"></div>
    {#if possessing}
      <button class="btn btn-xs btn-error absolute top-2 right-2" onclick={exitPossession}>Exit POV (Esc)</button>
    {/if}
  </div>

  {#if mode === 'tokens'}
    <div class="mt-3"><TokenPanel bind:selectedId={selectedTokenId} onPossess={possess} /></div>
  {/if}
</div>
