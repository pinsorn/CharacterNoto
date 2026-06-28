// Web Worker entry for off-thread chunk meshing. Lives under components/map3d so
// Vite bundles it as a module worker. Receives a mesh job (height/biome/dim/
// overrides/carves/aprons plus cx,cz,jobId), runs the pure mesher, and posts the
// result back with the geometry buffers transferred (zero-copy).
import { meshChunk } from '../../lib/voxel/tileMesher.js';

self.onmessage = (e) => {
  const { jobId, ...job } = e.data;
  const r = meshChunk(job);
  self.postMessage(
    { jobId, cx: job.cx, cz: job.cz, ...r },
    [r.positions.buffer, r.normals.buffer, r.colors.buffer, r.indices.buffer],
  );
};
