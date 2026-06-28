<script>
  // In-app voxel PROP editor (Object Builder). Layer-based: a 2D res×res grid per Y-layer (simpler
  // + more robust than full 3D picking) plus a live three.js preview. Authors prop data
  // ({ id, name, res, voxels:[[x,y,z,colorHex],...] }) and saves it to the persisted customProps
  // store; the overseer plugs those into the prop library + InstancedMesh renderer.
  //
  // Preview reuses the DiceScene lifecycle (onMount renderer/scene/camera + lights + OrbitControls;
  // rebuild the mesh from buildPropGeometry whenever voxels change; onDestroy dispose).
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import {
    buildPropGeometry, emptyProp, setVoxel, eraseVoxel, PROP_RES_OPTIONS,
  } from '../../lib/voxel/voxelProp.js';
  import { customProps } from '../../lib/voxel/customProps.js';

  // editId: when set, load that custom prop from the store into the editor (bindable so a parent
  // list can drive "edit this one").
  let { editId = $bindable(null) } = $props();

  const SWATCHES = ['#6b4a2b', '#7a5836', '#2f6d3a', '#4a8c3f', '#3f7a35', '#808080', '#6f6f6f', '#66ffff', '#c94f4f', '#e8c34a', '#3a6ea5', '#ffffff', '#222222'];

  let prop = $state(emptyProp());
  let color = $state('#4a8c3f');
  let layer = $state(0);
  let eraser = $state(false);
  let justSaved = $state(false);

  // res-length index list for grid iteration.
  const axis = $derived(Array.from({ length: prop.res }, (_, i) => i));

  // --- voxel lookups (cheap: res<=16 -> <=256 cells * small voxel list) --------------------------
  function voxelAt(x, y, z) {
    const v = prop.voxels.find((v) => v[0] === x && v[1] === y && v[2] === z);
    return v ? v[3] : null;
  }
  // any voxel in this column on a DIFFERENT layer -> faint context tint.
  function columnHasOther(x, z) {
    return prop.voxels.some((v) => v[0] === x && v[2] === z && v[1] !== layer);
  }

  function clickCell(x, z) {
    if (eraser) prop = { ...prop, voxels: eraseVoxel(prop, x, layer, z) };
    else prop = { ...prop, voxels: setVoxel(prop, x, layer, z, color) };
  }

  function changeRes(e) {
    const res = +e.target.value;
    if (prop.voxels.length && !confirm('Changing resolution clears the current prop. Continue?')) {
      e.target.value = String(prop.res); // revert the <select>
      return;
    }
    prop = emptyProp(res);
    layer = 0;
  }

  function newProp() {
    prop = emptyProp(prop.res);
    layer = 0;
    editId = null;
  }

  function save() {
    // deep-copy voxels so later edits don't mutate the stored snapshot.
    const snap = { ...prop, voxels: prop.voxels.map((v) => [...v]) };
    customProps.update((list) => {
      const i = list.findIndex((p) => p.id === snap.id);
      if (i >= 0) { const copy = list.slice(); copy[i] = snap; return copy; }
      return [...list, snap];
    });
    editId = snap.id; // now editing the saved entry
    justSaved = true;
    setTimeout(() => (justSaved = false), 1200);
  }

  // Load-for-edit when editId changes (guarded so saving — which sets editId to the same id —
  // doesn't reload over in-flight edits). Reads the store once via get() to avoid subscribing here.
  let lastEditId = null;
  $effect(() => {
    if (editId === lastEditId) return;
    lastEditId = editId;
    if (editId == null) return;
    const found = get(customProps).find((p) => p.id === editId);
    if (found) {
      prop = { ...found, voxels: (found.voxels || []).map((v) => [...v]) };
      layer = 0;
    }
  });

  // --- live three.js preview --------------------------------------------------------------------
  let canvasEl;
  let renderer, scene, camera, controls, material, mesh, raf;

  function rebuild() {
    if (!scene) return;
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh = null; }
    const geo = buildPropGeometry(prop, THREE);
    geo.computeBoundingSphere?.();
    mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);
  }

  onMount(() => {
    const w = canvasEl.clientWidth || 240, h = 200;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(1.5, 1.3, 1.9);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h);
    canvasEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(3, 6, 4);
    scene.add(dir);

    material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.target.set(0, 0.45, 0);
    controls.update();

    rebuild(); // initial paint (runs before the first $effect flush in some orderings)

    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    // ResizeObserver: the editor may mount inside a hidden tab (container 0×0).
    const ro = new ResizeObserver(() => {
      const ww = canvasEl.clientWidth;
      if (!ww) return;
      camera.aspect = ww / h;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, h);
    });
    ro.observe(canvasEl);
    canvasEl._cleanup = () => ro.disconnect();
  });

  // Rebuild on any voxel/res change. Read deps UNCONDITIONALLY (before the scene guard) so the
  // effect keeps tracking them even when the first run happens before onMount sets `scene`.
  $effect(() => {
    void prop.voxels;
    void prop.res;
    if (scene) rebuild();
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    canvasEl?._cleanup?.();
    controls?.dispose?.();
    mesh?.geometry?.dispose();
    material?.dispose();
    renderer?.dispose();
  });
