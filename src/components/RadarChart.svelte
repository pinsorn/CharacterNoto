<script>
  // Pure-SVG radar / spider chart. Self-contained, display-only, dependency-free.
  // Square viewBox (0 0 100 100) so polygons stay regular regardless of `size`.
  let { axes = [], series = [], size = 320 } = $props();

  const R = 36; // chart radius; leaves room for labels out to frac ~1.12
  const CX = 50;
  const CY = 50;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // Missing/undefined/non-finite -> 0 (point sits at center).
  function normalize(v, min, max) {
    if (v == null || !Number.isFinite(v) || max === min) return 0;
    return clamp01((v - min) / (max - min));
  }

  // First axis points up (-90deg); subsequent axes go clockwise.
  function angleOf(i, n) {
    return (i / n) * 2 * Math.PI - Math.PI / 2;
  }
  function pointAt(frac, i, n) {
    const a = angleOf(i, n);
    return { x: CX + R * frac * Math.cos(a), y: CY + R * frac * Math.sin(a) };
  }

  const ok = $derived(axes.length >= 3);
  const n = $derived(axes.length);

  // Reference rings (faint polygons) at these fractions.
  const rings = [0.25, 0.5, 0.75, 1];

  function ringPoints(frac) {
    return axes
      .map((_, i) => {
        const p = pointAt(frac, i, n);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  }

  // Spoke + label geometry for each axis tip.
  const spokes = $derived(
    axes.map((ax, i) => {
      const tip = pointAt(1, i, n);
      const lab = pointAt(1.12, i, n);
      return { tip, lab, name: ax?.name ?? '' };
    })
  );

  // Each series -> a polygon point string over the axes.
  const polys = $derived(
    series.map((s) => {
      const pts = axes
        .map((ax, i) => {
          const frac = normalize(s?.values?.[ax.id], ax.min, ax.max);
          const p = pointAt(frac, i, n);
          return `${p.x},${p.y}`;
        })
        .join(' ');
      return { points: pts, color: s.color, dashed: !!s.dashed, label: s.label };
    })
  );
</script>

<div class="inline-block">
  {#if !ok}
    <div
      class="flex items-center justify-center text-center text-sm opacity-70 bg-base-200 rounded-box p-4"
      style="width: {size}px; max-width: 100%; aspect-ratio: 1 / 1;"
    >
      Add at least 3 axes for a radar chart.
    </div>
  {:else}
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style="max-width: 100%; height: auto;"
      role="img"
      aria-label="Radar chart"
    >
      <!-- Grid: concentric reference rings -->
      {#each rings as frac}
        <polygon
          points={ringPoints(frac)}
          fill="none"
          stroke="#475569"
          stroke-opacity="0.4"
          stroke-width="0.5"
          vector-effect="non-scaling-stroke"
        />
      {/each}

      <!-- Spokes + axis labels -->
      {#each spokes as sp}
        <line
          x1={CX}
          y1={CY}
          x2={sp.tip.x}
          y2={sp.tip.y}
          stroke="#475569"
          stroke-opacity="0.4"
          stroke-width="0.5"
          vector-effect="non-scaling-stroke"
        />
        <text
          x={sp.lab.x}
          y={sp.lab.y}
          font-size="5"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#cbd5e1"
        >
          {sp.name}
        </text>
      {/each}

      <!-- Series polygons -->
      {#each polys as p}
        <polygon
          points={p.points}
          fill={p.color}
          fill-opacity="0.25"
          stroke={p.color}
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
          style={p.dashed ? 'stroke-dasharray: 4 2;' : ''}
        />
      {/each}
    </svg>
  {/if}

  <!-- Legend (outside the svg) -->
  {#if series.length}
    <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm" style="max-width: {size}px;">
      {#each series as s}
        <div class="flex items-center gap-1.5">
          <span
            class="inline-block w-3 h-3 rounded-sm"
            style="background: {s.dashed ? 'transparent' : s.color}; border: 1.5px {s.dashed
              ? 'dashed'
              : 'solid'} {s.color};"
          ></span>
          <span class="opacity-80">{s.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
