<script>
  // Dice roller tab. Standard notation (2d6+3, 1d20-1, 2d6+1d4+2) plus quick-roll buttons.
  import { rollDice } from '../lib/dice.js';

  let expr = $state('1d20');
  let result = $state(null);
  let error = $state('');
  let history = $state([]); // ephemeral: recent rolls

  const dice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

  function roll() {
    error = '';
    try {
      const r = rollDice(expr);
      result = r;
      history = [{ expr, total: r.total }, ...history].slice(0, 12);
    } catch (e) {
      error = e.message;
      result = null;
    }
  }
  function quick(d) {
    expr = d;
    roll();
  }
</script>

<div class="max-w-2xl">
  <h2 class="text-2xl font-bold mb-4">Dice Roller</h2>

  <div class="flex gap-2 mb-3">
    <input
      class="input input-bordered flex-1"
      placeholder="e.g. 2d6+3"
      bind:value={expr}
      onkeydown={(e) => e.key === 'Enter' && roll()}
    />
    <button class="btn btn-primary" onclick={roll}>Roll</button>
  </div>

  <div class="flex flex-wrap gap-2 mb-4">
    {#each dice as d}
      <button class="btn btn-sm btn-outline" onclick={() => quick(d)}>{d}</button>
    {/each}
  </div>

  {#if error}
    <div class="alert alert-error py-2 mb-4"><span>{error}</span></div>
  {/if}

  {#if result}
    <div class="card bg-base-200 mb-4">
      <div class="card-body items-center text-center p-4">
        <div class="text-5xl font-bold">{result.total}</div>
        <div class="text-sm opacity-70 flex flex-wrap gap-2 justify-center mt-2">
          {#each result.terms as t}
            <span class="badge badge-ghost">
              {t.text}{#if t.rolls}: [{t.rolls.join(', ')}]{/if}
            </span>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if history.length}
    <h3 class="font-semibold mb-2">History</h3>
    <ul class="space-y-1">
      {#each history as h}
        <li class="flex justify-between bg-base-200 px-3 py-1 rounded text-sm">
          <span class="opacity-70">{h.expr}</span>
          <span class="font-bold">{h.total}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
