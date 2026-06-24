<script>
  // Host "Share with players" panel: pick which tabs to share, go live (P2P), get a viewer link.
  import { get } from 'svelte/store';
  import { shareConfig } from '../lib/stores.js';
  import { hostStart, stop, p2pStatus } from '../lib/p2p.js';
  import Modal from './Modal.svelte';

  let { open = $bindable(false) } = $props();

  const TABS = [
    ['characters', 'Characters'], ['items', 'Items'], ['crafting', 'Crafting'],
    ['map', 'Map'], ['relationships', 'Relationships'], ['dice', 'Dice'],
  ];
  let starting = $state(false);
  let copied = $state(false);

  const live = $derived($p2pStatus.role === 'host' && !!$p2pStatus.code);
  const link = $derived(live ? `${location.origin}${location.pathname}?view=1&room=${$p2pStatus.code}` : '');

  async function goLive() {
    starting = true;
    try { await hostStart(() => get(shareConfig)); } catch {}
    starting = false;
  }
  const toggle = (key) => shareConfig.update((c) => ({ ...c, [key]: !c[key] }));
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); copied = true; setTimeout(() => (copied = false), 1500); } catch {}
  }
</script>

<Modal bind:open title="Share with players">
  <p class="text-sm opacity-70 mb-3">
    Players join <strong>read-only</strong> over a direct P2P link — no server, no account. Only the tabs you enable are sent.
  </p>

  <div class="grid grid-cols-2 gap-2 mb-4">
    {#each TABS as [key, label]}
      <label class="flex items-center gap-2">
        <input type="checkbox" class="toggle toggle-sm toggle-primary" checked={$shareConfig[key]} onchange={() => toggle(key)} />
        {label}
      </label>
    {/each}
  </div>

  {#if !live}
    <button class="btn btn-primary w-full" onclick={goLive} disabled={starting}>
      {starting ? 'Starting…' : 'Go Live'}
    </button>
  {:else}
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="badge badge-success">● Live</span>
        <span class="text-sm">{$p2pStatus.connected} player(s) connected</span>
      </div>
      <div class="join w-full">
        <input class="input input-sm input-bordered join-item flex-1" readonly value={link} />
        <button class="btn btn-sm join-item" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      <p class="text-xs opacity-60">Send the link to players. Room code: <strong>{$p2pStatus.code}</strong></p>
      <button class="btn btn-sm btn-error btn-outline" onclick={stop}>Stop sharing</button>
    </div>
  {/if}

  {#if $p2pStatus.error}
    <div class="alert alert-warning py-2 mt-3 text-sm">
      <span>Connection issue ({$p2pStatus.error}). Retry, or try another network — strict/corporate NAT can block P2P.</span>
    </div>
  {/if}

  <div class="modal-action">
    <button class="btn" onclick={() => (open = false)}>Close</button>
  </div>
</Modal>
