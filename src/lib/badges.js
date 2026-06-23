// Badge condition evaluation — ported verbatim from legacy (Function + with scope).
//
// ponytail: kept exactly as the original to preserve the feature. It evaluates an
// arbitrary JS expression from badge.cond against the character.
// SECURITY: this runs arbitrary JS. Same risk profile as the legacy app — acceptable
// for a single-user offline tool where the user authors their own conditions. Do NOT
// feed untrusted/imported conditions without sandboxing.
export function badgeMatches(badge, character) {
  if (!badge?.cond) return false;
  try {
    // eslint-disable-next-line no-new-func
    return !!Function('char', `with(char){ return (${badge.cond}); }`)(character);
  } catch {
    return false; // legacy: condition errors fail silently
  }
}
