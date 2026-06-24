<script>
  import Characters from './components/Characters.svelte';
  import Items from './components/Items.svelte';
  import Crafting from './components/Crafting.svelte';
  import MapTab from './components/MapTab.svelte';
  import DiceTab from './components/DiceTab.svelte';
  import RelationshipGraph from './components/RelationshipGraph.svelte';
  import Toast from './components/Toast.svelte';
  import UseItemModal from './components/UseItemModal.svelte';
  import CraftingModal from './components/CraftingModal.svelte';
  import { characters, itemDatabase, craftingRecipes } from './lib/stores.js';
  import { exportZip, importZip } from './lib/backup.js';

  let tab = $state('characters');
  const tabs = [
    { id: 'characters', label: 'Characters' },
    { id: 'items', label: 'Items' },
    { id: 'crafting', label: 'Crafting' },
    { id: 'map', label: 'Map' },
    { id: 'relationships', label: 'Relationships' },
    { id: 'dice', label: 'Dice' },
  ];

  // Theme: persisted, applied to <html data-theme>.
  const THEMES = ['dark', 'light', 'dracula', 'synthwave', 'forest', 'business', 'night', 'cyberpunk', 'luxury', 'coffee'];
  let theme = $state(localStorage.getItem('theme') || 'dark');
  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  });

  let backupInput;
  async function onBackupSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = null;
    if (!file) return;
    try {
      await importZip(file);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  }

  // All tabs stay mounted (toggled via .hidden) so state persists and the cross-tab
  // craftingFor / useItemFor modals react regardless of which tab is active.
  const totalItems = $derived($characters.reduce((s, c) => s + (c.items?.length || 0), 0));
</script>

<div class="max-w-5xl mx-auto p-4">
  <div class="flex flex-wrap items-center gap-2 mb-1">
    <h1 class="text-2xl font-bold mr-auto">Character Manager</h1>
    <select class="select select-xs select-bordered" bind:value={theme} title="Theme">
      {#each THEMES as t}<option value={t}>{t}</option>{/each}
    </select>
    <button class="btn btn-xs btn-outline" onclick={exportZip}>Export Backup (.zip)</button>
    <button class="btn btn-xs btn-outline" onclick={() => backupInput.click()}>Import Backup</button>
    <input type="file" accept=".zip" class="hidden" bind:this={backupInput} onchange={onBackupSelected} />
  </div>
  <div class="text-sm opacity-70 mb-4">
    {$characters.length} characters · {totalItems} inventory items ·
    {$itemDatabase.length} wiki items · {$craftingRecipes.length} recipes
  </div>

  <div role="tablist" class="tabs tabs-bordered mb-6">
    {#each tabs as t}
      <button role="tab" class="tab" class:tab-active={tab === t.id} onclick={() => (tab = t.id)}>
        {t.label}
      </button>
    {/each}
  </div>

  <div class:hidden={tab !== 'characters'}><Characters /></div>
  <div class:hidden={tab !== 'items'}><Items /></div>
  <div class:hidden={tab !== 'crafting'}><Crafting /></div>
  <div class:hidden={tab !== 'map'}><MapTab /></div>
  <div class:hidden={tab !== 'relationships'}><RelationshipGraph /></div>
  <div class:hidden={tab !== 'dice'}><DiceTab /></div>
</div>

<Toast />
<UseItemModal />
<CraftingModal />
