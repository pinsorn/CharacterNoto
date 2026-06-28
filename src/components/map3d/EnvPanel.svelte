<script>
  // Environment controls for the 3D Map: time-of-day, season, weather, moon, fog. Edits the
  // per-map `voxelEnv` store; the overseer feeds that value to environment.js (createEnvironment).
  // Every write is an immutable spread via voxelEnv.update so Svelte + localStorage persistence
  // both fire. `minuteLabel` (optional) shows the live animated clock the overseer reads back from
  // environment.update(); when absent we fall back to the slider's own minuteOfDay.
  import { voxelEnv } from '../../lib/voxel/store.js';

  let { minuteLabel = null } = $props();

  const env = $derived($voxelEnv);

  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];

  const hhmm = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

  // Single immutable writer for every field.
  const set = (field, val) => voxelEnv.update((e) => ({ ...e, [field]: val }));
</script>

<div class="space-y-2 text-sm">
  <!-- Mode + time scale -->
  <div class="flex items-center gap-2 flex-wrap">
    <label class="flex items-center gap-1 cursor-pointer">
      <input
        type="checkbox"
        class="toggle toggle-xs"
        checked={env.mode === 'animated'}
        onchange={(e) => set('mode', e.target.checked ? 'animated' : 'static')}
      />
      <span class="text-xs">Animated</span>
    </label>
    {#if env.mode === 'animated'}
      <label class="flex items-center gap-1 text-xs">
        Speed
        <input
          type="range"
          class="range range-xs w-24"
          min="1"
          max="600"
          step="1"
          value={env.timeScale}
          oninput={(e) => set('timeScale', +e.target.value)}
        />
        <span class="opacity-60 w-16">{env.timeScale}×/s</span>
      </label>
    {/if}
  </div>

  <!-- Time of day -->
  <label class="block text-xs">
    <span class="flex justify-between">
      <span>Time of day</span>
      <span class="opacity-70 font-mono">{minuteLabel ?? hhmm(env.minuteOfDay)}</span>
    </span>
    <input
      type="range"
      class="range range-xs w-full"
      min="0"
      max="1439"
      step="1"
      value={env.minuteOfDay}
      oninput={(e) => set('minuteOfDay', +e.target.value)}
    />
  </label>

  <!-- Season + weather selects -->
  <div class="flex items-center gap-2 flex-wrap">
    <label class="flex items-center gap-1 text-xs">
      Season
      <select
        class="select select-xs select-bordered"
        value={env.season}
        onchange={(e) => set('season', e.target.value)}
      >
        {#each SEASONS as s}<option value={s}>{s}</option>{/each}
      </select>
    </label>
    <label class="flex items-center gap-1 text-xs">
      Weather
      <select
        class="select select-xs select-bordered"
        value={env.weather}
        onchange={(e) => set('weather', e.target.value)}
      >
        {#each WEATHERS as w}<option value={w}>{w}</option>{/each}
      </select>
    </label>
  </div>

  <!-- Weather intensity -->
  <label class="block text-xs">
    <span class="flex justify-between">
      <span>Intensity</span>
      <span class="opacity-60">{Math.round(env.weatherIntensity * 100)}%</span>
    </span>
    <input
      type="range"
      class="range range-xs w-full"
      min="0"
      max="1"
      step="0.05"
      value={env.weatherIntensity}
      oninput={(e) => set('weatherIntensity', +e.target.value)}
    />
  </label>

  <!-- Moon phase -->
  <label class="block text-xs">
    <span class="flex justify-between">
      <span>Moon phase</span>
      <span class="opacity-60">{env.moonPhase}/7</span>
    </span>
    <input
      type="range"
      class="range range-xs w-full"
      min="0"
      max="7"
      step="1"
      value={env.moonPhase}
      oninput={(e) => set('moonPhase', +e.target.value)}
    />
  </label>

  <!-- Fog radius -->
  <label class="block text-xs">
    <span class="flex justify-between">
      <span>Fog radius</span>
      <span class="opacity-60">{env.fogRadiusFt === 0 ? 'off' : `${env.fogRadiusFt} ft`}</span>
    </span>
    <input
      type="range"
      class="range range-xs w-full"
      min="0"
      max="200"
      step="5"
      value={env.fogRadiusFt}
      oninput={(e) => set('fogRadiusFt', +e.target.value)}
    />
  </label>
</div>
