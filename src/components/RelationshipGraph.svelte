<script>
  // Character relationship graph. Nodes = characters (by id), edges = directed labelled
  // relationships. Nodes are draggable; positions persist. Square canvas so circles stay round.
  import { characters, relationships } from '../lib/stores.js';
  import { viewer } from '../lib/mode.js';
  import { receivedHides } from '../lib/p2p.js';

  const hideLabels = $derived(viewer && !!$receivedHides?.relLabels);
  import Modal from './Modal.svelte';
  import RadarChart from './RadarChart.svelte';

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
    e.preventDefault(); // stop native text-selection / drag-image during the drag
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

  // --- highlight edges by an axis -----------------------------------------
  let highlightAxisId = $state('');
  const clamp01 = (n) => Math.min(1, Math.max(0, n));
  const LO = '#475569', HI = '#f87272'; // edge colour ramp low→high
  function lerpHex(a, b, t) {
    const ch = (s, i) => parseInt(s.slice(i, i + 2), 16);
    const mix = (i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0');
    return '#' + mix(1) + mix(3) + mix(5);
  }

  // Edges that still connect existing characters, resolved to coordinates (+ highlight styling).
  const drawnEdges = $derived.by(() => {
    const n = $characters.length;
    const idx = new Map($characters.map((c, i) => [c.id, i]));
    const ax = $relationships.axes.find((a) => a.id === highlightAxisId);
    return $relationships.edges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .map((e) => {
        const a = posOf(byId.get(e.from), idx.get(e.from), n);
        const b = posOf(byId.get(e.to), idx.get(e.to), n);
        let hl = null;
        if (ax) {
          const v = e.values?.[ax.id];
          hl = v === undefined || ax.max === ax.min ? 0 : clamp01((v - ax.min) / (ax.max - ax.min));
        }
        return {
          ...e,
          a,
          b,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          stroke: hl === null ? '#94a3b8' : lerpHex(LO, HI, hl),
          width: hl === null ? 1.5 : 1.5 + 3.5 * hl,
        };
      });
  });

  // --- axes (global, DM-defined) -----------------------------------------
  function addAxis() {
    relationships.update((r) => {
      r.axes = [...(r.axes ?? []), { id: crypto.randomUUID(), name: 'New axis', min: 0, max: 10 }];
      return r;
    });
  }
  function setAxis(id, key, value) {
    relationships.update((r) => {
      const a = r.axes.find((x) => x.id === id);
      if (a) a[key] = key === 'name' ? value : parseInt(value, 10) || 0;
      return r;
    });
  }
  function removeAxis(id) {
    relationships.update((r) => {
      r.axes = r.axes.filter((a) => a.id !== id);
      return r;
    });
  }

  // --- edge editor (per-axis values + radar) ------------------------------
  let editingId = $state(null);
  let editorOpen = $state(false);
  // Fresh copy each store fire so sliders + radar stay reactive under in-place edits.
  const editingEdge = $derived.by(() => {
    const e = $relationships.edges.find((x) => x.id === editingId);
    return e ? { ...e, values: { ...(e.values ?? {}) } } : null;
  });
  const reverseEdge = $derived.by(() => {
    const e = editingEdge;
    return e ? ($relationships.edges.find((x) => x.from === e.to && x.to === e.from) ?? null) : null;
  });
  const radarSeries = $derived.by(() => {
    const e = editingEdge;
    if (!e) return [];
    const s = [{ label: `${byId.get(e.from)?.name}→${byId.get(e.to)?.name}`, color: '#7c3aed', values: e.values }];
    const rev = reverseEdge;
    if (rev) s.push({ label: `${byId.get(rev.from)?.name}→${byId.get(rev.to)?.name}`, color: '#36d399', dashed: true, values: rev.values ?? {} });
    return s;
  });

  function openEdgeEditor(id) {
    editingId = id;
    editorOpen = true;
  }
  function setEdgeLabel(v) {
    relationships.update((r) => {
      const e = r.edges.find((x) => x.id === editingId);
      if (e) e.label = v;
      return r;
    });
  }
  function setEdgeValue(axisId, v) {
    relationships.update((r) => {
      const e = r.edges.find((x) => x.id === editingId);
      if (e) {
        if (!e.values) e.values = {};
        e.values[axisId] = parseInt(v, 10) || 0;
      }
      return r;
    });
  }
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

  <!-- Axis manager (global, DM-defined) -->
  <div class="mb-4">
    <div class="flex items-center gap-2 mb-2">
      <h3 class="font-semibold">Axes</h3>
      <button class="btn btn-xs btn-outline" onclick={addAxis}>+ Axis</button>
    </div>
    {#if $relationships.axes.length}
      <div class="flex flex-wrap gap-2">
        {#each $relationships.axes as a (a.id)}
          <div class="flex items-center gap-1 bg-base-200 rounded px-2 py-1">
            <input class="input input-xs input-bordered w-28" value={a.name}
              onchange={(e) => setAxis(a.id, 'name', e.currentTarget.value)} />
            <input type="number" class="input input-xs input-bordered w-14" value={a.min} title="min"
              onchange={(e) => setAxis(a.id, 'min', e.currentTarget.value)} />
            <input type="number" class="input input-xs input-bordered w-14" value={a.max} title="max"
              onchange={(e) => setAxis(a.id, 'max', e.currentTarget.value)} />
            <button class="btn btn-xs btn-error" onclick={() => removeAxis(a.id)}>×</button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-xs opacity-60">No axes yet. Add ≥3 (e.g. Trust, Fear, Respect) to plot relationship radars.</p>
    {/if}
  </div>

  <!-- Highlight edges by axis -->
  {#if $relationships.axes.length}
    <div class="flex items-center gap-2 mb-2 text-sm flex-wrap">
      <span>Highlight edges by:</span>
      <select class="select select-xs select-bordered" bind:value={highlightAxisId}>
        <option value="">None</option>
        {#each $relationships.axes as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
      </select>
      {#if highlightAxisId}
        <span class="text-xs opacity-70">low <span style="color:#475569">▬</span>→<span style="color:#f87272">▬</span> high (thicker = higher)</span>
      {/if}
    </div>
  {/if}

  <!-- Graph canvas (square so circles stay round) -->
  <div class="relative w-full bg-base-300 rounded overflow-hidden mx-auto select-none" style="aspect-ratio: 1/1; max-width: 600px;">
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
          stroke={e.stroke} stroke-width={e.width} vector-effect="non-scaling-stroke"
          marker-end="url(#arrow)"
        />
        {#if e.label && !hideLabels}
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
          <span>{byId.get(e.from)?.name} <span class="opacity-60">—{(!hideLabels && e.label) || '→'}→</span> {byId.get(e.to)?.name}</span>
          <div class="flex gap-1">
            <button class="btn btn-xs btn-primary" onclick={() => openEdgeEditor(e.id)}>Edit</button>
            <button class="btn btn-xs btn-error" onclick={() => removeEdge(e.id)}>×</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Edge editor: per-axis values + radar (with reverse overlay) -->
<Modal bind:open={editorOpen} title="Edit Relationship">
  {#if editingEdge}
    <p class="mb-2 text-sm opacity-70">
      {byId.get(editingEdge.from)?.name} → {byId.get(editingEdge.to)?.name}
    </p>
    <input
      class="input input-bordered w-full mb-4"
      placeholder="label (optional)"
      value={editingEdge.label ?? ''}
      onchange={(e) => setEdgeLabel(e.currentTarget.value)}
    />

    {#if $relationships.axes.length}
      <div class="space-y-2 mb-4">
        {#each $relationships.axes as a (a.id)}
          <div class="flex items-center gap-2 text-sm">
            <span class="w-28 truncate" title={a.name}>{a.name}</span>
            <input
              type="range" class="range range-sm range-primary flex-1"
              min={a.min} max={a.max}
              value={editingEdge.values[a.id] ?? a.min}
              onchange={(e) => setEdgeValue(a.id, e.currentTarget.value)}
            />
            <span class="w-8 text-right tabular-nums">{editingEdge.values[a.id] ?? a.min}</span>
          </div>
        {/each}
      </div>
      <RadarChart axes={$relationships.axes} series={radarSeries} />
    {:else}
      <p class="text-sm opacity-60">Define axes (above the graph) to rate this relationship.</p>
    {/if}

    <div class="modal-action">
      <button class="btn" onclick={() => (editorOpen = false)}>Close</button>
    </div>
  {/if}
</Modal>
