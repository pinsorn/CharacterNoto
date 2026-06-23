// Item effects engine — ported verbatim from legacy item-manager.js confirmUseItem().
// Mutates the character object in place; returns it.
//
// Rules preserved exactly:
//  - stat: create with 50 if missing, parseInt(value), clamp [0,100]
//  - custom range: auto-create {min:0,max:100,color:'primary',value:0}, parseInt, clamp [min,max]
//  - custom checkbox: value = (effect.value === 'true' || true) — action is ignored for checkboxes
export function applyItemEffects(character, item) {
  for (const effect of item.effects || []) {
    if (effect.type === 'stat') {
      if (!Object.prototype.hasOwnProperty.call(character, effect.target)) {
        character[effect.target] = 50;
      }
      let v = character[effect.target];
      if (effect.action === 'add') v += parseInt(effect.value);
      else if (effect.action === 'subtract') v -= parseInt(effect.value);
      else if (effect.action === 'set') v = parseInt(effect.value);
      character[effect.target] = Math.max(0, Math.min(100, v));
    } else if (effect.type === 'custom') {
      if (!character.custom) character.custom = {};
      if (!character.custom[effect.target]) {
        character.custom[effect.target] = {
          type: effect.paramType || 'range',
          min: 0,
          max: 100,
          color: 'primary',
          value: effect.paramType === 'checkbox' ? false : 0,
        };
      }
      const p = character.custom[effect.target];
      if (p.type === 'range') {
        let v = p.value;
        if (effect.action === 'add') v += parseInt(effect.value);
        else if (effect.action === 'subtract') v -= parseInt(effect.value);
        else if (effect.action === 'set') v = parseInt(effect.value);
        p.value = Math.max(p.min, Math.min(p.max, v));
      } else if (p.type === 'checkbox') {
        p.value = effect.value === 'true' || effect.value === true;
      }
    }
  }
  return character;
}
