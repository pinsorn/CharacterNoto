import { writable } from 'svelte/store';

/**
 * localStorage-backed writable store.
 * Replaces the legacy 1s polling loop + scattered manual saveToLocalStorage() calls:
 * - writes persist automatically on every change
 * - `storage` event keeps other tabs in sync (no timer, no race)
 *
 * ponytail: this single helper deletes the whole "live mode" polling mechanism.
 */
export function persisted(key, initial) {
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
// Character relationship graph: directed labelled edges + saved node positions (by character id).
export const relationships = persisted('relationships', { edges: [], positions: {} });
