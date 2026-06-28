// Streaming render for BIG (chunked) voxel maps (spec "deferred spine" + P2).
// Keeps a live window of CHUNK_DIM chunks within a Chebyshev radius of the camera
// target: loads missing chunks from IndexedDB, unloads out-of-range ones, and meshes
// each in a Web Worker (apron from loaded neighbours so seams cull correctly). Every
// chunk = ONE THREE.Mesh world-offset to (cx*DIM, 0, cz*DIM).
//
// Big-map only — small maps keep the single-chunk path in Map3DTab. Terrain EDIT on
// big maps is deferred (P2 gate = render + pan); only the render/stream loop lives here.
import { CHUNK_DIM, lidx, chunkKey, chunksInRadius, worldToChunk } from '../../lib/voxel/chunkGrid.js';
import { loadChunk, saveChunk } from '../../lib/voxel/chunkStore.js';
import { meshChunk } from '../../lib/voxel/tileMesher.js';
import { createChunk as createScratch } from '../../lib/voxel/world.js';

const MAX_JOBS_PER_FLUSH = 6; // cap dispatches/frame so a fresh window doesn't stall the main thread

export class ChunkManager {
  /**
   * @param {*} scene THREE.Scene
   * @param {*} THREE the three.js instance (passed in so this stays node-importable)
   * @param {string} mapId
   * @param {{wChunks:number,hChunks:number,dim?:number}} meta map index record
   * @param {*} material shared terrain material (MeshStandardMaterial, vertexColors)
   */
  constructor(scene, THREE, mapId, meta, material) {
    this.scene = scene;
    this.THREE = THREE;
    this.mapId = mapId;
    this.dim = meta.dim || CHUNK_DIM;
    this.wChunks = meta.wChunks;
    this.hChunks = meta.hChunks;
    this.material = material;
    this.loaded = new Map();   // "cx,cz" -> { chunk, mesh:Mesh|null, jobId:number }
    this.loading = new Set();  // keys with an in-flight loadChunk
    this.dirty = new Set();    // keys needing (re)mesh
    this.jobs = new Map();     // jobId -> key (worker round-trips)
    this.jobId = 1;
    this.unsaved = new Set();  // touched chunk keys awaiting a debounced saveChunk()
    this.lastCenter = null;    // "ccx,ccz" so setView only re-windows when the centre chunk moves
    this.centerCX = 0;
    this.centerCZ = 0;
    this.radius = 0;
    this._initWorker();
  }

