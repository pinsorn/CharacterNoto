// Direct DM↔Player sync over WebRTC (PeerJS). Star topology: the host broadcasts the
// filtered public view to every connected player. Players are read-only — inbound data
// from players is ignored. The PeerJS broker only brokers the handshake; game data is P2P.
import Peer from 'peerjs';
import { writable, get } from 'svelte/store';
import { snapshot, applySnapshot } from './publicview.js';
import { characters, badges, itemDatabase, craftingRecipes, mapData, relationships, diceSet, shareConfig, viewerHides } from './stores.js';

export const p2pStatus = writable({ role: null, code: null, connected: 0, error: null });
export const receivedShare = writable(null); // player: which tabs the host shared
export const receivedHides = writable({}); // player: DM-forced hide flags

let peer = null;
let conns = [];
let getShare = null;
let unsubs = [];
let debounceTimer = null;

function setStatus(patch) {
  p2pStatus.update((s) => ({ ...s, ...patch }));
}

// ---- HOST ----------------------------------------------------------------
export function hostStart(shareGetter) {
  getShare = shareGetter;
  peer = new Peer();
  return new Promise((resolve, reject) => {
    peer.on('open', (id) => {
      setStatus({ role: 'host', code: id, connected: 0, error: null });
      // re-broadcast (debounced) whenever shared data changes
      const stores = [characters, badges, itemDatabase, craftingRecipes, mapData, relationships, diceSet, shareConfig, viewerHides];
      unsubs = stores.map((s) => s.subscribe(() => scheduleBroadcast()));
      resolve(id);
    });
    peer.on('error', (e) => {
      setStatus({ error: e?.type || String(e) });
      reject(e);
    });
    peer.on('connection', (conn) => {
      conn.on('open', async () => {
        conns.push(conn);
        setStatus({ connected: conns.length });
        try { conn.send(await snapshot(getShare())); } catch {}
      });
      conn.on('data', () => {/* read-only: ignore inbound */});
      conn.on('close', () => {
        conns = conns.filter((c) => c !== conn);
        setStatus({ connected: conns.length });
      });
    });
  });
}

function scheduleBroadcast() {
  if (!peer || !conns.length || !getShare) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(broadcast, 250);
}
export async function broadcast() {
  if (!conns.length || !getShare) return;
  const snap = await snapshot(getShare());
  for (const c of conns) {
    try { c.send(snap); } catch {}
  }
}

// ---- PLAYER --------------------------------------------------------------
export function playerJoin(code) {
  peer = new Peer();
  setStatus({ role: 'player', code, connected: 0, error: null });
  peer.on('open', () => {
    const conn = peer.connect(code, { reliable: true });
    conn.on('open', () => setStatus({ connected: 1, error: null }));
    conn.on('data', (snap) => {
      receivedShare.set(snap?.view?.share || {});
      receivedHides.set(snap?.view?.hides || {});
      applySnapshot(snap);
    });
    conn.on('close', () => setStatus({ connected: 0 }));
    conn.on('error', (e) => setStatus({ error: e?.type || String(e) }));
  });
  peer.on('error', (e) => setStatus({ role: 'player', error: e?.type || String(e) }));
}

export function stop() {
  clearTimeout(debounceTimer);
  unsubs.forEach((u) => u());
  unsubs = [];
  try { peer?.destroy(); } catch {}
  peer = null;
  conns = [];
  getShare = null;
  setStatus({ role: null, code: null, connected: 0, error: null });
}
