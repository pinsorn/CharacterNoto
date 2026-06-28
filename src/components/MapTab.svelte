<script>
  // Map tab: top-down render of the 3D Map (its background, set by the 3D Map tab) + freeform
  // polygon regions drawn on an SVG overlay. Region geometry is stored in normalized 0..1 coords
  // (survives resize). Editing/rolling lives in RegionEditor. The background is no longer an
  // uploaded image — it's the auto-generated topview of the 3D Map (see Map3DTab.renderTopview).
  import { mapData } from '../lib/stores.js';
  import { viewer } from '../lib/mode.js';
  import { receivedHides } from '../lib/p2p.js';

  const hideDetails = $derived(viewer && !!$receivedHides?.mapDetails);
  import BlobImage from './BlobImage.svelte';
  import RegionEditor from './RegionEditor.svelte';

  const COLOR_HEX = {
    primary: '#7c3aed', secondary: '#db2777', accent: '#06b6d4',
    info: '#3abff8', success: '#36d399', warning: '#fbbd23', error: '#f87272',
  };
  const hex = (c) => COLOR_HEX[c] ?? COLOR_HEX.primary;
  const clamp01 = (n) => Math.min(1, Math.max(0, n));

  let svgEl;
  let drawing = $state(false);
  let draftPoints = $state([]);
  let cursor = $state(null); // rubber-band endpoint while drawing

  // Editor
  let editorOpen = $state(false);
  let selectedId = $state(null);

  function normPoint(e) {
    const rect = svgEl.getBoundingClientRect();
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  }
  function onSvgClick(e) {
    if (!drawing) return;
    draftPoints = [...draftPoints, normPoint(e)];
  }
  function onSvgMove(e) {
    if (drawing) cursor = normPoint(e);
  }
  function startDraw() {
    editMode = false;
    draftPoints = [];
    cursor = null;
    drawing = true;
  }
  function finishRegion() {
    if (draftPoints.length < 3) {
      alert('A region needs at least 3 points.');
      return;
    }
    const name = prompt('Region name?')?.trim();
    if (name) {
      mapData.update((d) => {
        d.regions.push({ id: crypto.randomUUID(), name, color: 'primary', points: draftPoints, items: [] });
        return d;
      });
    }
    cancelDraw();
  }
  function cancelDraw() {
    draftPoints = [];
    cursor = null;
    drawing = false;
  }

  function openRegion(id) {
    if (drawing || editMode) return;
    selectedId = id;
    editorOpen = true;
  }

  // --- edit shapes (move / reshape regions) -------------------------------
  let editMode = $state(false);
  let drag = $state(null); // { type:'vertex'|'body', regionId, vIdx?, last? }
  let live = $state(null); // { regionId, points } preview during a drag

  function toggleEdit() {
    editMode = !editMode;
    if (editMode) cancelDraw();
  }
  function regionPoints(r) {
    return live && live.regionId === r.id ? live.points : r.points;
  }
  function startVertexDrag(e, r, vIdx) {
    e.stopPropagation();
    e.preventDefault();
    drag = { type: 'vertex', regionId: r.id, vIdx };
    live = { regionId: r.id, points: r.points.map((p) => ({ ...p })) };
  }
  function startBodyDrag(e, r) {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    drag = { type: 'body', regionId: r.id, last: normPoint(e) };
    live = { regionId: r.id, points: r.points.map((p) => ({ ...p })) };
  }
  function onEditMove(e) {
    if (!drag || !live) return;
    const pt = normPoint(e);
    if (drag.type === 'vertex') {
      live = { regionId: live.regionId, points: live.points.map((p, i) => (i === drag.vIdx ? pt : p)) };
    } else {
      const dx = pt.x - drag.last.x;
      const dy = pt.y - drag.last.y;
      live = {
        regionId: live.regionId,
        points: live.points.map((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) })),
      };
      drag.last = pt;
    }
  }
  function endEditDrag() {
    if (drag && live) {
      const { regionId, points } = live;
      mapData.update((d) => {
        const r = d.regions.find((x) => x.id === regionId);
        if (r) r.points = points;
        return d;
      });
    }
    drag = null;
    live = null;
  }

  const pts = (points) => points.map((p) => `${p.x},${p.y}`).join(' ');
  const centroid = (points) => ({
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  });
</script>

