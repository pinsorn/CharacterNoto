// Import/export — ported from legacy character-manager.js.
// NOTE: legacy export includes {characters, badges, itemDatabase} only — NOT craftingRecipes. Preserved.

export function exportData({ characters, badges, itemDatabase }) {
  const data = { characters, badges, itemDatabase: itemDatabase || [] };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'characters.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Parse imported JSON. Mirrors legacy quirk: characters = data.characters || data
// (if there's no `characters` key, the whole payload IS the characters array).
// Throws on invalid JSON — caller alerts, matching legacy try/catch.
export function parseImport(text) {
  const data = JSON.parse(text);
  return {
    characters: data.characters || data,
    badges: data.badges,
    itemDatabase: data.itemDatabase,
  };
}
