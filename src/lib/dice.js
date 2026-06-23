// Dice expression roller. Supports standard notation: NdM, +K / -K, multiple terms
// (e.g. "2d6+3", "1d20-1", "2d6+1d4+2"). rng injectable for tests.
// Returns { total, terms: [{ text, rolls?, value }] }. Throws on invalid input.
export function rollDice(expr, rng = Math.random) {
  const cleaned = String(expr).replace(/\s+/g, '');
  if (!cleaned) throw new Error('Empty expression');

  const tokens = cleaned.match(/[+-]?[^+-]+/g);
  if (!tokens) throw new Error('Could not parse expression');

  let total = 0;
  const terms = [];
  for (const tok of tokens) {
    const sign = tok[0] === '-' ? -1 : 1;
    const body = tok.replace(/^[+-]/, '');
    const dice = body.match(/^(\d*)d(\d+)$/i);
    if (dice) {
      const count = dice[1] === '' ? 1 : parseInt(dice[1], 10);
      const sides = parseInt(dice[2], 10);
      if (count < 1 || count > 1000 || sides < 1) throw new Error(`Out of range: ${body}`);
      const rolls = [];
      for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(rng() * sides));
      const value = rolls.reduce((a, b) => a + b, 0) * sign;
      total += value;
      terms.push({ text: (sign < 0 ? '-' : '') + body, rolls, value });
    } else if (/^\d+$/.test(body)) {
      const value = parseInt(body, 10) * sign;
      total += value;
      terms.push({ text: (sign < 0 ? '-' : '') + body, value });
    } else {
      throw new Error(`Bad term: ${body}`);
    }
  }
  return { total, terms };
}
