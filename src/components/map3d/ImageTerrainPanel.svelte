<script>
  // Image → terrain panel: DM uploads an image, picks a mode (Height / Biome / Object), tweaks
  // mode params, hits Apply. We decode the file to a canvas, grab ImageData, and hand it to the
  // overseer via onApply(imageData, mode, opts). The pure transforms live in lib/voxel/imageTerrain.js;
  // this component only does the DOM/canvas bit (createImageBitmap → drawImage → getImageData).
  // Canvas/DOM is intentional HERE (a component); the pure module stays DOM-free.
  //
  // onApply contract (overseer wires this; supplies `size` + `heightAt` itself):
  //   mode 'height' → opts { maxHeight:number, invert:boolean }
  //   mode 'biome'  → opts {}
  //   mode 'object' → opts { propId:string, threshold:number, density:number }
  let { onApply } = $props();

  const PROP_IDS = ['pine', 'tree', 'bush', 'rock', 'boulder', 'stump', 'crystal'];

  let file = $state(null);
  let previewUrl = $state('');
  let mode = $state('height');
  // height params
  let maxHeight = $state(24);
  let invert = $state(false);
  // object params
  let propId = $state('tree');
  let threshold = $state(0.5);
  let density = $state(0.4);

  function onFile(e) {
    const f = e.target.files?.[0] ?? null;
    file = f;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = f ? URL.createObjectURL(f) : '';
  }

  async function apply() {
    if (!file || !onApply) return; // no file → no-op
    // createImageBitmap fully decodes before draw — no onload race.
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const imageData = ctx.getImageData(0, 0, bmp.width, bmp.height);
    bmp.close?.();
    const opts =
      mode === 'height' ? { maxHeight, invert }
      : mode === 'object' ? { propId, threshold, density }
      : {};
    onApply(imageData, mode, opts);
  }
</script>

<div class="space-y-2 text-sm">
  <!-- File input -->
  <input
    type="file" accept="image/*"
    class="file-input file-input-bordered file-input-xs w-full"
    onchange={onFile}
  />

  {#if previewUrl}
    <img src={previewUrl} alt="preview" class="max-h-24 rounded border border-base-300 object-contain" />
  {/if}

  <!-- Mode -->
  <label class="block text-xs">
    <span class="opacity-70">Mode</span>
    <select class="select select-bordered select-xs w-full" bind:value={mode}>
      <option value="height">Height</option>
      <option value="biome">Biome</option>
      <option value="object">Object</option>
    </select>
  </label>

  {#if mode === 'height'}
    <label class="block text-xs">
      <span class="flex justify-between"><span>Max height</span><span class="opacity-60">{maxHeight}</span></span>
      <input type="range" class="range range-xs w-full" min="4" max="48" step="1" bind:value={maxHeight} />
    </label>
    <label class="flex items-center gap-1 cursor-pointer text-xs">
      <input type="checkbox" class="checkbox checkbox-xs" bind:checked={invert} />
      <span>Invert (dark = high)</span>
    </label>
  {:else if mode === 'object'}
    <label class="block text-xs">
      <span class="opacity-70">Prop</span>
      <select class="select select-bordered select-xs w-full" bind:value={propId}>
        {#each PROP_IDS as p}<option value={p}>{p}</option>{/each}
      </select>
    </label>
    <label class="block text-xs">
      <span class="flex justify-between"><span>Threshold</span><span class="opacity-60">{threshold}</span></span>
      <input type="range" class="range range-xs w-full" min="0" max="1" step="0.05" bind:value={threshold} />
    </label>
    <label class="block text-xs">
      <span class="flex justify-between"><span>Density</span><span class="opacity-60">{density}</span></span>
      <input type="range" class="range range-xs w-full" min="0" max="1" step="0.05" bind:value={density} />
    </label>
  {/if}

  <button type="button" class="btn btn-xs btn-primary w-full" disabled={!file} onclick={apply}>
    Apply
  </button>
</div>
