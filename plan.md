# plan.md

## 1. Objectives
- Deliver an MVP multiplayer branching-narrative engine with **independent per-player progression** plus **Location Gates (all must arrive)** and **Vote Gates (majority decision)**.
- Build **clean core logic + data model + state tracking** first; then wrap with Admin (graph editor) and Player (room-based play) UIs.
- Seed an initial **“Airport Adventure (Zayn)”** story automatically on first backend startup.

## 2. Implementation Steps

### Phase 1 — Core Multiplayer Workflow POC (Isolation)
Focus: prove the hardest parts (WebSocket room sync + gates + vote resolution + flag-filtered choices) with minimal UI.

**Build (Backend-only + tiny CLI/web test page):**
1. Define Mongo collections + indexes: stories, nodes, choices, rooms, players, votes (+ unique room code, per-room player nickname).
2. Implement core services (pure functions where possible):
   - `available_choices(node, player_flags)` (requires_flag filtering)
   - `apply_choice(player, choice)` (advance node, sets_flag)
   - `location_gate_status(room, gate_node_id)` (reached/total)
   - `vote_state(room, node_id)` (tally, has_voted)
   - `resolve_vote_if_majority(room, node_id)` → winning choice → advance all players at gate
3. Add WebSocket room channel: join/leave, broadcast room snapshots, vote updates, gate progress.
4. Minimal HTTP endpoints to drive POC (no admin UI yet): create room, join, pick story, get node, choose, vote.
5. Seed “Zayn / Business Class Ticket” story on startup.
6. **POC validation script** (python or minimal node script): simulate 3 players in 1 room, walk through:
   - divergent personal branches
   - converge to a location gate (ensure waiting until all arrive)
   - hit vote gate (ensure majority wins, deterministic tie-break)

**POC user stories (must pass):**
1. As a player, I can join a room with code + nickname and receive a player_id.
2. As a player, I can make choices and my current node advances independently.
3. As a player, I only see choices whose required flag I have.
4. As a group, we cannot pass a location gate until all players have reached it.
5. As a group, we can vote at a vote gate and the majority decision advances everyone.

**Exit criteria:** POC script completes end-to-end reliably (including reconnect) and persisted state matches expectations.

---

### Phase 2 — V1 App Development (Admin + Player UIs + Full API)
Focus: build the full MVP around the proven core.

**Backend (FastAPI + Motor/MongoDB):**
1. Formalize Pydantic models + validation for Story/Node/Choice/Room/Player/Vote.
2. Public endpoints:
   - stories list, room create/join, room state, select story, get current node (with filtered choices), choose, vote.
3. WebSocket events:
   - `room_state`, `player_joined`, `player_progress`, `gate_progress`, `vote_update`, `vote_resolved`.
4. Admin endpoints (auth deferred to Phase 3): CRUD stories/nodes/choices, graph endpoint, bulk position update.
5. Ensure idempotency/guards:
   - prevent choosing invalid choice for node
   - prevent voting outside vote gate
   - prevent progressing past unresolved location/vote gates

**Frontend (React):**
1. Routing: `/` (Play/Admin), `/play`, `/play/:code`, `/admin`, `/admin/stories`, `/admin/stories/:id`.
2. Player flow:
   - Join/create room, lobby with live roster + story select + start.
   - Story screen: node text/character + choices.
   - Location gate screen: waiting/progress indicator.
   - Vote gate screen: cast vote + live tally + resolved result.
3. Admin flow (functional MVP):
   - Story list (create/delete/open).
   - React Flow canvas: nodes as cards; add node; edit node; add/edit choices; connect choice→node; drag positions autosave; mark start node; indicators for location/vote gates; flags on choices.
4. Shared WebSocket hook: connect/reconnect, apply server snapshots, optimistic UI only where safe.

**V1 user stories (must pass):**
1. As an admin, I can view the seeded Zayn story and its node links on the canvas.
2. As an admin, I can create/edit nodes and choices, connect them, and see edges update.
3. As a player, I can create/join a room and see lobby updates live when others join.
4. As a player, I can play independently while the room enforces location gates.
5. As a group, we can complete a vote gate and everyone moves to the winning destination.

**Phase-end testing:** run one full end-to-end pass (single browser + simulated players if needed; validate WebSocket updates). Fix until stable.

---

### Phase 3 — Password-Gated Admin + Hardening
Focus: add simple auth and stabilize data/state.

1. Add admin password gate:
   - `POST /api/admin/login` (checks env `ADMIN_PASSWORD`) → returns short-lived token.
   - Protect all `/api/admin/*` with bearer token.
2. Add safety + quality:
   - unique nickname per room, room inactive/cleanup policy, graceful player disconnect.
   - vote tie-break rule (e.g., earliest majority; if tie at timeout pick random/host).
   - server-side prevention of double voting and race conditions.
3. Add export/import JSON for stories (optional if time).

**Hardening user stories (must pass):**
1. As an admin, I cannot access admin APIs without a valid token.
2. As an admin, my token persists across refresh until expiry.
3. As a player, if I refresh, I can rejoin and recover my state (by player_id stored locally).
4. As a room, we handle a disconnect during a location gate without corrupting state.
5. As a room, votes cannot be cast twice by the same player.

**Phase-end testing:** testing agent validates core flows + admin gating.

---

### Phase 4 — Expansion (Only after V1 is stable)
- Better campaign tools: chapter markers, more gate types, story analytics, richer flag logic (AND/OR), import/export UI.
- Multi-room scaling improvements, admin collaboration, moderation tools.

## 3. Next Actions
1. Confirm vote rules: majority of **active players**; define tie-break + optional vote timeout.
2. Confirm location gate behavior: when all arrive, do we **auto-advance** to a single next node, or do players continue independently after the gate node?
3. Implement Phase 1 POC backend + seed + simulation script; iterate until green.

## 4. Success Criteria
- Core: independent progression works; choices filter by flags; location gates block until all; vote gates resolve by majority and advance group deterministically.
- UX: players can join by room code + nickname, select story, and complete seeded story end-to-end.
- Admin: can visually edit story graph and persist layout; seeded story is visible on first run.
- Reliability: WebSocket reconnection doesn’t lose room state; server enforces rules (no client-side trust).