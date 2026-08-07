"""
Branching Narrative RPG Engine — Backend
Synchronized group-voting runtime:
- All players in a room share ONE current node, ONE set of flags, ONE phase.
- Phases per node: reading (10s, no votes) -> voting (20s or until everyone voted) -> resolve.
- Ties trigger a spinning-wheel (server picks random winner from tied options; broadcasts to clients for animation).
- Winning choice is applied for the whole group; everyone advances together.
- Editor (admin) endpoints and data model unchanged.

Database: Supabase (PostgreSQL via supabase-py sync client, run in asyncio thread pool).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import string
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_client, Client
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Initialized lazily in the startup event so the server binds its port
# even when SUPABASE_URL / SUPABASE_KEY are not yet configured.
supa: Optional[Client] = None

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "admin-secret-token-" + str(uuid.uuid4())[:8])

# Phase timings (seconds)
READING_SECONDS = 10
VOTING_SECONDS = 20
WHEEL_SECONDS = 4.5

app = FastAPI(title="Narrative RPG Engine")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ============================================================
# Models
# ============================================================

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


class Choice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    destination_node_id: Optional[str] = None
    sets_flag: Optional[str] = None
    requires_flag: Optional[str] = None


class Node(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    story_id: str
    title: str
    story_text: str = ""
    character: str = ""
    position_x: float = 0.0
    position_y: float = 0.0
    is_location_gate: bool = False
    is_vote_gate: bool = False
    is_end: bool = False
    choices: List[Choice] = Field(default_factory=list)


class Story(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    start_node_id: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)


class Player(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_code: str
    nickname: str
    joined_at: str = Field(default_factory=_now_iso)
    is_host: bool = False


class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str
    story_id: Optional[str] = None
    started: bool = False
    current_node_id: Optional[str] = None
    phase: str = "lobby"          # lobby | reading | voting | wheel | ended
    phase_ends_at: Optional[str] = None
    flags: List[str] = Field(default_factory=list)
    wheel_options: Optional[List[Dict[str, Any]]] = None
    wheel_winner_choice_id: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)


# --- Request/response payloads ---

class AdminLoginRequest(BaseModel):
    password: str


class StoryCreate(BaseModel):
    title: str
    description: str = ""


class StoryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_node_id: Optional[str] = None


class NodeCreate(BaseModel):
    story_id: str
    title: str = "Untitled Node"
    story_text: str = ""
    character: str = ""
    position_x: float = 0.0
    position_y: float = 0.0
    is_location_gate: bool = False
    is_vote_gate: bool = False
    is_end: bool = False
    choices: List[Choice] = Field(default_factory=list)


class NodeUpdate(BaseModel):
    title: Optional[str] = None
    story_text: Optional[str] = None
    character: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    is_location_gate: Optional[bool] = None
    is_vote_gate: Optional[bool] = None
    is_end: Optional[bool] = None
    choices: Optional[List[Choice]] = None


class PositionUpdate(BaseModel):
    id: str
    position_x: float
    position_y: float


class RambleInterpretRequest(BaseModel):
    story_id: str
    transcript: str
    selected_node_id: Optional[str] = None
    variation_count: int = Field(default=1, ge=1, le=3)


class RambleApplyRequest(BaseModel):
    story_id: str
    proposal: Dict[str, Any]


class RoomJoinRequest(BaseModel):
    nickname: str


class RoomSelectStoryRequest(BaseModel):
    story_id: str


class VoteRequest(BaseModel):
    player_id: str
    choice_id: str


# ============================================================
# DB helpers — sync supabase client, executed in thread pool
# ============================================================

async def _q(fn):
    """Run a synchronous supabase-py call off the event loop.
    Raises HTTP 503 with a clear message if the DB client is not yet initialised."""
    if supa is None:
        raise HTTPException(
            status_code=503,
            detail="Database not configured — set SUPABASE_URL and SUPABASE_KEY secrets then restart the backend.",
        )
    return await asyncio.to_thread(fn)


async def get_node(node_id: str) -> Optional[Dict[str, Any]]:
    res = await _q(
        lambda: supa.table("nodes").select("*").eq("id", node_id).maybe_single().execute()
    )
    return res.data if res is not None else None


async def get_room(code: str) -> Optional[Dict[str, Any]]:
    res = await _q(
        lambda: supa.table("rooms").select("*").eq("code", code).maybe_single().execute()
    )
    return res.data if res is not None else None


async def get_player(player_id: str) -> Optional[Dict[str, Any]]:
    res = await _q(
        lambda: supa.table("players").select("*").eq("id", player_id).maybe_single().execute()
    )
    return res.data if res is not None else None


async def get_story(story_id: str) -> Optional[Dict[str, Any]]:
    res = await _q(
        lambda: supa.table("stories").select("*").eq("id", story_id).maybe_single().execute()
    )
    return res.data if res is not None else None


def generate_room_code(length: int = 5) -> str:
    alphabet = string.ascii_uppercase + string.digits
    # Avoid confusing characters
    alphabet = "".join(c for c in alphabet if c not in "0O1I")
    return "".join(random.choices(alphabet, k=length))


def filter_choices_by_flags(node: Dict[str, Any], flags: List[str]) -> List[Dict[str, Any]]:
    """Return only choices whose requires_flag is satisfied. Fail-open if that empties the list."""
    fset = set(flags or [])
    out: List[Dict[str, Any]] = []
    for c in node.get("choices", []) or []:
        req = c.get("requires_flag")
        if req and req not in fset:
            continue
        out.append(c)
    if not out and node.get("choices"):
        return list(node["choices"])  # fail-open
    return out


def require_admin(x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


# ============================================================
# Ramble Studio — AI-assisted story editor (Supabase-native)
# ============================================================

def _json_from_ai(text: str) -> Dict[str, Any]:
    """Parse a JSON object even when the model wraps it in a markdown fence."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I | re.S)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("AI did not return a JSON object")
    return json.loads(text[start : end + 1])


