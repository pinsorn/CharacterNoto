# Host → Viewer Sync (serverless) — Plan (Draft, not built)

Goal: a **host (DM)** shares state with **viewers (players)** who are **read-only**, with **per-field/entity visibility** (some data hidden from players). **Serverless** — no backend to run; static hosting (e.g. GitHub Pages) stays as-is.

---

## Core principle: publish a FILTERED projection (security, not just UI-hiding)
Read-only + hidden fields must be enforced at the **source**, not the viewer UI. So the host computes a **public view** = the data with hidden entities/fields removed, and only THAT is transmitted. Viewers literally never receive secret data. One-way: host → viewers.

- Add a **`hidden` flag** on shareable entities (characters, items, recipes, map regions, relationship edges/axes) + per-tab "share this tab" toggles.
- `buildPublicView(state, visibility)` → a stripped JSON projection (+ image URLs/refs for visible images only).
- Viewers run in **viewer mode** (no edit controls) and render the existing components from the public view.

---

## Transport options (all serverless from our side)

### Option A — BaaS realtime (Supabase or Firebase) — recommended
- Host writes `rooms/{roomId}` = the public-view JSON; images go to the BaaS **Storage** bucket (host uploads visible images, public view holds their URLs).
- Viewers open `?room=roomId`, **subscribe** to the doc → live updates. Read-only by security rule (only the authenticated host can write; anyone with the room id can read).
- ✅ Reliable through NAT, ✅ images handled (Storage), ✅ true realtime, ✅ generous free tier, ✅ host can be offline (last published view persists).
- ⚠️ Needs a one-time 3rd-party project + a public anon key baked into the static app (safe: write is locked down; read is the intended public room). Host signs in (or holds a room secret) to publish.

### Option B — P2P WebRTC (PeerJS / Yjs y-webrtc) — no data stored anywhere
- Host opens a room; viewers connect peer-to-peer; host pushes the public view (+ image blobs) directly. Nothing stored on any server.
- ✅ Max privacy (no third-party copy), ✅ realtime.
- ⚠️ **Host must stay online** (viewers connect to the host's browser), ⚠️ needs a signaling step (public signaling server or paste offer/answer) and a **STUN/TURN** for hard NATs (TURN isn't reliably free/serverless) → flakier.

### Option C — Snapshot + poll (simplest)
- Host publishes the public view (JSON + small images as base64, or to a gist/KV) on a button or interval; viewers fetch/poll every few seconds.
- ✅ Dead simple, works on pure static hosting (+ any KV/gist/blob the host can PUT to).
- ⚠️ Near-real-time (poll lag), image size limits if base64.

**Recommendation: Option A (Supabase).** Reliable, real images, true realtime, free; the only cost is a one-time project + an anon key in the app.

---

## Viewer mode
- A URL flag (`?room=ID&view=1`) or a separate route renders the app **read-only**: hide all add/edit/delete/roll-write controls, disable inputs, subscribe to the public view.
- Reuse existing components in a read-only prop mode (or a thin read-only wrapper). Tabs the host didn't share are hidden for viewers.
- Optional: a "live" badge + reconnect handling.

## Visibility model (host UI)
- Per entity: a small "👁 hide from players" toggle (characters, items, recipes, map regions, relationship edges/axes, dice).
- Per tab: "Share Characters / Map / Relationships …" toggles.
- Per field (optional, finer): e.g. hide a character's stats or a specific custom param. Start coarse (entity/tab), add field-level later.
- A **"Go Live / Share"** panel: shows the room link/QR, what's currently shared, and a publish indicator.

## Images
- Visible map background + avatars must reach viewers. With BaaS: upload the referenced blobs to Storage on publish, put URLs in the public view; viewer's `BlobImage` falls back to a URL source. With P2P/snapshot: send/base64 the visible blobs.

