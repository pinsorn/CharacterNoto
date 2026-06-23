// Load-time data normalization — ported from legacy item-manager.js + character-manager init.
// These MUST run on store init or existing data renders differently than the legacy app.

// Dedup case-insensitive (first wins), trim names, coerce missing fields. From validateItemDatabase().
export function validateItemDatabase(itemDatabase) {
  const seen = new Set();
  const valid = [];
  for (const item of itemDatabase) {
    if (item && typeof item.name === 'string' && item.name.trim()) {
      const name = item.name.trim();
      const lower = name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        valid.push({
          name,
          howToObtain: item.howToObtain || '',
          description: item.description || '',
          effects: Array.isArray(item.effects) ? item.effects : [],
        });
      }
    }
  }
  return valid;
}

// Add any inventory item not already in the wiki (case-insensitive). From addMissingItemsFromInventories().
export function addMissingItemsFromInventories(itemDatabase, characters) {
  const existing = new Set(itemDatabase.map((i) => i.name.toLowerCase()));
  const result = [...itemDatabase];
  for (const char of characters) {
    for (const item of char.items || []) {
      if (!existing.has(item.name.toLowerCase())) {
        result.push({
          name: item.name,
          howToObtain: 'Found in character inventory',
          description: 'Auto-added from character inventory',
          effects: [],
        });
        existing.add(item.name.toLowerCase());
      }
    }
  }
  return result;
}

// Legacy seed when characterData is empty.
export const seedCharacters = () => [
  { name: 'Rio', hunger: 70, thirsty: 40, items: [{ name: 'apple', amount: 2 }], custom: {} },
];
