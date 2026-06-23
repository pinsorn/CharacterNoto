// IndexedDB blob store for images (map backgrounds, avatars). Keeps large binaries out of
// localStorage (which would blow the ~5MB quota and silently lose data). Single object store.
const DB_NAME = 'characternoto';
const STORE = 'images';
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

function store(mode) {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function newImageId() {
  return 'img_' + (crypto.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
}

export async function putBlob(id, blob) {
  const s = await store('readwrite');
  await wrap(s.put(blob, id));
  return id;
}

export async function getBlob(id) {
  if (!id) return null;
  const s = await store('readonly');
  return (await wrap(s.get(id))) ?? null;
}

export async function delBlob(id) {
  if (!id) return;
  const s = await store('readwrite');
  await wrap(s.delete(id));
}

// For zip export: [{ id, blob }] of every stored image.
export async function allBlobs() {
  const s = await store('readonly');
  const keys = await wrap(s.getAllKeys());
  const blobs = await wrap(s.getAll());
  return keys.map((id, i) => ({ id, blob: blobs[i] }));
}
