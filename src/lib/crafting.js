// Crafting logic — ported verbatim from legacy crafting-manager.js.
// Item matching is CASE-SENSITIVE (name === name), matching legacy behavior.

// Max craftable count. Infinity (recipe with no materials) is clamped to 1, per legacy.
export function maxCraftable(character, recipe) {
  let max = Infinity;
  for (const material of recipe.materials) {
    const it = character.items.find((i) => i.name === material.name);
    const have = it ? it.amount : 0;
    max = Math.min(max, Math.floor(have / material.quantity));
  }
  if (max === Infinity || max <= 0) max = 1;
  return max;
}

export function canCraft(character, recipe, quantity) {
  for (const material of recipe.materials) {
    const it = character.items.find((i) => i.name === material.name);
    if (!it || it.amount < material.quantity * quantity) return false;
  }
  return true;
}

// Consume materials, add outputs (×quantity). Mutates character.items. Returns true if crafted.
export function craft(character, recipe, quantity = 1) {
  if (!canCraft(character, recipe, quantity)) return false;

  for (const material of recipe.materials) {
    const it = character.items.find((i) => i.name === material.name);
    it.amount -= material.quantity * quantity;
    if (it.amount <= 0) character.items.splice(character.items.indexOf(it), 1);
  }
  for (const output of recipe.outputs) {
    const total = output.quantity * quantity;
    const ex = character.items.find((i) => i.name === output.name);
    if (ex) ex.amount += total;
    else character.items.push({ name: output.name, amount: total });
  }
  return true;
}
