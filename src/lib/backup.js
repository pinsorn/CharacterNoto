// Full-fidelity backup as a .zip (manifest.json + images/). Built ON DEMAND only (export
// click / import), never in the live-save path — so there's no per-change cost.
import JSZip from 'jszip';
import { get } from 'svelte/store';
import { characters, badges, itemDatabase, craftingRecipes, mapData } from './stores.js';
import { allBlobs, putBlob } from './blobstore.js';

export async function exportZip() {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        version: 3,
        characters: get(characters),
        badges: get(badges),
        itemDatabase: get(itemDatabase),
        craftingRecipes: get(craftingRecipes),
        mapData: get(mapData),
      },
      null,
      2
    )
  );
  const images = zip.folder('images');
  for (const { id, blob } of await allBlobs()) images.file(id, blob);

  const out = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(out);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'characternoto-backup.zip';
  a.click();
  URL.revokeObjectURL(url);
}

export async function importZip(file) {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Not a CharacterNoto backup (no manifest.json)');
  const manifest = JSON.parse(await manifestFile.async('string'));

  // Restore images first so ids referenced by the manifest resolve.
  const imageEntries = [];
  zip.forEach((path, entry) => {
    if (path.startsWith('images/') && !entry.dir) imageEntries.push(entry);
  });
  for (const entry of imageEntries) {
    const id = entry.name.slice('images/'.length);
    await putBlob(id, await entry.async('blob'));
  }

  if (manifest.characters) characters.set(manifest.characters);
  if (manifest.badges) badges.set(manifest.badges);
  if (manifest.itemDatabase) itemDatabase.set(manifest.itemDatabase);
  if (manifest.craftingRecipes) craftingRecipes.set(manifest.craftingRecipes);
  if (manifest.mapData) mapData.set(manifest.mapData);
}
