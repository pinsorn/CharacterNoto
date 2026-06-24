// Pure roll over a dice set. Each die picks a uniform random face index (the OUTCOME);
// the 3D animation only visualises it. die: { id, faces: [string, ...] }.
// Returns [{ id, idx, label }].
export function rollDiceSet(diceSet, rng = Math.random) {
  return diceSet.map((d) => {
    const n = Math.max(1, d.faces.length);
    const idx = Math.min(n - 1, Math.floor(rng() * n));
    return { id: d.id, idx, label: String(d.faces[idx] ?? '') };
  });
}

// Sum the landed labels if every one is a finite number; otherwise null.
export function sumIfNumeric(results) {
  let total = 0;
  for (const r of results) {
    const v = Number(r.label);
    if (!Number.isFinite(v) || r.label === '') return null;
    total += v;
  }
  return total;
}