## Security notes
- Anon key in a static app is normal for BaaS; protect with rules (host-only write, room-id read). Don't put secrets in the public view (that's the whole point of the filter).
- Room id should be unguessable (random) if the data is sensitive; optionally a read token.

---

## Phasing
1. **Visibility model**: `hidden` flags + per-tab share toggles + `buildPublicView()` (pure, testable).
2. **Viewer mode**: read-only render of a public view from a local file first (no network) — proves the read-only UI.
3. **Transport**: wire Supabase (host publish on change + viewer subscribe); images to Storage.
4. **Share panel + room link/QR**, reconnect, "live" badge.

## Decisions — RESOLVED ✅
- **D1 → P2P WebRTC.** Direct DM↔Player, browser-to-browser. No game data stored anywhere, no account. ✅
- **D2 → per-tab + per-entity** visibility toggles (field-level later). ✅
- **D4 → no BaaS account.** ✅

---

## P2P design (DM ↔ Player direct)

**Topology: star.** DM = host (has full data). Each Player = a read-only spoke with a direct WebRTC connection to the DM. DM broadcasts the filtered **public view** to all connected players; updates stream live on any change. Players never send game data back (read-only enforced: host ignores inbound).

**Library:** **PeerJS** (thin wrapper over WebRTC data channels + a free broker for the handshake). Lazy, reliable enough, no account.

**The one non-P2P bit = signaling (handshake).** WebRTC needs to exchange connection info once to open the direct pipe. Two serverless ways:
- **(a) Room code via PeerJS public broker [recommended UX]:** DM opens a session → gets a short **room code** (PeerJS id) → tells players (Discord/voice). Player enters the code → P2P connects. The broker only brokers the handshake; **no game data passes through it**, no account.
- **(b) Manual copy-paste [zero third-party]:** DM generates an offer blob → sends to player by any channel → player pastes, returns an answer blob → DM pastes. Truly zero infrastructure, clunkier. Good fallback / privacy-max mode.

**NAT/connectivity:** uses free public **STUN** (e.g. Google) for NAT traversal — works on typical home/mobile networks. **TURN** (needed for strict/symmetric NAT, e.g. some corporate Wi‑Fi) is not freely serverless → not included; fallback for those rare cases = manual-paste or same-network. (Note the limitation in the UI.)

**Data over the channel:**
- On connect, DM sends a full public-view snapshot; afterwards, diffs or full snapshots on change (start with full snapshots — simple; diff later if needed).
- **Images** (visible map background / avatars) sent as binary over the data channel; player keeps them as object URLs (reuses `BlobImage`).

**Read-only viewer mode:** `?view=1` (or a "Join as Player" entry) renders the app read-only — inputs disabled, no add/edit/delete/roll-write, only shared tabs visible — fed by the received public view.

---

## Decisions (cont.) — RESOLVED ✅
- **D5 → Room code via PeerJS broker.** (Manual-paste fallback can come later if a strict-NAT case needs it.) ✅
- **D6 → Many players** (star broadcast). ✅

Plan fully locked. Ready to build on go.

---

## Build phasing (v3.5.0)
1. **Visibility model** — `hidden` flags on shareable entities + per-tab "share" toggles in a host **Share panel**; pure `buildPublicView(state, visibility)` (+ node test).
2. **Read-only viewer mode** — `?view=1` renders the app from a public view with all write controls disabled / unshared tabs hidden. Test against a local public-view file first (no network).
3. **P2P layer** (`lib/p2p.js`, PeerJS) — host: open session → room code, accept many player connections, broadcast public view + visible image blobs, ignore inbound (read-only). player: enter code → connect → receive → render. Reconnect handling + a "live/connected" badge + player count.
4. **Wire it up** — host publishes on store change (debounced); images streamed; verify with two browser contexts (host + viewer) over a real P2P connection.

New dependency: **peerjs** (handshake broker only; game data stays P2P). STUN = public; no TURN (note limitation in UI).
