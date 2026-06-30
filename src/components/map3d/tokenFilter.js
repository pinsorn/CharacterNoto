// Pure token-list filter for the 3D Map TokenPanel. Case-insensitive match on label.
export function filterTokens(tokens, query) {
  const list = tokens ?? [];
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((t) => (t.label ?? '').toLowerCase().includes(q));
}
