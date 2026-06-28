<script>
  // ImageEditor — a 2D batch tool that turns image(s) into a voxel map across 3 layers
  // (Height / Biome / Object) with live 2D previews, then hands the result to the overseer
  // via onApply(). NO three.js / NO 3D here — pure pixel→voxel crunching + canvas previews.
  //
  // The heavy lifting lives in the already-tested pure helpers in lib/voxel/imageTerrain.js.
  // This component only does the DOM/canvas bits (decode files → ImageData; draw previews).
  //
  // Contract:
  //   let { onApply, fullscreen = $bindable(false) } = $props();
  //   onApply({ size, height:Int16Array, biome:Uint8Array, objects:Array }) — built from ENABLED
  //     layers only. Disabled: height → flat base (all 1), biome → all 0, objects → [].
  //   fullscreen (bindable) — toolbar button toggles it; we just style for both.
  import { imageToHeights, imageToBiomes, imageToObjects } from '../lib/voxel/imageTerrain.js';
  import { BIOMES, MAX_MAP_SIZE, hex } from '../lib/voxel/types.js';
  import { PROPS } from './map3d/objects.js';

  let { onApply, fullscreen = $bindable(false) } = $props();

  const BASE_HEIGHT = 1; // flat-base elevation when the Height layer is disabled (matches imageToHeights default)
  // Biome surface colours pre-scaled to 0..255 (built once) for fast preview painting.
  const BIOME_RGB = BIOMES.map((b) => { const [r, g, bl] = hex(b.surface); return [Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255)]; });
  const OBJ_RGB = [38, 74, 26]; // marker colour for object dots (dark forest green)
  const PREVIEW_PX = 256; // on-screen preview size (canvas is N×N, scaled up nearest-neighbour)

  // --- source files (base + optional per-layer overrides) ---------------------
  let baseFile = $state(null);
  let baseName = $state('');
  let baseUrl = $state(''); // object URL for the thumbnail
  let heightFile = $state(null);
  let biomeFile = $state(null);
  let objectFile = $state(null);

  // Decoded ImageData (filled asynchronously by the $effect below).
  let baseImg = $state(null);
  let heightImg = $state(null);
  let biomeImg = $state(null);
  let objectImg = $state(null);

  // --- layer enables + params -------------------------------------------------
  let heightEnabled = $state(true);
  let biomeEnabled = $state(true);
  let objectEnabled = $state(true);

  let R = $state(4); // pixels-per-voxel resolution
  let maxHeight = $state(24);
  let invert = $state(false);
  let propId = $state('tree');
  let threshold = $state(0.5);
  let density = $state(0.4);

  let applied = $state(false);

  // --- decode cache (per File, so param tweaks don't re-decode) ----------------
  const cache = new Map();
  /** Decode a File → Canvas ImageData ({width,height,data}). Cached by File. */
  async function loadFile(file) {
    if (!file) return null;
    if (cache.has(file)) return cache.get(file);
    try {
      const bmp = await createImageBitmap(file); // fully decodes before draw — no onload race
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const data = ctx.getImageData(0, 0, bmp.width, bmp.height);
      bmp.close?.();
      cache.set(file, data);
      return data;
    } catch (err) {
      alert('Could not decode image: ' + (err?.message ?? err));
      return null;
    }
  }

  // Decode whatever files are set; drop stale async results via the alive flag.
  $effect(() => {
    const bf = baseFile, hf = heightFile, bif = biomeFile, of = objectFile;
    let alive = true;
    (async () => {
      const [b, h, bi, o] = await Promise.all([loadFile(bf), loadFile(hf), loadFile(bif), loadFile(of)]);
      if (!alive) return;
      baseImg = b; heightImg = h; biomeImg = bi; objectImg = o;
    })();
    return () => { alive = false; };
  });

  // --- file input handlers ----------------------------------------------------
  function onBase(e) {
    const f = e.target.files?.[0] ?? null;
    baseFile = f;
    baseName = f?.name ?? '';
    if (baseUrl) URL.revokeObjectURL(baseUrl);
    baseUrl = f ? URL.createObjectURL(f) : '';
  }
  const onHeightFile = (e) => { heightFile = e.target.files?.[0] ?? null; };
  const onBiomeFile = (e) => { biomeFile = e.target.files?.[0] ?? null; };
  const onObjectFile = (e) => { objectFile = e.target.files?.[0] ?? null; };

  // --- target size N ----------------------------------------------------------
  // N = clamp(round(max(W,H)/R), 8, MAX_MAP_SIZE). DM picks R; we display the resulting map size.
  let rawN = $derived(baseImg ? Math.round(Math.max(baseImg.width, baseImg.height) / R) : 0);
  // True map size is UNLIMITED now. N>MAX_MAP_SIZE → generated as streamed chunks (top-down view).
  let N = $derived(baseImg ? Math.max(8, rawN) : 0);
  let big = $derived(N > MAX_MAP_SIZE); // chunked (large) map
  // Previews + derived arrays are bounded so a huge N doesn't compute 25M cells on the main thread.
  let previewN = $derived(Math.min(N, MAX_MAP_SIZE));

  // Effective source per layer = its override (if uploaded) else the base image.
  let heightSrc = $derived(heightImg || baseImg);
  let biomeSrc = $derived(biomeImg || baseImg);
  let objectSrc = $derived(objectImg || baseImg);

  // --- derived voxel data (recomputes reactively; N≤256 keeps it cheap) --------
  // Comment/shortcut: each helper re-runs sampleResize internally, so a param tweak rescans the
  // source image. We lean on N≤256 + per-File decode caching rather than caching the resized RGB
  // (which would duplicate lib logic) — fine for DM-scale images.
  let heights = $derived(heightEnabled && heightSrc && previewN ? imageToHeights(heightSrc, previewN, { maxHeight, invert }) : null);
  let biomes = $derived(biomeEnabled && biomeSrc && previewN ? imageToBiomes(biomeSrc, previewN) : null);
  let objects = $derived.by(() => {
    if (!objectEnabled || !objectSrc || !previewN) return [];
    // heightAt: use the live heights array when the Height layer is on, else flat 1 (spec).
    const heightAt = (gx, gz) => (heights ? heights[gz * previewN + gx] : 1);
    return imageToObjects(objectSrc, previewN, { propId, threshold, density, heightAt });
  });

  // --- preview canvases -------------------------------------------------------
  let heightCanvas = $state(), biomeCanvas = $state(), objectCanvas = $state(), compositeCanvas = $state();

  /** Paint an n×n canvas pixel-by-pixel from a (x,z)->[r,g,b] colour function. */
  function paint(canvas, n, colorFn) {
    if (!canvas || !n) return;
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(n, n);
    const d = img.data;
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const c = colorFn(x, z);
        const i = (z * n + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Redraw all four previews whenever the derived data / params change.
  $effect(() => {
    const n = previewN;
    if (!baseImg || !n) return;
    const hArr = heights, bArr = biomes, objs = objects, mh = maxHeight;
    // object cells (gx,gz from pos.x-0.5 / pos.z-0.5 → floor of pos)
    const objCells = new Set(objs.map((o) => Math.floor(o.pos.z) * n + Math.floor(o.pos.x)));

    // Height: grayscale normalised to maxHeight (flat mid-grey if disabled).
    paint(heightCanvas, n, (x, z) => {
      if (!hArr) return [80, 80, 80];
      const t = Math.max(0, Math.min(1, hArr[z * n + x] / Math.max(1, mh)));
      const v = Math.round(t * 255);
      return [v, v, v];
    });

    // Biome: each cell painted its biome surface colour (all biome 0 if disabled).
    paint(biomeCanvas, n, (x, z) => BIOME_RGB[bArr ? bArr[z * n + x] : 0] || BIOME_RGB[0]);

    // Object: faint biome/base background + bright dots where objects land.
    paint(objectCanvas, n, (x, z) => {
      const i = z * n + x;
      if (objCells.has(i)) return OBJ_RGB;
      const base = bArr ? (BIOME_RGB[bArr[i]] || BIOME_RGB[0]) : [70, 70, 70];
      return [Math.round(base[0] * 0.45), Math.round(base[1] * 0.45), Math.round(base[2] * 0.45)];
    });

    // Composite: biome colour shaded by height (lighter = higher) + object dots on top.
    paint(compositeCanvas, n, (x, z) => {
      const i = z * n + x;
      if (objCells.has(i)) return OBJ_RGB;
      const base = bArr ? (BIOME_RGB[bArr[i]] || BIOME_RGB[0]) : BIOME_RGB[0];
      const t = hArr ? Math.max(0, Math.min(1, hArr[i] / Math.max(1, mh))) : 0.6;
      const shade = 0.45 + 0.55 * t;
      return [Math.round(base[0] * shade), Math.round(base[1] * shade), Math.round(base[2] * shade)];
    });
  });

  // --- apply ------------------------------------------------------------------
  let applying = $state(false);
  async function apply() {
    if (!baseImg || !onApply || !N || applying) return;
    applying = true;
    try {
      if (big) {
        // LARGE: hand raw images + config to the overseer, which streams chunks (no whole-map array).
        await onApply({
          chunked: true, N, R,
          layers: {
            height: { on: heightEnabled, maxHeight, invert, base: BASE_HEIGHT },
            biome: { on: biomeEnabled },
            object: { on: objectEnabled, propId, threshold, density },
          },
          imgs: { height: heightSrc, biome: biomeSrc, object: objectSrc },
        });
      } else {
        // SMALL: previewN === N, so the derived arrays are the full map → single chunk (3D editable).
        const size = N;
        const height = heights ? heights : new Int16Array(size * size).fill(BASE_HEIGHT);
        const biome = biomes ? biomes : new Uint8Array(size * size);
        await onApply({ size, height, biome, objects });
      }
      applied = true;
      setTimeout(() => { applied = false; }, 1600);
    } finally {
      applying = false;
    }
  }
</script>

<div class="flex flex-col gap-3 {fullscreen ? 'h-[calc(100vh-2rem)] overflow-auto' : ''}">
  <!-- Toolbar -->
  <div class="flex items-center gap-2 flex-wrap">
    <h3 class="font-semibold text-base mr-auto">Image → Voxel Map</h3>
    {#if N}
      <span class="badge badge-neutral badge-sm">→ {N}×{N} map</span>
    {/if}
    <button type="button" class="btn btn-sm btn-ghost" onclick={() => (fullscreen = !fullscreen)}>
      {fullscreen ? '⤡ Exit' : '⤢ Full screen'}
    </button>
    <button type="button" class="btn btn-sm btn-primary" disabled={!baseImg || applying} onclick={apply}>
      {applying ? (big ? 'Generating…' : 'Applying…') : applied ? 'Applied ✓' : big ? 'Generate' : 'Apply'}
    </button>
  </div>

  <!-- Base image + resolution -->
  <div class="card bg-base-200 p-3">
    <div class="flex gap-3 items-start flex-wrap">
      <div class="flex-1 min-w-[220px] space-y-2">
        <label class="block text-xs">
          <span class="opacity-70">Base image</span>
          <input type="file" accept="image/*" class="file-input file-input-bordered file-input-sm w-full" onchange={onBase} />
        </label>
        <label class="block text-xs">
          <span class="flex justify-between"><span>Resolution — {R} px = 1 voxel</span></span>
          <select class="select select-bordered select-sm w-full" bind:value={R}>
            <option value={1}>1 px / voxel (finest)</option>
            <option value={2}>2 px / voxel</option>
            <option value={4}>4 px / voxel</option>
            <option value={8}>8 px / voxel (coarsest)</option>
          </select>
        </label>
        {#if baseImg}
          <div class="text-xs opacity-70">
            Source {baseImg.width}×{baseImg.height}px → <span class="font-semibold">{N}×{N} map</span>
            {#if big}
              <div class="text-info mt-1">large map → auto-split into {Math.ceil(N / 64)}×{Math.ceil(N / 64)} chunks. The 3D Map streams it around the camera; the Map tab shows the top-down view.</div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="w-28 shrink-0">
        {#if baseUrl}
          <img src={baseUrl} alt="base" class="w-28 h-28 object-contain rounded border border-base-300 bg-base-100" />
          <div class="text-[10px] opacity-60 truncate mt-1" title={baseName}>{baseName}</div>
        {:else}
          <div class="w-28 h-28 rounded border border-dashed border-base-300 grid place-items-center text-[10px] opacity-50 text-center px-1">
            no image
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if !baseImg}
    <div class="alert text-sm">
      <span>Upload a base image to begin. It is sampled into an N×N voxel grid across the three layers below.</span>
    </div>
  {/if}

  <!-- Layer panels -->
  <div class="grid gap-3 md:grid-cols-3">
    <!-- Height -->
    <div class="card bg-base-200 p-3 space-y-2 {heightEnabled ? '' : 'opacity-60'}">
      <label class="flex items-center justify-between cursor-pointer">
        <span class="font-medium text-sm">Height</span>
        <input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={heightEnabled} />
      </label>
      <label class="block text-xs">
        <span class="opacity-70">Override image (optional)</span>
        <input type="file" accept="image/*" class="file-input file-input-bordered file-input-xs w-full" onchange={onHeightFile} />
      </label>
      <label class="block text-xs">
        <span class="flex justify-between"><span>Max height</span><span class="opacity-60">{maxHeight}</span></span>
        <input type="range" class="range range-xs w-full" min="4" max="48" step="1" bind:value={maxHeight} disabled={!heightEnabled} />
      </label>
      <label class="flex items-center gap-1 cursor-pointer text-xs">
        <input type="checkbox" class="checkbox checkbox-xs" bind:checked={invert} disabled={!heightEnabled} />
        <span>Invert (dark = high)</span>
      </label>
    </div>

    <!-- Biome -->
    <div class="card bg-base-200 p-3 space-y-2 {biomeEnabled ? '' : 'opacity-60'}">
      <label class="flex items-center justify-between cursor-pointer">
        <span class="font-medium text-sm">Biome</span>
        <input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={biomeEnabled} />
      </label>
      <label class="block text-xs">
        <span class="opacity-70">Override image (optional)</span>
        <input type="file" accept="image/*" class="file-input file-input-bordered file-input-xs w-full" onchange={onBiomeFile} />
      </label>
      <div class="text-xs opacity-70">Pixel colour → nearest biome.</div>
      <div class="flex flex-wrap gap-1">
        {#each BIOMES as b}
          <span class="inline-flex items-center gap-1 text-[10px] badge badge-sm badge-ghost">
            <span class="w-3 h-3 rounded-sm border border-base-300" style="background:{b.surface}"></span>{b.name}
          </span>
        {/each}
      </div>
    </div>

    <!-- Object -->
    <div class="card bg-base-200 p-3 space-y-2 {objectEnabled ? '' : 'opacity-60'}">
      <label class="flex items-center justify-between cursor-pointer">
        <span class="font-medium text-sm">Object</span>
        <input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={objectEnabled} />
      </label>
      <label class="block text-xs">
        <span class="opacity-70">Override image (optional)</span>
        <input type="file" accept="image/*" class="file-input file-input-bordered file-input-xs w-full" onchange={onObjectFile} />
      </label>
      <label class="block text-xs">
        <span class="opacity-70">Prop</span>
        <select class="select select-bordered select-xs w-full" bind:value={propId} disabled={!objectEnabled}>
          {#each PROPS as p}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </label>
      <label class="block text-xs">
        <span class="flex justify-between"><span>Threshold</span><span class="opacity-60">{threshold}</span></span>
        <input type="range" class="range range-xs w-full" min="0" max="1" step="0.05" bind:value={threshold} disabled={!objectEnabled} />
      </label>
      <label class="block text-xs">
        <span class="flex justify-between"><span>Density</span><span class="opacity-60">{density}</span></span>
        <input type="range" class="range range-xs w-full" min="0" max="1" step="0.05" bind:value={density} disabled={!objectEnabled} />
      </label>
      {#if objectEnabled && baseImg}
        <div class="text-[10px] opacity-60">{objects.length} object{objects.length === 1 ? '' : 's'} placed</div>
      {/if}
    </div>
  </div>

  <!-- Previews -->
  <div class="card bg-base-200 p-3">
    <div class="text-xs font-medium opacity-70 mb-2">Previews</div>
    {#if !baseImg}
      <div class="text-xs opacity-50 py-8 text-center">Previews appear once a base image is loaded.</div>
    {:else}
      <div class="flex gap-4 flex-wrap items-start">
        <!-- Composite = the centerpiece -->
        <figure class="space-y-1">
          <canvas
            bind:this={compositeCanvas}
            class="rounded border border-base-300 bg-base-100"
            style="width:{PREVIEW_PX}px;height:{PREVIEW_PX}px;image-rendering:pixelated"
          ></canvas>
          <figcaption class="text-xs font-medium text-center">Composite (top-down)</figcaption>
        </figure>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <figure class="space-y-1">
            <canvas bind:this={heightCanvas} class="rounded border border-base-300 bg-base-100"
              style="width:128px;height:128px;image-rendering:pixelated"></canvas>
            <figcaption class="text-[11px] opacity-70 text-center">Height</figcaption>
          </figure>
          <figure class="space-y-1">
            <canvas bind:this={biomeCanvas} class="rounded border border-base-300 bg-base-100"
              style="width:128px;height:128px;image-rendering:pixelated"></canvas>
            <figcaption class="text-[11px] opacity-70 text-center">Biome</figcaption>
          </figure>
          <figure class="space-y-1">
            <canvas bind:this={objectCanvas} class="rounded border border-base-300 bg-base-100"
              style="width:128px;height:128px;image-rendering:pixelated"></canvas>
            <figcaption class="text-[11px] opacity-70 text-center">Object</figcaption>
          </figure>
        </div>
      </div>
    {/if}
  </div>
</div>
