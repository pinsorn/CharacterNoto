// Greedy voxel mesher (spec §5): merge coplanar same-colour adjacent faces into quads.
// Pure + dependency-free so it runs in a Worker later and is unit-testable now.
// Classic 3-axis sweep (Lysenko). Input = a dense colour-key grid (0 = empty); output =
// indexed BufferGeometry attributes ready for THREE.BufferGeometry.
//
// @param {number[]} dims  [X,Y,Z]
// @param {(x:number,y:number,z:number)=>number} get  colour key at a cell (0 = empty)
// @param {(key:number)=>[number,number,number]} colorOf  key → rgb 0..1
// @returns {{positions:Float32Array,normals:Float32Array,colors:Float32Array,indices:Uint32Array,quads:number}}
export function greedyMesh(dims, get, colorOf) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vcount = 0;
  let quads = 0;

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);

    for (x[d] = -1; x[d] < dims[d]; ) {
      // Build the mask for the slice between layer x[d] and x[d]+1.
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
          const a = x[d] >= 0 ? get(x[0], x[1], x[2]) : 0;
          const b = x[d] < dims[d] - 1 ? get(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;
          // Face only where solid meets empty. Sign encodes which way it points.
          if (a && !b) mask[n] = a; // face on +d side, colour a
          else if (!a && b) mask[n] = -b; // face on -d side, colour b
          else mask[n] = 0;
        }
      }

      x[d]++; // plane coordinate of the faces just computed

      // Greedily emit merged quads from the mask.
      n = 0;
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u]; ) {
          const c = mask[n];
          if (c === 0) { i++; n++; continue; }
          // width run
          let w = 1;
          while (i + w < dims[u] && mask[n + w] === c) w++;
          // height run
          let h = 1;
          outer: while (j + h < dims[v]) {
            for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== c) break outer;
            h++;
          }

          x[u] = i;
          x[v] = j;
          const du = [0, 0, 0]; du[u] = w;
          const dv = [0, 0, 0]; dv[v] = h;
          const p0 = [x[0], x[1], x[2]];
          const p1 = [x[0] + du[0], x[1] + du[1], x[2] + du[2]];
          const p2 = [x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]];
          const p3 = [x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]];
          const dir = c > 0 ? 1 : -1;
          const nrm = [0, 0, 0]; nrm[d] = dir;
          const col = colorOf(Math.abs(c));
          // Wind CCW as seen from the side the face points toward (correct outward normals).
          const quad = dir > 0 ? [p0, p1, p2, p3] : [p0, p3, p2, p1];
          for (const p of quad) {
            positions.push(p[0], p[1], p[2]);
            normals.push(nrm[0], nrm[1], nrm[2]);
            colors.push(col[0], col[1], col[2]);
          }
          indices.push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3);
          vcount += 4;
          quads++;

          // zero the consumed region
          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
          i += w;
          n += w;
        }
      }
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
    quads,
  };
}