<div>
  <!-- Toolbar -->
  <div class="flex flex-wrap gap-2 items-center mb-4">
    <h2 class="text-2xl font-bold mr-auto">Map</h2>
    {#if drawing}
      <button class="btn btn-sm btn-success" onclick={finishRegion}>Finish ({draftPoints.length})</button>
      <button class="btn btn-sm btn-ghost" onclick={cancelDraw}>Cancel</button>
    {:else}
      <button class="btn btn-sm btn-primary" onclick={startDraw}>Draw Region</button>
      {#if $mapData.regions.length}
        <button class="btn btn-sm {editMode ? 'btn-accent' : 'btn-outline'}" onclick={toggleEdit}>
          {editMode ? 'Done Editing' : 'Edit Shapes'}
        </button>
      {/if}
    {/if}
  </div>

  {#if drawing}
    <div class="alert alert-info py-2 mb-2">
      <span>Click to add points (≥3), then <strong>Finish</strong>. Esc-free: use Cancel.</span>
    </div>
  {/if}

  <!-- Map canvas -->
  <div class="relative w-full bg-base-300 rounded overflow-hidden select-none" style="aspect-ratio: 16 / 9;">
    {#if $mapData.backgroundId}
      <BlobImage id={$mapData.backgroundId} alt="map" class="absolute inset-0 w-full h-full object-cover" />
    {:else if !viewer}
      <div class="absolute inset-0 flex items-center justify-center text-center text-sm opacity-50 px-6">
        Build terrain in the <strong class="mx-1">3D Map</strong> tab — its top-down view becomes this map's background.
      </div>
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <svg
      bind:this={svgEl}
      class="absolute inset-0 w-full h-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={drawing ? 'cursor: crosshair' : ''}
      onclick={onSvgClick}
      onmousemove={(e) => { onSvgMove(e); onEditMove(e); }}
      onmouseup={endEditDrag}
      onmouseleave={endEditDrag}
    >
      {#each $mapData.regions as r (r.id)}
        {@const rp = regionPoints(r)}
        <polygon
          points={pts(rp)}
          fill={hex(r.color)}
          fill-opacity="0.35"
          stroke={hex(r.color)}
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          style={drawing ? 'pointer-events: none' : editMode ? 'cursor: move' : 'cursor: pointer'}
          role="button"
          tabindex="-1"
          onmousedown={(e) => startBodyDrag(e, r)}
          onclick={(e) => {
            e.stopPropagation();
            openRegion(r.id);
          }}
        />
        {@const c = centroid(rp)}
        {#if !hideDetails}
          <text
            x={c.x}
            y={c.y}
            fill="white"
            font-size="0.035"
            text-anchor="middle"
            style="pointer-events: none; paint-order: stroke; stroke: black; stroke-width: 0.004;"
          >{r.name}</text>
        {/if}
        {#if editMode}
          {#each rp as p, vi}
            <circle
              cx={p.x} cy={p.y} r="0.012"
              fill="white" stroke={hex(r.color)} stroke-width="2"
              vector-effect="non-scaling-stroke"
              style="cursor: grab"
              role="button" tabindex="-1"
              onmousedown={(e) => startVertexDrag(e, r, vi)}
            />
          {/each}
        {/if}
      {/each}

      <!-- Draft polygon being drawn -->
      {#if drawing && draftPoints.length > 0}
        <polyline
          points={pts(draftPoints) + (cursor ? ` ${cursor.x},${cursor.y}` : '')}
          fill="none"
          stroke="#7c3aed"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          stroke-dasharray="0.01"
        />
        {#each draftPoints as p}
          <circle cx={p.x} cy={p.y} r="0.008" fill="#7c3aed" />
        {/each}
      {/if}
    </svg>
  </div>

  <!-- Region list -->
  <div class="mt-4">
    {#if $mapData.regions.length === 0}
      <div class="text-center text-gray-500 py-4">No regions yet. Click "Draw Region" and outline an area on the map.</div>
    {:else}
      <div class="grid gap-2">
        {#each $mapData.regions as r (r.id)}
          <div class="flex items-center justify-between bg-base-200 p-2 rounded">
            <div class="flex items-center gap-2">
              <span class="badge" style={`background:${hex(r.color)};border:none;color:white`}>{r.name}</span>
              {#if !hideDetails}<span class="text-sm opacity-70">{r.items.length} item(s)</span>{/if}
            </div>
            <button class="btn btn-xs btn-primary" onclick={() => openRegion(r.id)}>Edit / Roll</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<RegionEditor bind:open={editorOpen} regionId={selectedId} />
