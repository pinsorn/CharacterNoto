// Region loot roll. Pure logic; rng is injectable for deterministic tests.
// Region model: depleting stock, with a per-item `infinite` opt-out (loot-table behavior).
//
// Item shape: { name, dropChance (0-100), perRoll (>=1 max units/roll), infinite (bool), stock }
//  - infinite=true  → never depletes; rolled amount draws against perRoll.
//  - infinite=false → `stock` depletes by the rolled amount; can't drop more than stock.

// Roll a region. Returns [{ name, amount }] (possibly empty).
// MUTATES region.items[].stock for finite items that drop — caller persists mapData after.
export function rollRegion(region, { randomizeQty = true } = {}, rng = Math.random) {
  const loot = [];
  for (const it of region.items || []) {
    if (rng() * 100 >= it.dropChance) continue; // failed the drop roll
    const cap = Math.max(1, Math.floor(it.perRoll) || 1);
    let amount = randomizeQty ? 1 + Math.floor(rng() * cap) : cap;
    if (!it.infinite) {
      if (it.stock <= 0) continue; // depleted
      amount = Math.min(amount, it.stock); // can't take more than in stock
      it.stock -= amount;
    }
    loot.push({ name: it.name, amount });
  }
  return loot;
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
