import { get } from 'svelte/store';
import { characters, itemDatabase } from './stores.js';
import { validateItemDatabase, addMissingItemsFromInventories, seedCharacters } from './normalize.js';
import { putBlob, newImageId } from './blobstore.js';

// Run legacy load-time normalization once at startup (replaces initializeApp/initializeItemManager).
// Order matches legacy: seed characters if empty → validate wiki → add missing items from inventories.
export function initData() {
  if (get(characters).length === 0) characters.set(seedCharacters());

  // Ensure every character has a stable id (the relationship graph references characters by id).
  const chars = get(characters);
  let idChanged = false;
  for (const c of chars) {
    if (!c.id) {
      c.id = crypto.randomUUID();
      idChanged = true;
    }
  }
  if (idChanged) characters.set(chars);

  let db = validateItemDatabase(get(itemDatabase));
  db = addMissingItemsFromInventories(db, get(characters));
  itemDatabase.set(db);
}

// One-time migration: move legacy base64 `avatar` data URLs into IndexedDB, replacing them
// with an `avatarId`. Runs async (fire-and-forget); the store update reflects reactively.
export async function migrateAvatars() {
  const list = get(characters);
  let changed = false;
  for (const c of list) {
    if (c.avatar && !c.avatarId) {
      try {
        const blob = await (await fetch(c.avatar)).blob();
        const id = newImageId();
        await putBlob(id, blob);
        c.avatarId = id;
        delete c.avatar;
        changed = true;
      } catch {
        // leave the base64 avatar in place if conversion fails
      }
    }
  }
  if (changed) characters.set(list);
}
