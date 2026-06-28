<script>
  // Object / prop painter controls for the 3D Map. Edits the per-session `voxelObjUI` store (prop,
  // mode, brush params); the overseer (Map3DTab) reads that value to scatter/place props via
  // objects.js. Mirrors EnvPanel: every write is an immutable spread so Svelte + localStorage
  // persistence both fire. The placed-object count + "Clear objects" act on the shared `mapData`.
  import { voxelObjUI } from '../../lib/voxel/store.js';
  import { mapData } from '../../lib/stores.js';
  import { PROPS } from './objects.js';
  import { customProps } from '../../lib/voxel/customProps.js';

  const ui = $derived($voxelObjUI);
  const count = $derived($mapData.objects?.length ?? 0);
  // Built-in props + user-authored voxel props (from the Object Editor).
  const allProps = $derived([...PROPS, ...$customProps]);

  // Single immutable writer for every voxelObjUI field.
  const set = (field, val) => voxelObjUI.update((u) => ({ ...u, [field]: val }));

  const clearObjects = () => mapData.update((d) => ({ ...d, objects: [] }));
</script>

<div class="space-y-2 text-sm">
  <!-- Prop picker -->
  <div class="flex flex-wrap gap-1">
    {#each allProps as p}
      <button
        type="button"
        class="btn btn-xs {ui.propId === p.id ? 'btn-primary' : 'btn-ghost btn-outline'}"
        onclick={() => set('propId', p.id)}
      >
        {p.name}
      </button>
    {/each}
  </div>

  <!-- Mode toggle -->
  <div class="join">
    {#each ['scatter', 'place'] as m}
      <button
        type="button"
        class="btn btn-xs join-item {ui.mode === m ? 'btn-active btn-primary' : ''}"
        onclick={() => set('mode', m)}
      >
        {m}
      </button>
    {/each}
  </div>

  <!-- Radius -->
  <label class="block text-xs">
    <span class="flex justify-between"><span>Radius</span><span class="opacity-60">{ui.radius}</span></span>
    <input
      type="range" class="range range-xs w-full" min="1" max="8" step="1"
      value={ui.radius} oninput={(e) => set('radius', +e.target.value)}
    />
  </label>

  <!-- Density -->
  <label class="block text-xs">
    <span class="flex justify-between"><span>Density</span><span class="opacity-60">{ui.density}</span></span>
    <input
      type="range" class="range range-xs w-full" min="0.1" max="2" step="0.1"
      value={ui.density} oninput={(e) => set('density', +e.target.value)}
    />
  </label>

  <!-- Jitter -->
  <label class="block text-xs">
    <span class="flex justify-between"><span>Jitter</span><span class="opacity-60">{ui.jitter}</span></span>
    <input
      type="range" class="range range-xs w-full" min="0" max="1" step="0.05"
      value={ui.jitter} oninput={(e) => set('jitter', +e.target.value)}
    />
  </label>

  <!-- Scale variation -->
  <label class="block text-xs">
    <span class="flex justify-between"><span>Scale var</span><span class="opacity-60">{ui.scaleVar}</span></span>
    <input
      type="range" class="range range-xs w-full" min="0" max="0.8" step="0.05"
      value={ui.scaleVar} oninput={(e) => set('scaleVar', +e.target.value)}
    />
  </label>

  <!-- Random yaw -->
  <label class="flex items-center gap-1 cursor-pointer text-xs">
    <input
      type="checkbox" class="toggle toggle-xs"
      checked={ui.yawRandom} onchange={(e) => set('yawRandom', e.target.checked)}
    />
    <span>Random yaw</span>
  </label>

  <!-- Count readout + clear -->
  <div class="flex items-center justify-between pt-1">
    <span class="opacity-70 text-xs">{count} placed</span>
    <button type="button" class="btn btn-xs btn-error btn-outline" onclick={clearObjects}>
      Clear objects
    </button>
  </div>
</div>
