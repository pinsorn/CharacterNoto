// Web Worker entry for off-thread chunk meshing. Lives under components/map3d so
// Vite bundles it as a module worker. Receives a mesh job (height/biome/dim/
// overrides/carves/aprons plus cx,cz,jobId), runs the pure mesher, and posts the
// result back with the geometry buffers transferred (zero-copy).
import { meshChunk, meshChunkSurface } from '../../lib/voxel/tileMesher.js';

self.onmessage = (e) => {
  const { jobId, ...job } = e.data;
  const r = job.surfaceOnly ? meshChunkSurface(job) : meshChunk(job); // far-LOD = gap-free column surface
  self.postMessage(
    { jobId, cx: job.cx, cz: job.cz, ...r },
    [r.positions.buffer, r.normals.buffer, r.colors.buffer, r.indices.buffer],
  );
};