</script>

<div class="space-y-2 text-sm">
  <!-- Name + resolution -->
  <div class="flex items-center gap-2">
    <input
      class="input input-bordered input-xs flex-1"
      placeholder="Prop name"
      bind:value={prop.name}
    />
    <select class="select select-bordered select-xs" value={prop.res} onchange={changeRes}>
      {#each PROP_RES_OPTIONS as r}
        <option value={r}>{r}³</option>
      {/each}
    </select>
  </div>

  <!-- Colour palette + picker + eraser -->
  <div class="flex flex-wrap items-center gap-1">
    {#each SWATCHES as s}
      <button
        type="button"
        class="w-5 h-5 rounded border {color === s && !eraser ? 'ring-2 ring-primary ring-offset-1' : 'border-base-300'}"
        style="background:{s}"
        aria-label={s}
        onclick={() => { color = s; eraser = false; }}
      ></button>
    {/each}
    <input type="color" class="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" bind:value={color} oninput={() => (eraser = false)} />
    <button
      type="button"
      class="btn btn-xs {eraser ? 'btn-error' : 'btn-ghost btn-outline'}"
      onclick={() => (eraser = !eraser)}
    >
      Eraser
    </button>
  </div>

  <!-- Y-layer slider + up/down -->
  <div class="flex items-center gap-2">
    <span class="opacity-70 text-xs whitespace-nowrap">Layer {layer}</span>
    <input
      type="range" class="range range-xs flex-1"
      min="0" max={prop.res - 1} step="1" bind:value={layer}
    />
    <div class="join">
      <button type="button" class="btn btn-xs join-item" onclick={() => (layer = Math.max(0, layer - 1))}>▼</button>
      <button type="button" class="btn btn-xs join-item" onclick={() => (layer = Math.min(prop.res - 1, layer + 1))}>▲</button>
    </div>
  </div>

  <div class="flex gap-2 items-start">
    <!-- Layer grid (x = columns, z = rows) -->
    <div
      class="grid gap-px bg-base-300 p-px rounded shrink-0"
      style="grid-template-columns: repeat({prop.res}, 1fr); width: {Math.min(220, prop.res * 18)}px;"
    >
      {#each axis as z}
        {#each axis as x}
          {@const fill = voxelAt(x, layer, z)}
          {@const other = !fill && columnHasOther(x, z)}
          <button
            type="button"
            class="aspect-square hover:ring-1 hover:ring-primary"
            style="background:{fill || (other ? 'rgba(148,163,184,0.30)' : 'var(--fallback-b1,#fff)')}"
            aria-label={`x${x} z${z}`}
            onclick={() => clickCell(x, z)}
          ></button>
        {/each}
      {/each}
    </div>

    <!-- Live preview -->
    <div bind:this={canvasEl} class="flex-1 min-w-0 rounded bg-base-200" style="height:200px;"></div>
  </div>

  <!-- Actions -->
  <div class="flex items-center justify-between pt-1">
    <span class="opacity-70 text-xs">{prop.voxels.length} voxels{justSaved ? ' · saved ✓' : ''}</span>
    <div class="join">
      <button type="button" class="btn btn-xs join-item" onclick={newProp}>New</button>
      <button type="button" class="btn btn-xs btn-primary join-item" onclick={save}>Save</button>
    </div>
  </div>
</div>
