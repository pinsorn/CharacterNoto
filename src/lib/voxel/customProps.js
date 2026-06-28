// User-authored voxel props, persisted to localStorage. Each entry is prop data from voxelProp.js:
//   { id, name, res, voxels: [ [x,y,z,colorHex], ... ] }
// Voxel lists are small (sparse), so localStorage is fine. The overseer merges this list alongside
// the built-in PROPS (objects.js) so custom props appear in the prop library + renderer.
import { persisted } from '../stores.js';

export const customProps = persisted('voxelCustomProps', []);
