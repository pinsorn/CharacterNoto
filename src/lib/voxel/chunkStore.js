// Per-chunk IndexedDB persistence (spec §4/§15). Own DB so it never collides with blobstore's
// migration. Chunks hold typed arrays + Map + Set — all structured-cloneable, so they store
// almost as-is (the runtime `dirty` flag is dropped). Keyed `${mapId}/${cx},${cz}`.
const DB_NAME = 'voxelworld';
const STORE = 'chunks';
let dbp;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
const tx = (mode) => openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

const chunkKey = (mapId, cx, cz) => `${mapId}/${cx},${cz}`;

export async function saveChunk(mapId, ch) {
  const s = await tx('readwrite');
  await wrap(s.put({ cx: ch.cx, cz: ch.cz, size: ch.size, height: ch.height, biome: ch.biome, overrides: ch.overrides, carves: ch.carves }, chunkKey(mapId, ch.cx, ch.cz)));
}

export async function loadChunk(mapId, cx, cz) {
  const s = await tx('readonly');
  const raw = await wrap(s.get(chunkKey(mapId, cx, cz)));
  if (!raw) return null;
  // legacy chunks (pre-resizable) have no `size`; infer from the square height array.
  const size = raw.size || Math.round(Math.sqrt(raw.height.length));
  return {
    cx, cz, size,
    height: raw.height,
    biome: raw.biome,
    overrides: raw.overrides instanceof Map ? raw.overrides : new Map(raw.overrides || []),
    carves: raw.carves instanceof Set ? raw.carves : new Set(raw.carves || []),
    dirty: true,
  };
}

export async function deleteMapChunks(mapId) {
  const s = await tx('readwrite');
  const keys = await wrap(s.getAllKeys());
  await Promise.all(keys.filter((k) => String(k).startsWith(`${mapId}/`)).map((k) => wrap(s.delete(k))));
}
