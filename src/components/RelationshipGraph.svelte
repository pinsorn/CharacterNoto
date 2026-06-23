<script>
  // Character relationship graph. Nodes = characters (by id), edges = directed labelled
  // relationships. Nodes are draggable; positions persist. Square canvas so circles stay round.
  import { characters, relationships } from '../lib/stores.js';

  const COLORS = ['#7c3aed', '#db2777', '#06b6d4', '#36d399', '#fbbd23', '#f87272', '#3abff8'];

  let svgEl;
  let draggingId = $state(null);
  let live = $state(null); // { id, x, y } while dragging

  // Form
  let fromId = $state('');
  let toId = $state('');
  let label = $state('');

  const byId = $derived(new Map($characters.map((c) => [c.id, c])));

  function defaultPos(i, n) {
    const a = (i / Math.max(1, n)) * 2 * Math.PI - Math.PI / 2;
    return { x: 0.5 + 0.36 * Math.cos(a), y: 0.5 + 0.36 * Math.sin(a) };
  }
  function posOf(char, i, n) {
    if (live && live.id === char.id) return { x: live.x, y: live.y };
    return $relationships.positions[char.id] ?? defaultPos(i, n);
  }
  function normPoint(e) {
    const r = svgEl.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }
  function startDrag(e, id) {
    e.stopPropagation();
    draggingId = id;
    live = { id, ...normPoint(e) };
  }
  function onMove(e) {
    if (draggingId) live = { id: draggingId, ...normPoint(e) };
  }
  function endDrag() {
    if (draggingId && live) {
      const id = draggingId;
      const p = { x: live.x, y: live.y };
      relationships.update((r) => {
        r.positions = { ...r.positions, [id]: p };
        return r;
      });
    }
    draggingId = null;
    live = null;
  }

  function addEdge() {
    if (!fromId || !toId || fromId === toId) return;
    relationships.update((r) => {
      r.edges.push({ id: crypto.randomUUID(), from: fromId, to: toId, label: label.trim() });
      return r;
    });
    label = '';
  }
  function removeEdge(id) {
    relationships.update((r) => {
      r.edges = r.edges.filter((e) => e.id !== id);
      return r;
    });
  }

  // Edges that still connect existing characters, resolved to coordinates.
  const drawnEdges = $derived.by(() => {
    const n = $characters.length;
    const idx = new Map($characters.map((c, i) => [c.id, i]));
    return $relationships.edges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .map((e) => {
        const a = posOf(byId.get(e.from), idx.get(e.from), n);
        const b = posOf(byId.get(e.to), idx.get(e.to), n);
        return { ...e, a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      });
  });
</script>

<div>
  <h2 class="text-2xl font-bold mb-4">Relationships</h2>

  <!-- Add relationship -->
  <div class="flex flex-wrap gap-2 items-end mb-4">
    <select class="select select-sm select-bordered" bind:value={fromId}>
      <option value="">From…</option>
      {#each $characters as c}<option value={c.id}>{c.name}</option>{/each}
    </select>
    <input class="input input-sm input-bordered w-40" placeholder="label (e.g. ally)" bind:value={label} />
    <select class="select select-sm select-bordered" bind:value={toId}>
      <option value="">To…</option>
      {#each $characters as c}<option value={c.id}>{c.name}</option>{/each}
    </select>
    <button class="btn btn-sm btn-primary" onclick={addEdge} disabled={!fromId || !toId || fromId === toId}>
      Add
    </button>
  </div>

  <!-- Graph canvas (square so circles stay round) -->
  <div class="relative w-full bg-base-300 rounded overflow-hidden mx-auto" style="aspect-ratio: 1/1; max-width: 600px;">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg
      bind:this={svgEl}
      class="absolute inset-0 w-full h-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      onmousemove={onMove}
      onmouseup={endDrag}
      onmouseleave={endDrag}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      <!-- Edges -->
      {#each drawnEdges as e (e.id)}
        <line
          x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
          stroke="#94a3b8" stroke-width="1.5" vector-effect="non-scaling-stroke"
          marker-end="url(#arrow)"
        />
        {#if e.label}
          <text x={e.mid.x} y={e.mid.y} fill="#e2e8f0" font-size="0.028" text-anchor="middle"
            style="paint-order: stroke; stroke: #1e293b; stroke-width: 0.006;">{e.label}</text>
        {/if}
      {/each}

      <!-- Nodes -->
      {#each $characters as c, i (c.id)}
        {@const p = posOf(c, i, $characters.length)}
        <g style="cursor: grab" role="button" tabindex="-1" onmousedown={(e) => startDrag(e, c.id)}>
          <circle cx={p.x} cy={p.y} r="0.045" fill={COLORS[i % COLORS.length]} stroke="white" stroke-width="2" vector-effect="non-scaling-stroke" />
          <text x={p.x} y={p.y + 0.085} fill="white" font-size="0.03" text-anchor="middle"
            style="pointer-events: none; paint-order: stroke; stroke: black; stroke-width: 0.005;">{c.name}</text>
        </g>
      {/each}
    </svg>
  </div>
  <p class="text-xs opacity-60 text-center mt-1">Drag nodes to reposition.</p>

  <!-- Edge list -->
  {#if drawnEdges.length}
    <div class="mt-4 grid gap-1 max-w-xl">
      {#each drawnEdges as e (e.id)}
        <div class="flex items-center justify-between bg-base-200 px-3 py-1 rounded text-sm">
          <span>{byId.get(e.from)?.name} <span class="opacity-60">—{e.label || '→'}→</span> {byId.get(e.to)?.name}</span>
          <button class="btn btn-xs btn-error" onclick={() => removeEdge(e.id)}>×</button>
        </div>
      {/each}
    </div>
  {/if}
</div>