async def _openai_json(system: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise HTTPException(
            503,
            "Ramble AI is not configured — add OPENAI_API_KEY to your Replit Secrets, then restart the backend.",
        )

    def call():
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": os.environ.get("RAMBLE_AI_MODEL", "gpt-4o-mini"),
                "response_format": {"type": "json_object"},
                "temperature": 0.65,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            },
            timeout=90,
        )
        response.raise_for_status()
        return _json_from_ai(response.json()["choices"][0]["message"]["content"])

    try:
        return await asyncio.to_thread(call)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Ramble AI failed")
        raise HTTPException(502, f"Ramble AI failed: {str(exc)[:160]}")


def _validate_proposal(
    story_id: str, proposal: Dict[str, Any], existing: List[Dict[str, Any]]
) -> List[str]:
    errors: List[str] = []
    existing_ids = {n["id"] for n in existing}
    operations = proposal.get("operations") or []

    if not operations:
        errors.append("The proposal has no changes.")
        return errors

    temp_ids: Dict[str, int] = {}
    deleted_ids: set = set()
    updated_ids: set = set()

    for op in operations:
        action = op.get("action")
        if action == "create":
            tid = op.get("temp_id")
            if not tid:
                errors.append("A create operation is missing its temp_id.")
            elif tid in temp_ids:
                errors.append(f"Duplicate temp_id '{tid}' — each new node needs a unique ID.")
            else:
                temp_ids[tid] = 1
        elif action == "delete":
            nid = op.get("node_id")
            if not nid:
                errors.append("A delete operation is missing node_id.")
            elif nid not in existing_ids:
                errors.append(f"Cannot delete node '{nid}' — not found in this story.")
            else:
                deleted_ids.add(nid)
        elif action == "update":
            nid = op.get("node_id")
            if not nid:
                errors.append("An update operation is missing node_id.")
            elif nid not in existing_ids:
                errors.append(f"Cannot update node '{nid}' — not found in this story.")
            elif nid in deleted_ids:
                errors.append(f"Cannot update node '{nid}' — it is also being deleted.")
            else:
                updated_ids.add(nid)

    valid_targets = (existing_ids - deleted_ids) | set(temp_ids.keys())

    for op in operations:
        node_body = op.get("node") or {}
        for c in node_body.get("choices") or []:
            dest = c.get("destination_node_id")
            if dest and dest not in valid_targets:
                errors.append(
                    f"Choice '{c.get('text','?')}' points to unknown destination '{dest}'."
                )

    return errors


_INTERPRET_SYSTEM = """
You are a collaborative story-structure assistant for a branching narrative game called Moments.
The creator has spoken or typed a "ramble" describing what they want to happen next in their story.
Your job: turn that ramble into a precise JSON proposal of graph operations the engine can apply safely.

## Story structure
A story is a directed graph of nodes. Each node has:
  id, title, story_text, character (who speaks/narrates), choices (outgoing edges),
  is_end, is_vote_gate (group votes on this node), is_location_gate (all players must arrive first).
Each choice: id, text, destination_node_id (null = dead end), sets_flag (optional string), requires_flag (optional string).

## Output — ONLY valid JSON, no markdown fences
{
  "summary": "<one sentence — what you are changing and why>",
  "operations": [
    {
      "action": "create",
      "temp_id": "n1",
      "node": {
        "title": "...", "story_text": "...", "character": "...",
        "is_end": false, "is_vote_gate": false, "is_location_gate": false,
        "choices": [{"id": "c1", "text": "...", "destination_node_id": "n2_or_existing_uuid_or_null", "sets_flag": null, "requires_flag": null}]
      }
    },
    {"action": "update", "node_id": "<existing uuid>", "node": {<only changed fields>}},
    {"action": "delete", "node_id": "<existing uuid>", "reason": "..."}
  ],
  "clarifications": [{"id": "q1", "question": "...", "options": ["A","B"], "allow_ai_decide": true}],
  "warnings": ["..."]
}

## Rules
- temp_ids must be short unique strings ("n1", "n2" …). The server maps them to real UUIDs.
- Choice destination_node_id may be a temp_id or an existing real UUID or null.
- Extend the graph by adding new nodes rather than overwriting existing content unless explicitly asked.
- Match the existing story's tone and character voice in story_text.
- Use clarifications when the ramble is ambiguous about something that matters to the graph structure.
- Warn if deleting a start node or a node that many choices point to.
- "clarifications" and "warnings" may be empty arrays [].
""".strip()


@api_router.post("/admin/ramble/transcribe")
async def admin_ramble_transcribe(
    story_id: str = Form(...),
    audio: UploadFile = File(...),
    _: bool = Depends(require_admin),
):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise HTTPException(
            503,
            "Ramble AI is not configured — add OPENAI_API_KEY to your Replit Secrets, then restart the backend.",
        )
    audio_bytes = await audio.read()
    filename = audio.filename or "ramble.webm"
    content_type = audio.content_type or "audio/webm"

    def call():
        import io
        response = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {key}"},
            files={"file": (filename, io.BytesIO(audio_bytes), content_type)},
            data={"model": "whisper-1", "response_format": "text"},
            timeout=120,
        )
        response.raise_for_status()
        return response.text.strip()

    try:
        transcript = await asyncio.to_thread(call)
    except Exception as exc:
        logger.exception("Whisper transcription failed")
        raise HTTPException(502, f"Transcription failed: {str(exc)[:160]}")

    return {"transcript": transcript}


