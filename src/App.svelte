<script>
  import { onMount } from 'svelte';
  import Characters from './components/Characters.svelte';
  import Items from './components/Items.svelte';
  import Crafting from './components/Crafting.svelte';
  import MapTab from './components/MapTab.svelte';
  import Map3DTab from './components/Map3DTab.svelte';
  import DiceTab from './components/DiceTab.svelte';
  import RelationshipGraph from './components/RelationshipGraph.svelte';
  import Toast from './components/Toast.svelte';
  import UseItemModal from './components/UseItemModal.svelte';
  import CraftingModal from './components/CraftingModal.svelte';
  import SharePanel from './components/SharePanel.svelte';
  import { characters, itemDatabase, craftingRecipes } from './lib/stores.js';
  import { exportZip, importZip } from './lib/backup.js';
  import { viewer } from './lib/mode.js';
  import { p2pStatus, receivedShare, playerJoin } from './lib/p2p.js';

  const allTabs = [
    { id: 'characters', label: 'Characters' },
    { id: 'items', label: 'Items' },
    { id: 'crafting', label: 'Crafting' },
    { id: '3dmap', label: '3D Map' },
    { id: 'map', label: 'Map' },
    { id: 'relationships', label: 'Relationships' },
    { id: 'dice', label: 'Dice' },
  ];
  // Viewers only see tabs the host shared.
  const tabs = $derived(viewer ? allTabs.filter((t) => $receivedShare?.[t.id]) : allTabs);

  let tab = $state('characters');
  $effect(() => {
    if (tabs.length && !tabs.some((t) => t.id === tab)) tab = tabs[0].id;
  });

  // Theme: persisted, applied to <html data-theme>.
  const THEMES = ['dark', 'light', 'dracula', 'synthwave', 'forest', 'business', 'night', 'cyberpunk', 'luxury', 'coffee'];
  let theme = $state(localStorage.getItem('theme') || 'dark');
  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  });

  // --- host: backup + share ---
  let backupInput;
  let shareOpen = $state(false);
  async function onBackupSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = null;
    if (!file) return;
    try { await importZip(file); } catch (err) { alert('Import failed: ' + err.message); }
  }

  // --- viewer: join a host ---
  const roomParam = new URLSearchParams(location.search).get('room');
  let joinCode = $state(roomParam || '');
  onMount(() => {
    if (viewer && roomParam) playerJoin(roomParam);
  });

  const totalItems = $derived($characters.reduce((s, c) => s + (c.items?.length || 0), 0));
</script>

<div class="max-w-5xl mx-auto p-4">
  <div class="flex flex-wrap items-center gap-2 mb-1">
    <h1 class="text-2xl font-bold mr-auto">Character Manager</h1>
    <select class="select select-xs select-bordered" bind:value={theme} title="Theme">
      {#each THEMES as t}<option value={t}>{t}</option>{/each}
    </select>
    {#if !viewer}
      <button class="btn btn-xs btn-primary" onclick={() => (shareOpen = true)}>Share</button>
      <button class="btn btn-xs btn-outline" onclick={exportZip}>Export Backup (.zip)</button>
      <button class="btn btn-xs btn-outline" onclick={() => backupInput.click()}>Import Backup</button>
      <input type="file" accept=".zip" class="hidden" bind:this={backupInput} onchange={onBackupSelected} />
    {/if}
  </div>

  {#if viewer}
    <!-- Viewer status / join -->
    <div class="flex flex-wrap items-center gap-2 mb-4 text-sm">
      {#if $p2pStatus.connected}
        <span class="badge badge-success">● Live</span> viewing the DM (read-only)
      {:else if $p2pStatus.role === 'player'}
        <span class="badge badge-warning">connecting…</span>
        {#if $p2pStatus.error}<span class="opacity-70">({$p2pStatus.error})</span>{/if}
      {:else}
        <input class="input input-sm input-bordered" placeholder="room code" bind:value={joinCode} />
        <button class="btn btn-sm btn-primary" onclick={() => joinCode && playerJoin(joinCode)} disabled={!joinCode}>Join</button>
      {/if}
    </div>
  {:else}
    <div class="text-sm opacity-70 mb-4">
      {$characters.length} characters · {totalItems} inventory items ·
      {$itemDatabase.length} wiki items · {$craftingRecipes.length} recipes
    </div>
  {/if}

  {#if tabs.length}
    <div role="tablist" class="tabs tabs-bordered mb-6">
      {#each tabs as t}
        <button role="tab" class="tab" class:tab-active={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </div>
  {:else if viewer}
    <div class="text-center opacity-60 py-10">Waiting for the DM to share…</div>
  {/if}

  <!-- Viewer content is read-only via `inert` (non-interactive); the tablist stays clickable. -->
  <div inert={viewer || undefined}>
    <div class:hidden={tab !== 'characters'}><Characters /></div>
    <div class:hidden={tab !== 'items'}><Items /></div>
    <div class:hidden={tab !== 'crafting'}><Crafting /></div>
    {#if !viewer}<div class:hidden={tab !== '3dmap'}><Map3DTab /></div>{/if}
    <div class:hidden={tab !== 'map'}><MapTab /></div>
    <div class:hidden={tab !== 'relationships'}><RelationshipGraph /></div>
    <div class:hidden={tab !== 'dice'}><DiceTab /></div>
  </div>
</div>

<Toast />
{#if !viewer}
  <UseItemModal />
  <CraftingModal />
  <SharePanel bind:open={shareOpen} />
{/if}
