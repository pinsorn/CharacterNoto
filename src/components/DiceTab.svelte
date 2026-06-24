<script>
  // Dice tab: a real 3D dice builder (any count, any faces, custom labels) on top of the
  // existing notation roller (2d6+3), kept below.
  import DiceRoller from './DiceRoller.svelte';
  import DiceScene from './DiceScene.svelte';
  import { diceSet } from '../lib/stores.js';
  import { rollDiceSet, sumIfNumeric } from '../lib/dice3d.js';

  let sceneRef = $state(null);
  let results = $state(null);
  let rolling = $state(false);

  const facesText = (d) => d.faces.join(', ');
  function setFaces(i, text) {
    const faces = text.split(',').map((s) => s.trim()).filter((s) => s.length);
    diceSet.update((list) => {
      if (faces.length) list[i].faces = faces;
      return list;
    });
  }
  function preset(i, n) {
    diceSet.update((list) => {
      list[i].faces = Array.from({ length: n }, (_, k) => String(k + 1));
      return list;
    });
  }
  function addDie() {
    diceSet.update((list) => {
      list.push({ id: crypto.randomUUID(), faces: ['1', '2', '3', '4', '5', '6'] });
      return list;
    });
  }
  function removeDie(i) {
    diceSet.update((list) => {
      list.splice(i, 1);
      return list;
    });
  }

  function roll() {
    if (rolling || !$diceSet.length) return;
    const res = rollDiceSet($diceSet);
    results = null;
    rolling = true;
    sceneRef?.roll(res);
  }
  function onSettled(res) {
    results = res;
    rolling = false;
  }

  const total = $derived(results ? sumIfNumeric(results) : null);
</script>

<div class="space-y-8">
  <!-- 3D dice -->
  <div>
    <div class="flex items-center gap-3 mb-3">
      <h2 class="text-2xl font-bold mr-auto">3D Dice</h2>
      <button class="btn btn-primary" onclick={roll} disabled={rolling || !$diceSet.length}>
        {rolling ? 'Rolling…' : 'Roll'}
      </button>
    </div>

    <div class="bg-base-200 rounded-box overflow-hidden mb-3">
      <DiceScene bind:this={sceneRef} dice={$diceSet} {onSettled} />
    </div>

    {#if results}
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <span class="text-sm opacity-70">Result:</span>
        {#each results as r}<span class="badge badge-lg badge-primary">{r.label}</span>{/each}
        {#if total !== null}<span class="font-bold text-lg">= {total}</span>{/if}
      </div>
    {/if}

    <!-- builder -->
    <div class="space-y-2">
      {#each $diceSet as d, i (d.id)}
        <div class="flex flex-wrap items-center gap-2 bg-base-200 p-2 rounded">
          <span class="text-sm opacity-70 w-20">Die {i + 1} · {d.faces.length}f</span>
          <input
            class="input input-sm input-bordered flex-1 min-w-48"
            value={facesText(d)}
            onchange={(e) => setFaces(i, e.currentTarget.value)}
            title="comma-separated face labels"
          />
          <select class="select select-sm select-bordered"
            onchange={(e) => { preset(i, parseInt(e.currentTarget.value, 10)); e.currentTarget.value = ''; }}>
            <option value="">preset…</option>
            {#each [4, 6, 8, 10, 12, 20, 100] as n}<option value={n}>d{n}</option>{/each}
          </select>
          <button class="btn btn-sm btn-error" onclick={() => removeDie(i)} disabled={$diceSet.length <= 1}>×</button>
        </div>
      {/each}
      <button class="btn btn-sm btn-outline" onclick={addDie}>Add die</button>
    </div>
    <p class="text-xs opacity-60 mt-1">
      Faces = comma-separated labels — any text, any count. Each die can differ.
    </p>
  </div>

  <!-- Notation roller (kept) -->
  <div class="border-t border-base-300 pt-6">
    <DiceRoller />
  </div>
</div>
