// Build the read-only "public view" the host broadcasts to players, and apply a received
// one on the player side. Visibility is enforced HERE (at the source): only shared tabs,
// minus any entity flagged `hidden`. Players never receive what isn't shared.
import { get } from 'svelte/store';
import { characters, badges, itemDatabase, craftingRecipes, mapData, relationships, diceSet, viewerHides } from './stores.js';
import { getBlob, putBlob } from './blobstore.js';

// share: { characters, items, crafting, map, relationships, dice } booleans.
// hides: DM-forced hide flags applied in the player's read-only view (players can't toggle).
// state: { characters, badges, itemDatabase, craftingRecipes, mapData, relationships, diceSet }.
// Pure → unit-testable.
export function buildPublicView(state, share, hides = {}) {
  const keep = (arr) => (arr || []).filter((e) => !e?.hidden);
  const v = { share: { ...share }, hides: { ...hides } };
  if (share.characters) {
    v.characters = keep(state.characters);
    v.badges = state.badges || [];
  }
  if (share.items) v.itemDatabase = keep(state.itemDatabase);
  if (share.crafting) v.craftingRecipes = keep(state.craftingRecipes);
  if (share.map) {
    const md = state.mapData || {};
    v.mapData = { backgroundId: md.backgroundId ?? null, regions: keep(md.regions) };
  }
  if (share.relationships) {
    const r = state.relationships || {};
    v.relationships = { axes: r.axes || [], edges: keep(r.edges), positions: r.positions || {} };
  }
  if (share.dice) v.diceSet = state.diceSet || [];
  return v;
}

// Image ids referenced by a public view (visible avatars + map background).
export function imageIdsOf(view) {
  const ids = new Set();
  for (const c of view.characters || []) if (c.avatarId) ids.add(c.avatarId);
  if (view.mapData?.backgroundId) ids.add(view.mapData.backgroundId);
  return [...ids];
}

// Host: snapshot current stores → { view, images } ready to send over P2P.
export async function snapshot(share) {
  const view = buildPublicView(
    {
      characters: get(characters),
      badges: get(badges),
      itemDatabase: get(itemDatabase),
      craftingRecipes: get(craftingRecipes),
      mapData: get(mapData),
      relationships: get(relationships),
      diceSet: get(diceSet),
    },
    share,
    get(viewerHides)
  );
  const images = {};
  for (const id of imageIdsOf(view)) {
    const blob = await getBlob(id);
    if (blob) images[id] = await blobToDataURL(blob);
  }
  return { view, images };
}

// Player: apply a received snapshot into the (in-memory) stores + IndexedDB images.
export async function applySnapshot(snap) {
  const v = snap.view || {};
  const s = v.share || {};
  characters.set(s.characters ? v.characters || [] : []);
  badges.set(s.characters ? v.badges || [] : []);
  itemDatabase.set(s.items ? v.itemDatabase || [] : []);
  craftingRecipes.set(s.crafting ? v.craftingRecipes || [] : []);
  mapData.set(s.map ? v.mapData || { backgroundId: null, regions: [] } : { backgroundId: null, regions: [] });
  relationships.set(s.relationships ? v.relationships || { axes: [], edges: [], positions: {} } : { axes: [], edges: [], positions: {} });
  diceSet.set(s.dice ? v.diceSet || [] : []);
  for (const [id, dataUrl] of Object.entries(snap.images || {})) {
    try {
      await putBlob(id, await (await fetch(dataUrl)).blob());
    } catch {
      /* ignore a bad image */
    }
  }
}

function blobToDataURL(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(blob);
  });
}