@api_router.post("/admin/ramble/interpret")
async def admin_ramble_interpret(
    payload: RambleInterpretRequest,
    _: bool = Depends(require_admin),
):
    story = await get_story(payload.story_id)
    if not story:
        raise HTTPException(404, "Story not found")

    nodes_res = await _q(
        lambda: supa.table("nodes").select("*").eq("story_id", payload.story_id).execute()
    )
    existing = nodes_res.data or []

    # Build a compact graph summary for the AI prompt
    graph_lines: List[str] = []
    for n in existing:
        start_marker = " [START]" if n["id"] == story.get("start_node_id") else ""
        flags = []
        if n.get("is_end"):
            flags.append("END")
        if n.get("is_vote_gate"):
            flags.append("VOTE_GATE")
        if n.get("is_location_gate"):
            flags.append("LOCATION_GATE")
        flag_str = f' [{",".join(flags)}]' if flags else ""
        line = f'id={n["id"]}{start_marker}{flag_str} title="{n.get("title","")}" char="{n.get("character","")}"'
        if n.get("story_text"):
            line += f'\n  text: {n["story_text"][:150]}'
        for c in n.get("choices") or []:
            line += f'\n  → "{c.get("text","")}" → {c.get("destination_node_id") or "(null)"}'
        graph_lines.append(line)

    selected_ctx = ""
    if payload.selected_node_id:
        sel = next((n for n in existing if n["id"] == payload.selected_node_id), None)
        if sel:
            selected_ctx = (
                f'The creator has selected node id={sel["id"]} title="{sel.get("title","")}" as their focus. '
                f"Prefer extending from or connecting to this node."
            )

    user_payload = {
        "story_title": story.get("title", ""),
        "story_description": story.get("description", ""),
        "start_node_id": story.get("start_node_id"),
        "node_count": len(existing),
        "graph": graph_lines,
        "transcript": payload.transcript,
        "variation_count": payload.variation_count,
        "selected_node_context": selected_ctx,
    }

    result = await _openai_json(_INTERPRET_SYSTEM, user_payload)
    validation_errors = _validate_proposal(payload.story_id, result, existing)
    return {"proposal": result, "validation_errors": validation_errors}


@api_router.post("/admin/ramble/apply")
async def admin_ramble_apply(
    payload: RambleApplyRequest,
    _: bool = Depends(require_admin),
):
    story = await get_story(payload.story_id)
    if not story:
        raise HTTPException(404, "Story not found")

    # Snapshot all existing nodes for rollback
    existing_res = await _q(
        lambda: supa.table("nodes").select("*").eq("story_id", payload.story_id).execute()
    )
    existing = existing_res.data or []

    # Server-side re-validation (client may have stale data)
    validation_errors = _validate_proposal(payload.story_id, payload.proposal, existing)
    if validation_errors:
        raise HTTPException(422, {"validation_errors": validation_errors})

    operations = payload.proposal.get("operations") or []
    # Map temp_ids → real UUIDs for create operations
    id_map: Dict[str, str] = {
        op["temp_id"]: str(uuid.uuid4())
        for op in operations
        if op.get("action") == "create" and op.get("temp_id")
    }
    backup = {n["id"]: n for n in existing}
    touched: List[str] = []

    try:
        for op in operations:
            action = op.get("action")

            if action == "delete":
                node_id = op["node_id"]
                await _q(
                    lambda nid=node_id: supa.table("nodes")
                    .delete()
                    .eq("id", nid)
                    .eq("story_id", payload.story_id)
                    .execute()
                )
                touched.append(node_id)
                continue

            body = dict(op.get("node") or {})

            # Remap choice destinations from temp_ids to real UUIDs
            choices: List[Dict[str, Any]] = []
            for raw_c in body.get("choices") or []:
                c = dict(raw_c)
                c["id"] = c.get("id") or str(uuid.uuid4())
                dest = c.get("destination_node_id")
                if dest:
                    c["destination_node_id"] = id_map.get(dest, dest)
                choices.append(Choice(**c).model_dump())
            body["choices"] = choices

            if action == "create":
                real_id = id_map[op["temp_id"]]
                # Stagger positions so new nodes don't stack
                offset_x = 300 + len([t for t in touched]) * 320
                node_data = Node(
                    id=real_id,
                    story_id=payload.story_id,
                    title=body.get("title", "New Scene"),
                    story_text=body.get("story_text", ""),
                    character=body.get("character", ""),
                    is_end=bool(body.get("is_end", False)),
                    is_vote_gate=bool(body.get("is_vote_gate", False)),
                    is_location_gate=bool(body.get("is_location_gate", False)),
                    choices=choices,
                    position_x=float(body.get("position_x", offset_x)),
                    position_y=float(body.get("position_y", 200)),
                ).model_dump()
                await _q(lambda d=node_data: supa.table("nodes").insert(d).execute())
                touched.append(real_id)
                # Auto-set start node on first node
                if not story.get("start_node_id"):
                    sid, nid = payload.story_id, real_id
                    await _q(
                        lambda sid=sid, nid=nid: supa.table("stories")
                        .update({"start_node_id": nid})
                        .eq("id", sid)
                        .execute()
                    )
                    story["start_node_id"] = real_id

            elif action == "update":
                node_id = op["node_id"]
                original = backup.get(node_id, {})
                # Merge: original fields + incoming changes; never change id/story_id
                merged = {
                    **original,
                    **{k: v for k, v in body.items() if k not in ("id", "story_id")},
                    "id": node_id,
                    "story_id": payload.story_id,
                    "choices": choices,
                }
                node_data = Node(**merged).model_dump()
                await _q(
                    lambda d=node_data, nid=node_id: supa.table("nodes")
                    .update(d)
                    .eq("id", nid)
                    .execute()
                )
                touched.append(node_id)

        # --- Orphan repair: clear choice destinations that point to deleted nodes ---
        deleted_ids = {op["node_id"] for op in operations if op.get("action") == "delete"}
        if deleted_ids:
            remaining_res = await _q(
                lambda: supa.table("nodes")
                .select("*")
                .eq("story_id", payload.story_id)
                .execute()
            )
            for n in remaining_res.data or []:
                old_choices = n.get("choices") or []
                repaired = []
                changed = False
                for c in old_choices:
                    if c.get("destination_node_id") in deleted_ids:
                        repaired.append({**c, "destination_node_id": None})
                        changed = True
                    else:
                        repaired.append(c)
                if changed:
                    nid = n["id"]
                    await _q(
                        lambda nid=nid, rc=repaired: supa.table("nodes")
                        .update({"choices": rc})
                        .eq("id", nid)
                        .execute()
                    )
            # Clear start_node_id if that node was deleted
            if story.get("start_node_id") in deleted_ids:
                sid = payload.story_id
                await _q(
                    lambda: supa.table("stories")
                    .update({"start_node_id": None})
                    .eq("id", sid)
                    .execute()
                )

        return {"ok": True, "created_id_map": id_map, "touched_node_ids": touched}

    except HTTPException:
        raise
    except Exception:
        logger.exception("Ramble apply failed — rolling back to snapshot")
        try:
            await _q(
                lambda: supa.table("nodes")
                .delete()
                .eq("story_id", payload.story_id)
                .execute()
            )
            for n in existing:
                await _q(lambda d=n: supa.table("nodes").insert(d).execute())
        except Exception:
            logger.exception("Rollback also failed — manual recovery needed")
        raise HTTPException(500, "Could not apply proposal — original graph was restored.")


