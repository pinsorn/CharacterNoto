// Region loot roll. Pure logic; rng is injectable for deterministic tests.
// Region model: depleting stock, with a per-item `infinite` opt-out (loot-table behavior).
//
// Item shape: { name, dropChance (0-100), perRoll (>=1 max units/roll), infinite (bool), stock }
//  - infinite=true  → never depletes; rolled amount draws against perRoll.
//  - infinite=false → `stock` depletes by the rolled amount; can't drop more than stock.

// Roll a region. Returns [{ name, amount }] (possibly empty).
// MUTATES region.items[].stock for finite items that drop — caller persists mapData after.
//   mode 'independent' (default): each item rolls its own % drop; yields 0..N items.
//   mode 'weighted': exactly ONE item, chosen with dropChance used as a relative weight.
export function rollRegion(region, { randomizeQty = true, mode = 'independent' } = {}, rng = Math.random) {
  const items = region.items || [];
  if (mode === 'weighted') return weightedRoll(items, randomizeQty, rng);

  const loot = [];
  for (const it of items) {
    if (rng() * 100 >= it.dropChance) continue; // failed the drop roll
    loot.push(takeItem(it, randomizeQty, rng));
  }
  return loot.filter(Boolean);
}

// Pick exactly one available item, weighted by dropChance. Returns [] if the pool is empty.
function weightedRoll(items, randomizeQty, rng) {
  const pool = items.filter((it) => (it.infinite || it.stock > 0) && it.dropChance > 0);
  const totalW = pool.reduce((s, it) => s + it.dropChance, 0);
  if (totalW <= 0) return [];
  let r = rng() * totalW;
  let pick = pool[pool.length - 1];
  for (const it of pool) {
    if (r < it.dropChance) { pick = it; break; }
    r -= it.dropChance;
  }
  const taken = takeItem(pick, randomizeQty, rng);
  return taken ? [taken] : [];
}

// Resolve quantity for a dropped item and deplete finite stock. Returns null if depleted.
function takeItem(it, randomizeQty, rng) {
  const cap = Math.max(1, Math.floor(it.perRoll) || 1);
  let amount = randomizeQty ? 1 + Math.floor(rng() * cap) : cap;
  if (!it.infinite) {
    if (it.stock <= 0) return null;
    amount = Math.min(amount, it.stock);
    it.stock -= amount;
  }
  return { name: it.name, amount };
}

// Merge loot ([{name,amount}]) into a character's items[] (CASE-SENSITIVE, matching inventory rules).
// Mutates and returns the items array.
export function mergeLootIntoItems(items, loot) {
  for (const { name, amount } of loot) {
    const existing = items.find((i) => i.name === name);
    if (existing) existing.amount += amount;
    else items.push({ name, amount });
  }
  return items;
}