  _initWorker() {
    try {
      this.worker = new Worker(new URL('./meshWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this._onMesh(e.data);
    } catch {
      this.worker = null; // fallback: synchronous main-thread meshing
    }
  }

  /** Voxel extent of the whole map. */
  get extentX() { return this.wChunks * this.dim; }
  get extentZ() { return this.hChunks * this.dim; }

  /**
   * Bring the loaded window to within `radiusChunks` of the world point (centerX,centerZ),
   * then flush a capped batch of dirty meshes. Cheap to call every frame: it only re-windows
   * when the centre chunk changes, but always drains the mesh queue.
   */
  setView(centerX, centerZ, radiusChunks) {
    const { cx: ccx, cz: ccz } = worldToChunk(centerX, centerZ);
    const centerKey = chunkKey(ccx, ccz);
    this.centerCX = ccx;
    this.centerCZ = ccz;
    this.radius = radiusChunks;
    if (centerKey !== this.lastCenter) {
      this.lastCenter = centerKey;
      this._window(centerX, centerZ, radiusChunks);
    }
    this._flush();
  }

  _window(centerX, centerZ, radiusChunks) {
    const want = chunksInRadius(centerX, centerZ, radiusChunks, this.wChunks, this.hChunks);
    const wantSet = new Set(want.map((c) => chunkKey(c.cx, c.cz)));

    // unload chunks no longer in range — dispose mesh, drop arrays, re-dirty live neighbours
    // (their apron toward this chunk reverts to a cliff so the wall reappears).
    for (const key of [...this.loaded.keys()]) {
      if (!wantSet.has(key)) {
        const e = this.loaded.get(key);
        this._disposeMesh(e);
        this.loaded.delete(key);
        this.dirty.delete(key);
        const [cx, cz] = key.split(',').map(Number);
        this._dirtyNeighbours(cx, cz);
      }
    }

    // load missing chunks (nearest-first via chunksInRadius order)
    for (const { cx, cz } of want) {
      const key = chunkKey(cx, cz);
      if (this.loaded.has(key) || this.loading.has(key)) continue;
      this.loading.add(key);
      loadChunk(this.mapId, cx, cz).then((chunk) => {
        this.loading.delete(key);
        if (!chunk) return; // empty cell (shouldn't happen for a generated map)
        // discard if the window moved past this chunk while IDB was resolving (Chebyshev, matches chunksInRadius)
        if (Math.abs(cx - this.centerCX) > this.radius || Math.abs(cz - this.centerCZ) > this.radius) return;
        this.loaded.set(key, { chunk, mesh: null, jobId: 0 });
        this.dirty.add(key);
        this._dirtyNeighbours(cx, cz); // their apron toward the new chunk changed
      });
    }
  }

  /** Mark the 4 edge-neighbours dirty if they're loaded (apron across the shared edge changed). */
  _dirtyNeighbours(cx, cz) {
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
      const k = chunkKey(nx, nz);
      if (this.loaded.has(k)) this.dirty.add(k);
    }
  }

  _flush() {
    if (!this.dirty.size) return;
    let n = 0;
    for (const key of [...this.dirty]) {
      if (n >= MAX_JOBS_PER_FLUSH) break;
      this.dirty.delete(key);
      if (this.loaded.has(key)) { this._mesh(key); n++; }
    }
  }

  /** Edge-column heights of a loaded neighbour, indexed for the shared seam (or null = cliff). */
  _apronFor(cx, cz) {
    const D = this.dim;
    const edge = (nx, nz, pick) => {
      const e = this.loaded.get(chunkKey(nx, nz));
      if (!e) return null;
      const h = e.chunk.height;
      const a = new Int16Array(D);
      for (let i = 0; i < D; i++) a[i] = h[pick(i)];
      return a;
    };
    return {
      px: edge(cx + 1, cz, (lz) => lz * D + 0),       // +x neighbour's lx=0 column, by local z
      nx: edge(cx - 1, cz, (lz) => lz * D + (D - 1)), // -x neighbour's lx=D-1 column, by local z
      pz: edge(cx, cz + 1, (lx) => 0 * D + lx),       // +z neighbour's lz=0 row, by local x
      nz: edge(cx, cz - 1, (lx) => (D - 1) * D + lx), // -z neighbour's lz=D-1 row, by local x
    };
  }

  _mesh(key) {
    const e = this.loaded.get(key);
    if (!e) return;
    const { cx, cz } = e.chunk;
    const id = this.jobId++;
    e.jobId = id; // newest job for this key — older results are dropped as stale
    const job = {
      jobId: id, cx, cz, dim: this.dim,
      height: e.chunk.height, biome: e.chunk.biome,
      overrides: [...(e.chunk.overrides || [])],
      carves: [...(e.chunk.carves || [])],
      aprons: this._apronFor(cx, cz),
    };
    if (this.worker) {
      this.jobs.set(id, key);
      this.worker.postMessage(job); // NO transfer list: keep height/biome on the chunk for heightAt/raycast
    } else {
      this._onMesh({ jobId: id, cx, cz, ...meshChunk(job) }); // sync fallback
    }
  }

  _onMesh(data) {
    const { jobId } = data;
    // worker results carry cx/cz; the sync path loses them, so recover the key from jobs/loaded.
    let key = this.jobs.get(jobId);
    if (key === undefined && data.cx !== undefined) key = chunkKey(data.cx, data.cz);
    this.jobs.delete(jobId);
    if (key === undefined) return;
    const e = this.loaded.get(key);
    if (!e || e.jobId !== jobId) return; // unloaded mid-flight, or superseded by a newer mesh

    const T = this.THREE;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(data.positions, 3));
    g.setAttribute('normal', new T.BufferAttribute(data.normals, 3));
    g.setAttribute('color', new T.BufferAttribute(data.colors, 3));
    g.setIndex(new T.BufferAttribute(data.indices, 1));
    g.computeBoundingSphere();

    if (e.mesh) {
      e.mesh.geometry.dispose();
      e.mesh.geometry = g;
    } else {
      const [cx, cz] = key.split(',').map(Number);
      e.mesh = new T.Mesh(g, this.material);
      e.mesh.position.set(cx * this.dim, 0, cz * this.dim); // world-offset (footgun #1)
      e.mesh.userData.chunkKey = key;
      this.scene.add(e.mesh);
    }
  }

  /** Surface top y at a global voxel cell (token snap). Loaded chunk → column height; else default. */
  heightAt(gx, gz) {
    const { cx, cz, lx, lz } = worldToChunk(gx, gz);
    const e = this.loaded.get(chunkKey(cx, cz));
    if (!e) return 6;
    return e.chunk.height[lidx(lx, lz)];
  }

  /** Loaded chunk meshes for raycasting (terrain picks, token drag). */
  raycastTargets() {
    const out = [];
    for (const e of this.loaded.values()) if (e.mesh) out.push(e.mesh);
    return out;
  }

  /** Loaded chunk (or null) — for data-driven topview raster. */
  getChunk(cx, cz) {
    return this.loaded.get(chunkKey(cx, cz))?.chunk || null;
  }