# ============================================================
# WebSocket connection manager
# ============================================================

class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: Dict[str, List[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, room_code: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.rooms[room_code].append(ws)

    def disconnect(self, room_code: str, ws: WebSocket) -> None:
        conns = self.rooms.get(room_code, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast(self, room_code: str, message: Dict[str, Any]) -> None:
        conns = list(self.rooms.get(room_code, []))
        dead: List[WebSocket] = []
        for c in conns:
            try:
                await c.send_text(json.dumps(message))
            except Exception:
                dead.append(c)
        for d in dead:
            self.disconnect(room_code, d)


manager = ConnectionManager()


async def broadcast_room_state(code: str) -> None:
    state = await compute_room_state(code)
    if state is not None:
        await manager.broadcast(code, {"type": "room_state", "state": state})


async def compute_room_state(code: str) -> Optional[Dict[str, Any]]:
    room = await get_room(code)
    if not room:
        return None

    players_res = await _q(
        lambda: supa.table("players").select("*").eq("room_code", code).execute()
    )
    players = players_res.data or []

    story = None
    if room.get("story_id"):
        story = await get_story(room["story_id"])

    current_node = None
    filtered_choices: List[Dict[str, Any]] = []
    if room.get("current_node_id"):
        current_node = await get_node(room["current_node_id"])
        if current_node:
            filtered_choices = filter_choices_by_flags(current_node, room.get("flags") or [])

    vote_docs: List[Dict[str, Any]] = []
    if room.get("current_node_id") and room.get("phase") in ("voting", "wheel", "ended"):
        nid = room["current_node_id"]
        votes_res = await _q(
            lambda: supa.table("votes")
            .select("*")
            .eq("room_code", code)
            .eq("node_id", nid)
            .execute()
        )
        vote_docs = votes_res.data or []

    voted_player_ids = [v["player_id"] for v in vote_docs]
    tally: Dict[str, int] = {}
    if room.get("phase") in ("wheel", "ended"):
        counts = Counter(v["choice_id"] for v in vote_docs)
        tally = dict(counts)

    return {
        "room": room,
        "story": story,
        "current_node": current_node,
        "choices": filtered_choices,
        "players": players,
        "vote_stats": {
            "voted_count": len(voted_player_ids),
            "total_players": len(players),
            "voted_player_ids": voted_player_ids,
            # Only include tally when the vote is closed
            "tally": tally,
        },
        "server_time": _now_iso(),
    }


# ============================================================
# Server-authoritative phase timers
# ============================================================

_room_tasks: Dict[str, asyncio.Task] = {}


def _cancel_room_task(code: str) -> None:
    t = _room_tasks.get(code)
    if t and not t.done():
        t.cancel()
    _room_tasks.pop(code, None)


async def _start_phase_task(code: str, coro) -> None:
    _cancel_room_task(code)
    task = asyncio.create_task(coro)
    _room_tasks[code] = task


async def advance_to_node(code: str, node_id: str, flags: List[str]) -> None:
    """Enter a new node. Broadcasts reading phase; schedules automatic voting transition."""
    _cancel_room_task(code)
    node = await get_node(node_id)

    if not node:
        await _q(lambda: supa.table("rooms").update({
            "current_node_id": node_id,
            "phase": "ended",
            "phase_ends_at": None,
            "flags": flags,
            "wheel_options": None,
            "wheel_winner_choice_id": None,
        }).eq("code", code).execute())
        await broadcast_room_state(code)
        return

    filtered = filter_choices_by_flags(node, flags)

    if node.get("is_end") or not filtered:
        # Terminal node — end the story
        await _q(lambda: supa.table("rooms").update({
            "current_node_id": node_id,
            "phase": "ended",
            "phase_ends_at": None,
            "flags": flags,
            "wheel_options": None,
            "wheel_winner_choice_id": None,
        }).eq("code", code).execute())
        await _q(lambda: supa.table("votes").delete().eq("room_code", code).execute())
        await broadcast_room_state(code)
        return

    # Non-terminal: start reading phase
    reading_ends = _now() + timedelta(seconds=READING_SECONDS)
    await _q(lambda: supa.table("rooms").update({
        "current_node_id": node_id,
        "phase": "reading",
        "phase_ends_at": reading_ends.isoformat(),
        "flags": flags,
        "wheel_options": None,
        "wheel_winner_choice_id": None,
    }).eq("code", code).execute())
    # Clear votes for this node (fresh start)
    await _q(lambda: supa.table("votes").delete()
             .eq("room_code", code).eq("node_id", node_id).execute())
    await broadcast_room_state(code)
    await _start_phase_task(code, _reading_then_voting(code, node_id))


async def _reading_then_voting(code: str, node_id: str) -> None:
    try:
        await asyncio.sleep(READING_SECONDS)
        room = await get_room(code)
        if not room or room.get("current_node_id") != node_id or room.get("phase") != "reading":
            return
        voting_ends = _now() + timedelta(seconds=VOTING_SECONDS)
        await _q(lambda: supa.table("rooms").update({
            "phase": "voting",
            "phase_ends_at": voting_ends.isoformat(),
        }).eq("code", code).execute())
        await broadcast_room_state(code)
        await asyncio.sleep(VOTING_SECONDS)
        # Timer expired -> resolve
        await resolve_votes(code, node_id, reason="timeout")
    except asyncio.CancelledError:
        return
    except Exception as e:
        logger.exception(f"phase task error for {code}: {e}")


async def resolve_votes(code: str, node_id: str, reason: str = "timeout") -> None:
    """Compute winning choice from submitted votes; handle tie via wheel."""
    room = await get_room(code)
    if not room or room.get("current_node_id") != node_id or room.get("phase") != "voting":
        return

    node = await get_node(node_id)
    if not node:
        return
    flags = room.get("flags") or []
    filtered = filter_choices_by_flags(node, flags)
    filtered_ids = {c["id"] for c in filtered}

    votes_res = await _q(
        lambda: supa.table("votes").select("*")
        .eq("room_code", code).eq("node_id", node_id).execute()
    )
    votes = votes_res.data or []
    # Only count votes for still-available choices
    valid_votes = [v for v in votes if v["choice_id"] in filtered_ids]

    if not valid_votes:
        # No votes at all: random pick from filtered options
        picked = random.choice(filtered) if filtered else None
        if picked is None:
            await _q(lambda: supa.table("rooms").update({
                "phase": "ended", "phase_ends_at": None,
            }).eq("code", code).execute())
            await broadcast_room_state(code)
            return
        await advance_with_choice(code, picked, flags)
        return

    tally = Counter(v["choice_id"] for v in valid_votes)
    max_count = max(tally.values())
    tied_ids = [cid for cid, cnt in tally.items() if cnt == max_count]

    if len(tied_ids) == 1:
        winning = next(c for c in filtered if c["id"] == tied_ids[0])
        await advance_with_choice(code, winning, flags)
        return

    # Tie -> spinning wheel
    tied_options = [c for c in filtered if c["id"] in tied_ids]
    picked = random.choice(tied_options)
    wheel_ends = _now() + timedelta(seconds=WHEEL_SECONDS)
    await _q(lambda: supa.table("rooms").update({
        "phase": "wheel",
        "phase_ends_at": wheel_ends.isoformat(),
        "wheel_options": tied_options,
        "wheel_winner_choice_id": picked["id"],
    }).eq("code", code).execute())
    await broadcast_room_state(code)
    await _start_phase_task(code, _wheel_then_advance(code, node_id, picked))


async def _wheel_then_advance(code: str, node_id: str, picked: Dict[str, Any]) -> None:
    try:
        await asyncio.sleep(WHEEL_SECONDS)
        room = await get_room(code)
        if not room or room.get("current_node_id") != node_id or room.get("phase") != "wheel":
            return
        flags = room.get("flags") or []
        await advance_with_choice(code, picked, flags)
    except asyncio.CancelledError:
        return
    except Exception as e:
        logger.exception(f"wheel task error for {code}: {e}")


async def advance_with_choice(code: str, choice: Dict[str, Any], current_flags: List[str]) -> None:
    """Apply a resolved choice, update flags, and move to the destination node."""
    new_flags = list(current_flags or [])
    if choice.get("sets_flag") and choice["sets_flag"] not in new_flags:
        new_flags.append(choice["sets_flag"])
    dest = choice.get("destination_node_id")
    if not dest:
        # Dangling choice — end the story
        await _q(lambda: supa.table("rooms").update({
            "phase": "ended",
            "phase_ends_at": None,
            "flags": new_flags,
            "wheel_options": None,
            "wheel_winner_choice_id": None,
        }).eq("code", code).execute())
        await broadcast_room_state(code)
        return
    await advance_to_node(code, dest, new_flags)


# ============================================================
# Public: stories listing
# ============================================================

@api_router.get("/")
async def root():
    return {"message": "Narrative RPG Engine", "ok": True}


@api_router.get("/stories")
async def list_stories_public():
    res = await _q(lambda: supa.table("stories").select("*").execute())
    docs = res.data or []
    for s in docs:
        sid = s["id"]
        count_res = await _q(
            lambda sid=sid: supa.table("nodes").select("*", count="exact")
            .eq("story_id", sid).execute()
        )
        s["node_count"] = count_res.count or 0
    return docs


# ============================================================
# Admin: auth + CRUD
# ============================================================

@api_router.post("/admin/login")
async def admin_login(payload: AdminLoginRequest):
    submitted = (payload.password or "").strip()
    if submitted != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"token": ADMIN_TOKEN}


@api_router.get("/admin/verify")
async def admin_verify(_: bool = Depends(require_admin)):
    return {"ok": True}


@api_router.get("/admin/stories")
async def admin_list_stories(_: bool = Depends(require_admin)):
    res = await _q(lambda: supa.table("stories").select("*").execute())
    docs = res.data or []
    for s in docs:
        sid = s["id"]
        count_res = await _q(
            lambda sid=sid: supa.table("nodes").select("*", count="exact")
            .eq("story_id", sid).execute()
        )
        s["node_count"] = count_res.count or 0
    return docs


@api_router.post("/admin/stories", response_model=Story)
async def admin_create_story(payload: StoryCreate, _: bool = Depends(require_admin)):
    story = Story(title=payload.title, description=payload.description)
    await _q(lambda: supa.table("stories").insert(story.model_dump()).execute())
    return story


@api_router.get("/admin/stories/{story_id}")
async def admin_get_story(story_id: str, _: bool = Depends(require_admin)):
    story = await get_story(story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    return story


@api_router.put("/admin/stories/{story_id}")
async def admin_update_story(story_id: str, payload: StoryUpdate, _: bool = Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await _q(lambda: supa.table("stories").update(updates).eq("id", story_id).execute())
    return await get_story(story_id)


@api_router.delete("/admin/stories/{story_id}")
async def admin_delete_story(story_id: str, _: bool = Depends(require_admin)):
    # nodes.story_id has ON DELETE CASCADE in schema — deleted automatically
    await _q(lambda: supa.table("stories").delete().eq("id", story_id).execute())
    return {"ok": True}


@api_router.get("/admin/stories/{story_id}/graph")
async def admin_get_graph(story_id: str, _: bool = Depends(require_admin)):
    story = await get_story(story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    res = await _q(
        lambda: supa.table("nodes").select("*").eq("story_id", story_id).execute()
    )
    nodes = res.data or []
    return {"story": story, "nodes": nodes}


@api_router.post("/admin/nodes", response_model=Node)
async def admin_create_node(payload: NodeCreate, _: bool = Depends(require_admin)):
    node = Node(**payload.model_dump())
    # model_dump() recursively converts Choice objects to dicts for JSONB
    await _q(lambda: supa.table("nodes").insert(node.model_dump()).execute())
    story = await get_story(payload.story_id)
    if story and not story.get("start_node_id"):
        nid = node.id
        sid = payload.story_id
        await _q(
            lambda: supa.table("stories").update({"start_node_id": nid})
            .eq("id", sid).execute()
        )
    return node


@api_router.put("/admin/nodes/{node_id}")
async def admin_update_node(node_id: str, payload: NodeUpdate, _: bool = Depends(require_admin)):
    updates: Dict[str, Any] = {}
    for k, v in payload.model_dump().items():
        if v is None:
            continue
        if k == "choices":
            updates[k] = [
                Choice(**c).model_dump() if not isinstance(c, dict) else c for c in v
            ]
        else:
            updates[k] = v
    if updates:
        await _q(lambda: supa.table("nodes").update(updates).eq("id", node_id).execute())
    return await get_node(node_id)


@api_router.delete("/admin/nodes/{node_id}")
async def admin_delete_node(node_id: str, _: bool = Depends(require_admin)):
    # Find all nodes whose choices point to this node.
    # Fetch all nodes and filter in Python — avoids JSONB filter edge cases.
    all_res = await _q(lambda: supa.table("nodes").select("*").execute())
    refs = [
        n for n in (all_res.data or [])
        if any(c.get("destination_node_id") == node_id for c in (n.get("choices") or []))
    ]
    for other in refs:
        new_choices = []
        for c in other.get("choices") or []:
            if c.get("destination_node_id") == node_id:
                c = {**c, "destination_node_id": None}
            new_choices.append(c)
        oid, nc = other["id"], new_choices
        await _q(
            lambda oid=oid, nc=nc: supa.table("nodes").update({"choices": nc})
            .eq("id", oid).execute()
        )
    await _q(lambda: supa.table("nodes").delete().eq("id", node_id).execute())
    # Clear start_node_id on any story pointing to this node
    story_res = await _q(
        lambda: supa.table("stories").select("id")
        .eq("start_node_id", node_id).maybe_single().execute()
    )
    if story_res is not None and story_res.data:
        sid = story_res.data["id"]
        await _q(
            lambda: supa.table("stories").update({"start_node_id": None})
            .eq("id", sid).execute()
        )
    return {"ok": True}


@api_router.post("/admin/nodes/positions")
async def admin_bulk_positions(updates: List[PositionUpdate], _: bool = Depends(require_admin)):
    for u in updates:
        uid, px, py = u.id, u.position_x, u.position_y
        await _q(
            lambda uid=uid, px=px, py=py: supa.table("nodes").update({
                "position_x": px,
                "position_y": py,
            }).eq("id", uid).execute()
        )
    return {"ok": True, "count": len(updates)}


@api_router.post("/admin/stories/{story_id}/set-start")
async def admin_set_start_node(story_id: str, node_id: str, _: bool = Depends(require_admin)):
    await _q(
        lambda: supa.table("stories").update({"start_node_id": node_id})
        .eq("id", story_id).execute()
    )
    return await get_story(story_id)


# ============================================================
# Player runtime: rooms, join, vote (shared group voting)
# ============================================================

@api_router.post("/rooms")
async def create_room():
    for _ in range(10):
        code = generate_room_code()
        existing = await get_room(code)
        if not existing:
            room = Room(code=code)
            await _q(lambda: supa.table("rooms").insert(room.model_dump()).execute())
            return room
    raise HTTPException(500, "Could not generate unique room code")


@api_router.get("/rooms/{code}")
async def get_room_info(code: str):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    return await compute_room_state(code)


@api_router.post("/rooms/{code}/join")
async def join_room(code: str, payload: RoomJoinRequest):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    count_res = await _q(
        lambda: supa.table("players").select("*", count="exact")
        .eq("room_code", code).execute()
    )
    existing = count_res.count or 0
    names_res = await _q(
        lambda: supa.table("players").select("nickname").eq("room_code", code).execute()
    )
    existing_names = names_res.data or []
    if any(p["nickname"].lower() == payload.nickname.lower() for p in existing_names):
        raise HTTPException(400, "Nickname already taken in this room")
    player = Player(
        room_code=code,
        nickname=payload.nickname,
        is_host=(existing == 0),
    )
    await _q(lambda: supa.table("players").insert(player.model_dump()).execute())
    await broadcast_room_state(code)
    return player


@api_router.post("/rooms/{code}/select-story")
async def select_story(code: str, payload: RoomSelectStoryRequest):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    story = await get_story(payload.story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    sid = payload.story_id
    await _q(
        lambda: supa.table("rooms").update({"story_id": sid}).eq("code", code).execute()
    )
    await broadcast_room_state(code)
    return {"ok": True}


@api_router.post("/rooms/{code}/start")
async def start_room(code: str):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    if not room.get("story_id"):
        raise HTTPException(400, "No story selected")
    story = await get_story(room["story_id"])
    if not story or not story.get("start_node_id"):
        raise HTTPException(400, "Story has no start node")
    await _q(lambda: supa.table("votes").delete().eq("room_code", code).execute())
    await _q(lambda: supa.table("rooms").update({
        "started": True,
        "flags": [],
        "wheel_options": None,
        "wheel_winner_choice_id": None,
    }).eq("code", code).execute())
    await advance_to_node(code, story["start_node_id"], [])
    return {"ok": True}


@api_router.post("/rooms/{code}/reset")
async def reset_room(code: str):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    _cancel_room_task(code)
    await _q(lambda: supa.table("votes").delete().eq("room_code", code).execute())
    await _q(lambda: supa.table("rooms").update({
        "started": False,
        "current_node_id": None,
        "phase": "lobby",
        "phase_ends_at": None,
        "flags": [],
        "wheel_options": None,
        "wheel_winner_choice_id": None,
    }).eq("code", code).execute())
    await broadcast_room_state(code)
    return {"ok": True}


@api_router.post("/rooms/{code}/vote")
async def cast_vote(code: str, payload: VoteRequest):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.get("phase") != "voting":
        raise HTTPException(400, "Voting is not open right now")
    if not room.get("current_node_id"):
        raise HTTPException(400, "No active node")

    player = await get_player(payload.player_id)
    if not player or player["room_code"] != code:
        raise HTTPException(404, "Player not found in this room")

    node = await get_node(room["current_node_id"])
    if not node:
        raise HTTPException(400, "Invalid current node")

    filtered = filter_choices_by_flags(node, room.get("flags") or [])
    if not any(c["id"] == payload.choice_id for c in filtered):
        raise HTTPException(400, "Invalid choice for the current node")

    nid = room["current_node_id"]
    existing_res = await _q(
        lambda: supa.table("votes").select("id")
        .eq("room_code", code).eq("node_id", nid).eq("player_id", payload.player_id)
        .maybe_single().execute()
    )
    if existing_res is not None and existing_res.data:
        raise HTTPException(400, "You have already voted for this scene")

    vote_doc = {
        "id": str(uuid.uuid4()),
        "room_code": code,
        "node_id": nid,
        "player_id": payload.player_id,
        "choice_id": payload.choice_id,
        "created_at": _now_iso(),
    }
    await _q(lambda: supa.table("votes").insert(vote_doc).execute())
    await broadcast_room_state(code)

    # If everyone has voted, immediately resolve
    total_res = await _q(
        lambda: supa.table("players").select("*", count="exact")
        .eq("room_code", code).execute()
    )
    total_players = total_res.count or 0
    votes_res = await _q(
        lambda: supa.table("votes").select("*", count="exact")
        .eq("room_code", code).eq("node_id", nid).execute()
    )
    votes_now = votes_res.count or 0
    if votes_now >= total_players and total_players > 0:
        _cancel_room_task(code)
        await resolve_votes(code, nid, reason="all_voted")

    return {"ok": True}


# ============================================================
# WebSocket endpoint
# ============================================================

@app.websocket("/api/ws/rooms/{code}")
async def websocket_room(ws: WebSocket, code: str):
    room = await get_room(code)
    if not room:
        await ws.close(code=4404)
        return
    await manager.connect(code, ws)
    try:
        state = await compute_room_state(code)
        await ws.send_text(json.dumps({"type": "room_state", "state": state}))
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(code, ws)
    except Exception as e:
        logger.warning(f"WS error: {e}")
        manager.disconnect(code, ws)


# ============================================================
# Seed the Zayn example story
# ============================================================

async def seed_zayn_story():
    res = await _q(
        lambda: supa.table("stories").select("id")
        .eq("title", "Airport Adventure — Zayn").maybe_single().execute()
    )
    if res is not None and res.data:
        return

    story = Story(
        title="Airport Adventure — Zayn",
        description="A short branching tale about Zayn navigating a mysterious airport with his friends. Vote together at every scene — the group's decision drives the story.",
    )
    n_start = str(uuid.uuid4())
    n_biz_lounge = str(uuid.uuid4())
    n_econ_terminal = str(uuid.uuid4())
    n_gate = str(uuid.uuid4())
    n_vote = str(uuid.uuid4())
    n_end_paris = str(uuid.uuid4())
    n_end_tokyo = str(uuid.uuid4())
    n_biz_perk = str(uuid.uuid4())
    story.start_node_id = n_start

    nodes = [
        Node(
            id=n_start, story_id=story.id, title="Ticket Counter", character="Zayn",
            story_text="Zayn stands at the airport ticket counter. The agent smiles: 'Which class today?' A screen behind her flickers with departure gates.",
            position_x=100, position_y=200,
            choices=[
                Choice(text="Buy a Business Class ticket", destination_node_id=n_biz_lounge, sets_flag="business_class"),
                Choice(text="Buy an Economy ticket", destination_node_id=n_econ_terminal, sets_flag="economy"),
            ],
        ),
        Node(
            id=n_biz_lounge, story_id=story.id, title="Business Class Lounge", character="Zayn",
            story_text="Zayn sinks into a leather armchair in the lounge. Free espresso, quiet music. A steward offers a warm towel.",
            position_x=450, position_y=80,
            choices=[
                Choice(text="Accept the warm towel and relax", destination_node_id=n_biz_perk, sets_flag="vip_perk"),
                Choice(text="Head straight to the boarding gate", destination_node_id=n_gate),
            ],
        ),
        Node(
            id=n_biz_perk, story_id=story.id, title="VIP Perk", character="Zayn",
            story_text="The steward slips Zayn a golden pass — 'For your next flight, sir.' Zayn pockets it and walks to the gate.",
            position_x=800, position_y=80,
            choices=[Choice(text="Continue to boarding gate", destination_node_id=n_gate)],
        ),
        Node(
            id=n_econ_terminal, story_id=story.id, title="Crowded Terminal", character="Zayn",
            story_text="Zayn squeezes through a sea of travellers. Someone is arguing with a customs officer. A child drops an ice cream cone.",
            position_x=450, position_y=380,
            choices=[
                Choice(text="Help the child pick up the cone", destination_node_id=n_gate, sets_flag="kind_deed"),
                Choice(text="Push through toward the boarding gate", destination_node_id=n_gate),
            ],
        ),
        Node(
            id=n_gate, story_id=story.id, title="Boarding Gate 42", character="Group",
            story_text="The group regroups at Gate 42. Departure boards blink. Everyone gathers around the desk.",
            position_x=850, position_y=230, is_location_gate=True,
            choices=[Choice(text="Approach the desk together", destination_node_id=n_vote)],
        ),
        Node(
            id=n_vote, story_id=story.id, title="Which Flight?", character="Group",
            story_text="Two boards flash: a red-eye to Paris and a sunrise flight to Tokyo. The gate agent looks at the group: 'You decide together.'",
            position_x=1200, position_y=230, is_vote_gate=True,
            choices=[
                Choice(text="Paris", destination_node_id=n_end_paris),
                Choice(text="Tokyo", destination_node_id=n_end_tokyo),
            ],
        ),
        Node(
            id=n_end_paris, story_id=story.id, title="Ending — Paris", character="Zayn",
            story_text="Wheels up over the Atlantic. Zayn presses his forehead against the window and grins — Paris, at last.",
            position_x=1550, position_y=100, is_end=True, choices=[],
        ),
        Node(
            id=n_end_tokyo, story_id=story.id, title="Ending — Tokyo", character="Zayn",
            story_text="Golden dawn over the Pacific. Zayn sips green tea from a paper cup as the cabin whispers with excitement — Tokyo awaits.",
            position_x=1550, position_y=360, is_end=True, choices=[],
        ),
    ]

    await _q(lambda: supa.table("stories").insert(story.model_dump()).execute())
    for n in nodes:
        await _q(lambda d=n.model_dump(): supa.table("nodes").insert(d).execute())
    logger.info(f"Seeded Zayn story {story.id} with {len(nodes)} nodes")


# ============================================================
# App wiring
# ============================================================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    global supa
    url = os.environ.get("SUPABASE_URL")
    # Prefer the service-role key (bypasses RLS) for server-side operations;
    # fall back to the anon key if only that is set.
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    if url and key:
        supa = create_client(url, key)
        logger.info("Supabase client initialised")
        try:
            await seed_zayn_story()
        except Exception as exc:
            logger.error(
                f"seed_zayn_story failed — schema may not exist yet. "
                f"Run backend/schema.sql in the Supabase SQL editor. Error: {exc}"
            )
    else:
        logger.warning(
            "SUPABASE_URL / SUPABASE_KEY not set — DB endpoints will return 503 until secrets are added and the backend is restarted."
        )
    logger.info(f"Admin token: {ADMIN_TOKEN}")


@app.on_event("shutdown")
async def _shutdown():
    for t in list(_room_tasks.values()):
        try:
            t.cancel()
        except Exception:
            pass


# ============================================================
# Static frontend (production)
# Mount AFTER all API routes so /api/* is never shadowed.
# ============================================================
_FRONTEND_BUILD = ROOT_DIR.parent / "frontend" / "build"

if _FRONTEND_BUILD.exists():
    # Serve compiled JS / CSS / images under /static/*
    _static_dir = _FRONTEND_BUILD / "static"
    if _static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(_static_dir)), name="spa-static")

    # SPA catch-all: every non-API path returns index.html so React Router works
    @app.get("/{full_path:path}", include_in_schema=False)
    async def _serve_spa(full_path: str):
        index = _FRONTEND_BUILD / "index.html"
        if index.exists():
            return FileResponse(str(index))
        raise HTTPException(status_code=404, detail="Frontend build not found")
