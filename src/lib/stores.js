import { writable } from 'svelte/store';
import { viewer } from './mode.js';

/**
 * localStorage-backed writable store.
 * Replaces the legacy 1s polling loop + scattered manual saveToLocalStorage() calls:
 * - writes persist automatically on every change
 * - `storage` event keeps other tabs in sync (no timer, no race)
 *
 * ponytail: this single helper deletes the whole "live mode" polling mechanism.
 */
export function persisted(key, initial) {
  // Viewer (read-only player) mode: in-memory only — never touch localStorage, so a player's
  // own data is never clobbered and nothing leaks. State arrives over P2P instead.
  if (viewer) return writable(initial);

  let start = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) start = JSON.parse(raw);
  } catch {
    // corrupt JSON → fall back to initial
  }

  const store = writable(start);

  store.subscribe((value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota / serialization failure — drop silently like the legacy code did
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === key && e.newValue !== null) {
        try {
          store.set(JSON.parse(e.newValue));
        } catch {
          /* ignore bad cross-tab payload */
        }
      }
    });
  }

  return store;
}

// Same localStorage keys as the legacy app → existing user data loads unchanged.
export const characters = persisted('characterData', []);
export const badges = persisted('badgeData', []);
export const itemDatabase = persisted('itemDatabase', []);
export const craftingRecipes = persisted('craftingRecipes', []);
// Map feature: regions + the IndexedDB id of the background image (image bytes live in blobstore).
export const mapData = persisted('mapData', { backgroundId: null, regions: [] });
// Character relationship graph: DM-defined axes (global), directed edges with per-axis values
// + labels, and saved node positions (by character id).
export const relationships = persisted('relationships', { axes: [], edges: [], positions: {} });
// Host-only: which tabs are shared with players when hosting a session.
export const shareConfig = persisted('shareConfig', {
  characters: true, items: true, crafting: true, map: true, relationships: true, dice: true,
});
// Host-only: what to FORCE-hide in the players' view (players can't toggle these).
export const viewerHides = persisted('viewerHides', {
  charParams: false,
  itemEffects: false, itemObtain: false,
  craftDetails: false,
  mapDetails: false, relLabels: false,
});
// 3D dice builder: any number of dice, each with any number of custom face labels.
export const diceSet = persisted('diceSet', [
  { id: 'd1', faces: ['1', '2', '3', '4', '5', '6'] },
  { id: 'd2', faces: ['1', '2', '3', '4', '5', '6'] },
]);