  loadedCount() { return this.loaded.size; }

  // --- editing (big-map terrain) -------------------------------------------
  // height/biome (+sub-key) of a global column from its loaded chunk, or null (unloaded/out of map).
  _columnAt(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= this.extentX || gz >= this.extentZ) return null;
    const { cx, cz, lx, lz } = worldToChunk(gx, gz);
    const e = this.loaded.get(chunkKey(cx, cz));
    if (!e) return null;
    const i = lidx(lx, lz);
    return { h: e.chunk.height[i], b: e.chunk.biome[i] };
  }
  // Write a column's height+biome back to its owning LOADED chunk (drop if unloaded/out of map).
  _writeColumn(gx, gz, h, b, touched) {
    if (gx < 0 || gz < 0 || gx >= this.extentX || gz >= this.extentZ) return;
    const { cx, cz, lx, lz } = worldToChunk(gx, gz);
    const key = chunkKey(cx, cz);
    const e = this.loaded.get(key);
    if (!e) return;
    const i = lidx(lx, lz);
    e.chunk.height[i] = h;
    e.chunk.biome[i] = b;
    touched.add(key);
  }
  _writeCarve(gx, ay, gz, touched) {
    const { cx, cz, lx, lz } = worldToChunk(gx, gz);
    const key = chunkKey(cx, cz);
    const e = this.loaded.get(key);
    if (!e) return;
    e.chunk.carves.add(`${lx},${ay},${lz}`); // chunk-LOCAL x,z; ABSOLUTE y
    touched.add(key);
  }

  /**
   * Apply a radius brush centred on global cell (gx,gz). `runBrush(scratch, lcx, lcz)` runs the
   * actual stamp (caller closes over tool/opts) on a scratch chunk built over the affected bbox.
   * Reuses brushes.applyBrush unchanged — boundary continuity (smooth/falloff) is preserved because
   * the scratch spans across chunk seams with a 1-cell read-only border.
   */
  brushAtWorld(gx, gz, radius, runBrush) {
    const R = Math.max(0, radius | 0);
    const S = 2 * R + 3;                 // +1 border each side (smooth reads ±1 outside the footprint)
    const ox = gx - R - 1, oz = gz - R - 1;
    const sc = createScratch(0, 0, 6, 0, S); // real chunk shape (size=S), defaults where neighbours absent
    for (let lz = 0; lz < S; lz++) for (let lx = 0; lx < S; lx++) {
      const src = this._columnAt(ox + lx, oz + lz);
      if (src) { sc.height[lz * S + lx] = src.h; sc.biome[lz * S + lx] = src.b; }
    }
    runBrush(sc, R + 1, R + 1);
    // write the brush-writable inner region (border is context only) — heights FIRST, dirty after.
    const touched = new Set();
    for (let lz = 1; lz < S - 1; lz++) for (let lx = 1; lx < S - 1; lx++) {
      this._writeColumn(ox + lx, oz + lz, sc.height[lz * S + lx], sc.biome[lz * S + lx], touched);
    }
    for (const k of sc.carves) { // carve tool: translate scratch-local key → global → chunk-local
      const [slx, sy, slz] = k.split(',').map(Number);
      this._writeCarve(ox + slx, sy, oz + slz, touched);
    }
    this._touch(touched);
    return touched;
  }

  /** Place/erase a single block voxel at a global (gx,gy,gz). `fn(chunk, lx, gy, lz)` mutates it. */
  editBlockAtWorld(gx, gy, gz, fn) {
    if (gx < 0 || gz < 0 || gx >= this.extentX || gz >= this.extentZ) return;
    const { cx, cz, lx, lz } = worldToChunk(gx, gz);
    const key = chunkKey(cx, cz);
    const e = this.loaded.get(key);
    if (!e) return;
    fn(e.chunk, lx, gy, lz);
    // apron uses neighbour HEIGHT only, so a block on a seam needs no neighbour re-mesh.
    this.dirty.add(key);
    this.unsaved.add(key);
  }

  // Mark touched chunks (and their apron-neighbours) dirty, and queue them for save.
  _touch(keys) {
    for (const key of keys) {
      this.dirty.add(key);
      this.unsaved.add(key);
      const [cx, cz] = key.split(',').map(Number);
      this._dirtyNeighbours(cx, cz);
    }
  }

  /** Persist all chunks edited since the last save. */
  save() {
    for (const key of this.unsaved) {
      const e = this.loaded.get(key);
      if (e) saveChunk(this.mapId, e.chunk);
    }
    this.unsaved.clear();
  }

  _disposeMesh(e) {
    if (e?.mesh) {
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh = null;
    }
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const e of this.loaded.values()) this._disposeMesh(e);
    this.loaded.clear();
    this.loading.clear();
    this.dirty.clear();
    this.jobs.clear();
  }
}
