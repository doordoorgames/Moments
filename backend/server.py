"""
Branching Narrative RPG Engine — Backend
Synchronized group-voting runtime:
- All players in a room share ONE current node, ONE set of flags, ONE phase.
- Multiplayer phases per node: reading (10s, no votes) -> voting (20s or until everyone voted) -> resolve.
- Solo rooms skip the reading phase so choices are immediately available.
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
import secrets
import socket
import string
import time
import uuid

import httpx
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_client, Client, ClientOptions
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware
from pack_light import PackLightResult, read_pack, pack_flags, story_flags, public_pack
import adventure_engine as AE
from adventure_map import get_layout as adventure_layout

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Initialized lazily in the startup event so the server binds its port
# even when SUPABASE_URL / SUPABASE_KEY are not yet configured.
supa: Optional[Client] = None
database_http: Optional[httpx.Client] = None

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


def _ms() -> int:
    return int(time.time() * 1000)


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
    position_x: float = 0.0
    position_y: float = 0.0
    is_location_gate: bool = False
    is_vote_gate: bool = False
    is_end: bool = False
    node_type: Literal["story", "narration"] = "story"
    narration_next_node_id: Optional[str] = None
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
    session_token: str = Field(default_factory=lambda: secrets.token_urlsafe(32))


class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str
    story_id: Optional[str] = None
    presentation: Literal["classic", "shoug2"] = "classic"
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
    position_x: float = 0.0
    position_y: float = 0.0
    is_location_gate: bool = False
    is_vote_gate: bool = False
    is_end: bool = False
    node_type: Literal["story", "narration"] = "story"
    narration_next_node_id: Optional[str] = None
    choices: List[Choice] = Field(default_factory=list)


class NodeUpdate(BaseModel):
    title: Optional[str] = None
    story_text: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    is_location_gate: Optional[bool] = None
    is_vote_gate: Optional[bool] = None
    is_end: Optional[bool] = None
    node_type: Optional[Literal["story", "narration"]] = None
    narration_next_node_id: Optional[str] = None
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


class RoomCreateRequest(BaseModel):
    nickname: Optional[str] = None


class RoomJoinRequest(BaseModel):
    nickname: str


class RoomSessionRequest(BaseModel):
    player_id: Optional[str] = None
    session_token: Optional[str] = None


class PackLightSubmission(RoomSessionRequest):
    run_id: str
    result: PackLightResult


class PackLightContinue(RoomSessionRequest):
    run_id: str


class RoomSelectStoryRequest(RoomSessionRequest):
    story_id: str
    presentation: Literal["classic", "shoug2"] = "classic"


class TestControlRequest(RoomSessionRequest):
    action: Literal["jump", "restart_node", "back", "restart_story", "switch_story"]
    node_id: Optional[str] = None
    story_id: Optional[str] = None
    presentation: Literal["classic", "shoug2"] = "classic"
    visit_id: str


class VoteRequest(BaseModel):
    player_id: str
    choice_id: str
    visit_id: Optional[str] = None
    node_id: Optional[str] = None
    session_token: Optional[str] = None


class NarrationAdvanceRequest(BaseModel):
    visit_id: Optional[str] = None
    player_id: str
    session_token: str


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
    try:
        return await asyncio.to_thread(fn)
    except HTTPException:
        raise
    except Exception as exc:
        # Supabase/PostgREST failures previously escaped as an opaque plain-text
        # HTTP 500, leaving the admin UI with no actionable information.
        logger.exception("Supabase database operation failed")
        detail = str(exc).strip() or exc.__class__.__name__
        # Keep the response useful without allowing an upstream exception to
        # dump an unbounded amount of internal detail into the browser.
        detail = re.sub(r"[\r\n]+", " ", detail)[:500]
        raise HTTPException(
            status_code=502,
            detail=f"Database operation failed: {detail}",
        ) from exc


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
  id, title, story_text, choices (outgoing edges),
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
        "title": "...", "story_text": "...",
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
- Match the existing story's tone and narrative voice in story_text.
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
        line = f'id={n["id"]}{start_marker}{flag_str} title="{n.get("title","")}"'
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
        # Sockets that authenticated with a player session (adventure presence,
        # private messages). Story rooms never need this and keep working unbound.
        self.bound: Dict[WebSocket, Any] = {}
        self.last_seen: Dict[str, Dict[str, int]] = defaultdict(dict)
        self.http_seen: Dict[str, Dict[str, int]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def connect(self, room_code: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.rooms[room_code].append(ws)

    def disconnect(self, room_code: str, ws: WebSocket) -> None:
        conns = self.rooms.get(room_code, [])
        if ws in conns:
            conns.remove(ws)
        binding = self.bound.pop(ws, None)
        if binding:
            self.last_seen[binding[0]][binding[1]] = _ms()

    def bind(self, room_code: str, ws: WebSocket, player_id: str) -> None:
        self.bound[ws] = (room_code, player_id)
        self.last_seen[room_code][player_id] = _ms()

    def player_of(self, ws: WebSocket) -> Optional[str]:
        binding = self.bound.get(ws)
        return binding[1] if binding else None

    def touch_http(self, room_code: str, player_id: str) -> None:
        now = _ms()
        self.http_seen[room_code][player_id] = now
        self.last_seen[room_code][player_id] = now

    def presence(self, room_code: str) -> Dict[str, bool]:
        online = {pid: True for ws, (code, pid) in list(self.bound.items()) if code == room_code}
        now = _ms()
        for pid, seen in self.http_seen.get(room_code, {}).items():
            if now - seen < 5_000:
                online[pid] = True
        return online

    def count(self, room_code: str) -> int:
        return len(self.rooms.get(room_code, []))

    async def send_to_player(self, room_code: str, player_id: str, message: Dict[str, Any]) -> None:
        text = json.dumps(message)
        for ws, (code, pid) in list(self.bound.items()):
            if code == room_code and pid == player_id:
                try:
                    await ws.send_text(text)
                except Exception:
                    self.disconnect(room_code, ws)

    async def broadcast(self, room_code: str, message: Dict[str, Any]) -> None:
        conns = list(self.rooms.get(room_code, []))
        dead: List[WebSocket] = []
        text = json.dumps(message)
        for c in conns:
            try:
                await c.send_text(text)
            except Exception:
                dead.append(c)
        for d in dead:
            self.disconnect(room_code, d)


manager = ConnectionManager()


async def broadcast_room_state(code: str):
    state = await compute_room_state(code)
    if state is not None:
        await manager.broadcast(code, {"type": "room_state", "state": state})
    return state


def supreme_nickname(nickname: str) -> bool:
    return "".join(nickname.split()).casefold() == "test99"


def test_metadata(room: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    # Versioned room metadata uses the existing JSONB wheel_options column.
    # Supreme rooms never run tie wheels. No production schema migration needed.
    options = room.get("wheel_options") or []
    if options and isinstance(options[0], dict) and options[0].get("supreme_v1"):
        return options[0]
    return None


async def is_supreme_room(code: str) -> bool:
    return test_metadata(await get_room(code) or {}) is not None


async def authorize_test_room(code: str, payload: RoomSessionRequest, room=None, player=None) -> Dict[str, Any]:
    room = room if room is not None else await get_room(code)
    metadata = test_metadata(room or {})
    if not metadata:
        raise HTTPException(403, "This is not a Supreme Test99 room")
    player = player if player is not None else (await get_player(payload.player_id) if payload.player_id else None)
    if (not player or player.get("room_code") != code
            or player.get("id") != metadata.get("creator_id")
            or not player.get("is_host") or not payload.session_token
            or not secrets.compare_digest(player.get("session_token") or "", payload.session_token)):
        raise HTTPException(403, "Only this room's authenticated creator can use test controls")
    return room


async def guard_test_mutation(code: str, payload: Optional[RoomSessionRequest]) -> None:
    if await is_supreme_room(code):
        await authorize_test_room(code, payload or RoomSessionRequest())


async def compute_room_state(code: str) -> Optional[Dict[str, Any]]:
    room = await get_room(code)
    if not room:
        return None

    players_res = await _q(
        lambda: supa.table("players")
        .select("id,room_code,nickname,joined_at,is_host")
        .eq("room_code", code).execute()
    )
    players = players_res.data or []
    pack = read_pack(room)
    room = {**room, "flags": story_flags(room.get("flags")) if pack else room.get("flags", [])}
    adventure_view = None
    stored_adventure = AE.read_envelope(room.get("flags"))
    if stored_adventure:
        # Never expose the raw envelope: it holds the private confirmation code.
        room["flags"] = AE.strip_envelope(room.get("flags"))
        cached = _adventures.get(code)
        live = cached["adv"] if cached else stored_adventure
        ctx = {"players": players, "presence": manager.presence(code), "last_seen": manager.last_seen.get(code, {}),
               "test_creator_id": (test_metadata(room) or {}).get("creator_id")}
        adventure_view = AE.public_view(live, ctx, _ms())
    metadata = test_metadata(room)
    room["supreme_test_mode"] = metadata is not None
    if metadata:
        room["test_creator_id"] = metadata["creator_id"]
        room["node_visit_id"] = room.get("wheel_winner_choice_id")
        room["test_history_length"] = len(metadata.get("history", []))
        room["wheel_options"] = None
        room["wheel_winner_choice_id"] = None

    story = None
    if room.get("story_id"):
        story = await get_story(room["story_id"])

    current_node = None
    filtered_choices: List[Dict[str, Any]] = []
    if room.get("current_node_id"):
        current_node = await get_node(room["current_node_id"])
        if current_node and current_node.get("node_type", "story") != "narration":
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
        **({"pack_light": public_pack(pack)} if pack else {}),
        **({"adventure": adventure_view} if adventure_view else {}),
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


async def advance_to_node(code: str, node_id: str, flags: List[str], history_override=None, previous_room=None):
    """Enter a node, skipping the reading buffer only for one-player rooms."""
    _cancel_room_task(code)
    previous = previous_room if previous_room is not None else (await get_room(code) or {})
    metadata = test_metadata(previous)
    visit_id = None
    if metadata:
        metadata = dict(metadata)
        history = list(metadata.get("history", []))
        if history_override is not None:
            history = history_override
        elif previous.get("current_node_id"):
            history.append({"node_id": previous["current_node_id"], "flags": previous.get("flags") or []})
        metadata["history"] = history
        visit_id = str(uuid.uuid4())
    node = await get_node(node_id)

    if metadata and (not node or node.get("story_id") != previous.get("story_id")):
        raise HTTPException(400, "Node must belong to the room's story")
    if not node:
        await _q(lambda: supa.table("rooms").update({
            "current_node_id": node_id,
            "phase": "ended",
            "phase_ends_at": None,
            "flags": flags,
            "wheel_options": [metadata] if metadata else None,
            "wheel_winner_choice_id": visit_id,
        }).eq("code", code).execute())
        return await broadcast_room_state(code)

    if node.get("node_type", "story") == "narration":
        await _q(lambda: supa.table("rooms").update({
            "current_node_id": node_id,
            "phase": "narration",
            "phase_ends_at": None,
            "flags": flags,
            "wheel_options": [metadata] if metadata else None,
            "wheel_winner_choice_id": visit_id,
        }).eq("code", code).execute())
        await _q(lambda: supa.table("votes").delete().eq("room_code", code).execute())
        return await broadcast_room_state(code)

    filtered = filter_choices_by_flags(node, flags)

    if node.get("is_end") or not filtered:
        # Terminal node — end the story
        await _q(lambda: supa.table("rooms").update({
            "current_node_id": node_id,
            "phase": "ended",
            "phase_ends_at": None,
            "flags": flags,
            "wheel_options": [metadata] if metadata else None,
            "wheel_winner_choice_id": visit_id,
        }).eq("code", code).execute())
        await _q(lambda: supa.table("votes").delete().eq("room_code", code).execute())
        return await broadcast_room_state(code)

    players_res = await _q(
        lambda: supa.table("players").select("*", count="exact")
        .eq("room_code", code).execute()
    )
    is_solo = (players_res.count or 0) == 1
    supreme = metadata is not None

    # A solo player can vote as soon as the node is displayed. Multiplayer
    # retains the synchronized reading buffer unchanged.
    if is_solo or supreme:
        voting_ends = _now() + timedelta(seconds=VOTING_SECONDS)
        await _q(lambda: supa.table("rooms").update({
            "current_node_id": node_id,
            "phase": "voting",
            "phase_ends_at": None if supreme else voting_ends.isoformat(),
            "flags": flags,
            "wheel_options": [metadata] if metadata else None,
            "wheel_winner_choice_id": visit_id,
        }).eq("code", code).execute())
        await _q(lambda: supa.table("votes").delete()
                 .eq("room_code", code).eq("node_id", node_id).execute())
        state = await broadcast_room_state(code)
        if not supreme:
            await _start_phase_task(code, _voting_timeout(code, node_id))
        return state

    # Non-terminal multiplayer room: start reading phase
    reading_ends = _now() + timedelta(seconds=READING_SECONDS)
    await _q(lambda: supa.table("rooms").update({
        "current_node_id": node_id,
        "phase": "reading",
        "phase_ends_at": reading_ends.isoformat(),
        "flags": flags,
        "wheel_options": [metadata] if metadata else None,
        "wheel_winner_choice_id": visit_id,
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
        await _voting_timeout(code, node_id)
    except asyncio.CancelledError:
        return
    except Exception as e:
        logger.exception(f"phase task error for {code}: {e}")


async def _voting_timeout(code: str, node_id: str) -> None:
    """Resolve an unanswered vote after the existing voting window."""
    await asyncio.sleep(VOTING_SECONDS)
    await resolve_votes(code, node_id, reason="timeout")


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


async def advance_with_choice(code: str, choice: Dict[str, Any], current_flags: List[str], previous_room=None):
    """Apply a resolved choice, update flags, and move to the destination node."""
    new_flags = list(current_flags or [])
    if choice.get("sets_flag") and choice["sets_flag"] not in new_flags:
        new_flags.append(choice["sets_flag"])
    dest = choice.get("destination_node_id")
    if not dest:
        # Keep test-room identity and controls available at a dangling ending.
        room = previous_room if previous_room is not None else (await get_room(code) or {})
        metadata = test_metadata(room)
        if metadata:
            metadata = {**metadata, "history": [*metadata.get("history", []), {"node_id": room["current_node_id"], "flags": current_flags}]}
        await _q(lambda: supa.table("rooms").update({
            "phase": "ended",
            "phase_ends_at": None,
            "flags": new_flags,
            "wheel_options": [metadata] if metadata else None,
            "wheel_winner_choice_id": str(uuid.uuid4()) if metadata else None,
        }).eq("code", code).execute())
        return await broadcast_room_state(code)
    return await advance_to_node(code, dest, new_flags, previous_room=previous_room)


# ============================================================
# Public: stories listing
# ============================================================

@api_router.get("/")
async def root():
    return {"message": "Narrative RPG Engine", "ok": True, "release": "supreme-test99-v2", "commit": os.environ.get("RAILWAY_GIT_COMMIT_SHA", "local")}


@api_router.get("/health/database")
async def database_health():
    """Expose connection metadata that is safe for production diagnostics.

    This intentionally returns only the hostname, never the URL path, user,
    password, API key, query string, or token.
    """
    configured_url = os.environ.get("SUPABASE_URL", "").strip()
    hostname = urlparse(configured_url).hostname if configured_url else None
    resolved_addresses: List[str] = []
    dns_error = None

    if hostname:
        try:
            results = await asyncio.to_thread(socket.getaddrinfo, hostname, 443, type=socket.SOCK_STREAM)
            resolved_addresses = sorted({result[4][0] for result in results})
        except OSError as exc:
            dns_error = str(exc)

    return {
        "database_client_initialized": supa is not None,
        "supabase_url_configured": bool(configured_url),
        "hostname": hostname,
        "dns_resolves": bool(resolved_addresses),
        "resolved_address_count": len(resolved_addresses),
        "dns_error": dns_error,
    }


@api_router.get("/stories")
async def list_stories_public(response: Response):
    # Public story metadata is authored in Admin and must remain live. In
    # particular, an installed PWA must not retain an obsolete story list.
    response.headers["Cache-Control"] = "no-store"
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
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Story title is required")

    story = Story(title=title, description=payload.description.strip())
    result = await _q(lambda: supa.table("stories").insert(story.model_dump()).execute())
    if result is None or not result.data:
        logger.error("Story insert returned no database row", extra={"story_id": story.id})
        raise HTTPException(status_code=502, detail="Database did not confirm that the story was created")

    created = result.data[0] if isinstance(result.data, list) else result.data
    logger.info("Story created", extra={"story_id": story.id})
    return created


@api_router.get("/admin/stories/{story_id}")
async def admin_get_story(story_id: str, _: bool = Depends(require_admin)):
    story = await get_story(story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    return story


@api_router.put("/admin/stories/{story_id}")
async def admin_update_story(story_id: str, payload: StoryUpdate, _: bool = Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "title" in updates:
        updates["title"] = updates["title"].strip()
        if not updates["title"]:
            raise HTTPException(status_code=422, detail="Story title is required")
    if "description" in updates:
        updates["description"] = updates["description"].strip()
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
    body = payload.model_dump()
    if body.get("node_type") == "narration":
        body.update({
            "choices": [],
            "is_location_gate": False,
            "is_vote_gate": False,
            "is_end": False,
        })
    node = Node(**body)
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
        if v is None and k != "narration_next_node_id":
            continue
        if k == "narration_next_node_id" and k not in payload.model_fields_set:
            continue
        if k == "choices":
            updates[k] = [
                Choice(**c).model_dump() if not isinstance(c, dict) else c for c in v
            ]
        else:
            updates[k] = v
    if updates.get("node_type") == "narration":
        updates.update({
            "choices": [],
            "is_location_gate": False,
            "is_vote_gate": False,
            "is_end": False,
        })
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
    narration_refs = [
        n for n in (all_res.data or [])
        if n.get("narration_next_node_id") == node_id
    ]
    for other in narration_refs:
        oid = other["id"]
        await _q(
            lambda oid=oid: supa.table("nodes")
            .update({"narration_next_node_id": None}).eq("id", oid).execute()
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
async def create_room(payload: Optional[RoomCreateRequest] = None):
    for _ in range(10):
        code = generate_room_code()
        existing = await get_room(code)
        if not existing:
            creator = Player(room_code=code, nickname=payload.nickname.strip(), is_host=True) if payload and payload.nickname and payload.nickname.strip() else None
            room = Room(code=code, wheel_options=[{"supreme_v1": True, "creator_id": creator.id, "history": []}] if creator and supreme_nickname(creator.nickname) else None)
            await _q(lambda: supa.table("rooms").insert(room.model_dump()).execute())
            if payload and payload.nickname and payload.nickname.strip():
                # The creator is persisted as host before returning the room,
                # so Test99 activates on creation, not after a separate join.
                player = creator
                await _q(lambda: supa.table("players").insert(player.model_dump()).execute())
                return {**room.model_dump(), "player": player.model_dump(),
                        "supreme_test_mode": supreme_nickname(player.nickname)}
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
    if code in _adventures:
        _adventures[code]["players_at"] = 0
    if room.get("presentation") == "shoug2" and room.get("phase") == "pack_light":
        async with _pack_locks[code]:
            for _ in range(5):
                current = await get_room(code)
                pack = read_pack(current or {})
                if not pack or current.get("phase") != "pack_light":
                    break
                pack["participants"] = list(dict.fromkeys(pack["participants"] + [player.id]))
                saved = await _q(lambda: supa.table("rooms").update({"flags": pack_flags(current.get("flags"), pack)})
                    .eq("code", code).eq("phase", "pack_light")
                    .eq("flags", json.dumps(current.get("flags") or [])).execute())
                if saved.data:
                    break
    await broadcast_room_state(code)
    return player


@api_router.post("/rooms/{code}/select-story")
async def select_story(code: str, payload: RoomSelectStoryRequest):
    await guard_test_mutation(code, payload)
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    if AE.read_envelope(room.get("flags")):
        raise HTTPException(409, "This room is playing The Baccarat Hunt")
    story = await get_story(payload.story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    if room.get("started"):
        raise HTTPException(409, "Use the test menu to switch an active story")
    sid = payload.story_id
    if payload.presentation == "shoug2" and not __import__("re").search(r"shoug[’\x27]?s tale", story.get("title", ""), __import__("re").IGNORECASE):
        raise HTTPException(400, "Shoug 2.0 is only available for Shoug’s Tale")
    await _q(
        lambda: supa.table("rooms").update({"story_id": sid, "presentation": payload.presentation}).eq("code", code).execute()
    )
    await broadcast_room_state(code)
    return {"ok": True}


@api_router.post("/rooms/{code}/start")
async def start_room(code: str, payload: Optional[RoomSessionRequest] = None):
    await guard_test_mutation(code, payload)
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    if AE.read_envelope(room.get("flags")):
        raise HTTPException(409, "This room is playing The Baccarat Hunt")
    if not room.get("story_id"):
        raise HTTPException(400, "No story selected")
    story = await get_story(room["story_id"])
    if not story or not story.get("start_node_id"):
        raise HTTPException(400, "Story has no start node")
    if room.get("presentation") == "shoug2":
        async with _pack_locks[code]:
            return await start_pack_light(code, payload or RoomSessionRequest())
    await _q(lambda: supa.table("votes").delete().eq("room_code", code).execute())
    await _q(lambda: supa.table("rooms").update({
        "started": True,
        "flags": [],
        "wheel_options": [{**test_metadata(room), "history": []}] if test_metadata(room) else None,
        "wheel_winner_choice_id": None,
    }).eq("code", code).execute())
    await advance_to_node(code, story["start_node_id"], [], history_override=[])
    return {"ok": True}


# Shoug 2.0's opening stage. Classic room start/voting never enter these routes.
_pack_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


async def authorize_pack_player(code, payload, host_only=False):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.get("presentation") != "shoug2":
        raise HTTPException(403, "Pack Light is only available in Shoug 2.0")
    player = await get_player(payload.player_id) if payload.player_id else None
    if (not player or player.get("room_code") != code or not payload.session_token
            or not secrets.compare_digest(player.get("session_token") or "", payload.session_token)
            or (host_only and not player.get("is_host"))):
        raise HTTPException(403, "A valid room host session is required" if host_only else "A valid session in this room is required")
    return room, player


async def start_pack_light(code, payload):
    room, player = await authorize_pack_player(code, payload, host_only=True)
    if room.get("started"):
        return await compute_room_state(code)
    roster = await _q(lambda: supa.table("players").select("id").eq("room_code", code).execute())
    pack = {"run_id": str(uuid.uuid4()), "participants": [p["id"] for p in roster.data or []],
            "results": {}, "started_at": _now_iso(), "waiting_started_at": None,
            "completed_at": None, "forced_by_host": False}
    await _q(lambda: supa.table("votes").delete().eq("room_code", code).execute())
    await _q(lambda: supa.table("rooms").update({
        "started": True, "current_node_id": None, "phase": "pack_light", "phase_ends_at": None,
        "flags": pack_flags([], pack),
        "wheel_options": [{**test_metadata(room), "history": []}] if test_metadata(room) else None,
        "wheel_winner_choice_id": None,
    }).eq("code", code).eq("started", False).execute())
    return await broadcast_room_state(code)


async def finish_pack_light(code, room, pack, forced=False):
    story = await get_story(room["story_id"])
    if not story or not story.get("start_node_id"):
        raise HTTPException(400, "The tale has no first scene")
    completed = {**pack, "completed_at": _now_iso(), "forced_by_host": forced}
    flags = pack_flags(room.get("flags"), completed)
    claimed = await _q(lambda: supa.table("rooms").update({"phase": "pack_light_finishing", "flags": flags})
        .eq("code", code).eq("phase", "pack_light").execute())
    if not claimed.data:
        return await compute_room_state(code)
    try:
        await advance_to_node(code, story["start_node_id"], flags, history_override=[])
    except Exception:
        await _q(lambda: supa.table("rooms").update({"phase": "pack_light", "flags": pack_flags(room.get("flags"), pack)})
            .eq("code", code).eq("phase", "pack_light_finishing").execute())
        raise
    return await compute_room_state(code)


@api_router.post("/rooms/{code}/shoug2/pack-light/result")
async def submit_pack_light(code: str, payload: PackLightSubmission):
    async with _pack_locks[code]:
        # CAS also protects a request landing on a different worker/replica.
        for _ in range(5):
            room, player = await authorize_pack_player(code, payload)
            pack = read_pack(room)
            if not pack or pack["run_id"] != payload.run_id:
                raise HTTPException(409, "This packing session has changed. Reopen the room.")
            if room.get("phase") != "pack_light":
                if player["id"] in pack["results"]:
                    return await compute_room_state(code)
                raise HTTPException(409, "The room has already continued to the story")
            roster = await _q(lambda: supa.table("players").select("id").eq("room_code", code).execute())
            participants = list(dict.fromkeys(pack["participants"] + [p["id"] for p in roster.data or []]))
            results = dict(pack["results"])
            results.setdefault(player["id"], payload.result.model_dump())
            updated = {**pack, "participants": participants, "results": results,
                       "waiting_started_at": pack.get("waiting_started_at") or _now_iso()}
            flags = pack_flags(room.get("flags"), updated)
            saved = await _q(lambda: supa.table("rooms").update({"flags": flags})
                .eq("code", code).eq("phase", "pack_light")
                .eq("flags", json.dumps(room.get("flags") or [])).execute())
            if not saved.data:
                continue
            room = {**room, "flags": flags}
            if all(pid in results for pid in participants):
                return await finish_pack_light(code, room, updated)
            return await broadcast_room_state(code)
        raise HTTPException(409, "Someone else just finished. Tap Continue again to save your result.")


@api_router.post("/rooms/{code}/shoug2/pack-light/continue")
async def force_pack_light_continue(code: str, payload: PackLightContinue):
    async with _pack_locks[code]:
        room, player = await authorize_pack_player(code, payload, host_only=True)
        pack = read_pack(room)
        if not pack or pack["run_id"] != payload.run_id:
            raise HTTPException(409, "This packing session has changed")
        if room.get("phase") != "pack_light":
            return await compute_room_state(code)
        if player["id"] not in pack["results"]:
            raise HTTPException(409, "Finish packing before continuing")
        if not public_pack(pack)["host_can_continue"]:
            raise HTTPException(409, "The host can continue after 90 seconds of waiting")
        return await finish_pack_light(code, room, pack, forced=True)


@api_router.post("/rooms/{code}/reset")
async def reset_room(code: str, payload: Optional[RoomSessionRequest] = None):
    await guard_test_mutation(code, payload)
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
        "wheel_options": [{**test_metadata(room), "history": []}] if test_metadata(room) else None,
        "wheel_winner_choice_id": None,
    }).eq("code", code).execute())
    await broadcast_room_state(code)
    return {"ok": True}


_vote_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


@api_router.post("/rooms/{code}/vote")
async def cast_vote(code: str, payload: VoteRequest):
    # Serialize requests so duplicate taps cannot resolve the same node twice.
    async with _vote_locks[code]:
        return await _cast_vote(code, payload)


async def _cast_vote(code: str, payload: VoteRequest):
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

    if payload.node_id and payload.node_id != room["current_node_id"]:
        raise HTTPException(409, "This scene has already advanced")
    node = await get_node(room["current_node_id"])
    if not node:
        raise HTTPException(400, "Invalid current node")

    filtered = filter_choices_by_flags(node, room.get("flags") or [])
    if not any(c["id"] == payload.choice_id for c in filtered):
        raise HTTPException(400, "Invalid choice for the current node")

    nid = room["current_node_id"]
    supreme = test_metadata(room) is not None
    if not supreme:
        existing_res = await _q(
            lambda: supa.table("votes").select("id")
            .eq("room_code", code).eq("node_id", nid).eq("player_id", payload.player_id)
            .maybe_single().execute()
        )
        if existing_res is not None and existing_res.data:
            raise HTTPException(400, "You have already voted for this scene")

    if supreme:
        await authorize_test_room(code, payload, room=room, player=player)
        if not payload.node_id or not payload.visit_id or payload.visit_id != room.get("wheel_winner_choice_id"):
            raise HTTPException(409, "This node visit has already advanced")
        # Only the original Test99 creator controls an accelerated room.
        # Claim the node in PostgreSQL before advancing. The conditional update
        # protects against double taps even across multiple Railway workers.
        if (not player.get("is_host") or not payload.session_token
                or not secrets.compare_digest(
                    player.get("session_token") or "", payload.session_token)):
            raise HTTPException(403, "Only the Supreme Test Mode host can select choices")
        claimed = await _q(lambda: supa.table("rooms").update({
            "phase": "resolving", "phase_ends_at": None,
        }).eq("code", code).eq("current_node_id", nid)
          .eq("phase", "voting").eq("wheel_winner_choice_id", payload.visit_id).execute())
        if not (claimed.data or []):
            raise HTTPException(409, "This scene has already advanced")
        _cancel_room_task(code)
        winning = next(c for c in filtered if c["id"] == payload.choice_id)
        try:
            state = await advance_with_choice(code, winning, room.get("flags") or [], previous_room=room)
        except Exception:
            # Do not strand a room in resolving if Supabase fails downstream.
            await _q(lambda: supa.table("rooms").update({
                "phase": "voting",
            }).eq("code", code).eq("current_node_id", nid)
              .eq("phase", "resolving").execute())
            raise
        return state

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


@api_router.post("/rooms/{code}/narration/next")
async def advance_narration(code: str, payload: NarrationAdvanceRequest):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.get("phase") != "narration" or not room.get("current_node_id"):
        raise HTTPException(400, "The room is not showing a narration card")

    player = await get_player(payload.player_id)
    if (
        not player
        or player.get("room_code") != code
        or not player.get("is_host")
        or not secrets.compare_digest(
            player.get("session_token") or "", payload.session_token or ""
        )
    ):
        raise HTTPException(403, "Only the room host can advance narration")

    node = await get_node(room["current_node_id"])
    if not node or node.get("node_type", "story") != "narration":
        raise HTTPException(400, "Invalid narration card")
    destination = node.get("narration_next_node_id")
    if not destination:
        raise HTTPException(400, "This narration card has no next destination")
    if not await get_node(destination):
        raise HTTPException(400, "The narration card's next destination does not exist")

    if await is_supreme_room(code):
        await authorize_test_room(code, payload)
        if not payload.visit_id or payload.visit_id != room.get("wheel_winner_choice_id"):
            raise HTTPException(409, "This narration visit has already advanced")
        claimed = await _q(lambda: supa.table("rooms").update({
            "phase": "resolving", "phase_ends_at": None,
        }).eq("code", code).eq("current_node_id", room["current_node_id"])
          .eq("phase", "narration").eq("wheel_winner_choice_id", payload.visit_id).execute())
        if not (claimed.data or []):
            raise HTTPException(409, "This narration card has already advanced")
        try:
            await advance_to_node(code, destination, room.get("flags") or [])
        except Exception:
            await _q(lambda: supa.table("rooms").update({
                "phase": "narration",
            }).eq("code", code).eq("current_node_id", room["current_node_id"])
              .eq("phase", "resolving").execute())
            raise
    else:
        await advance_to_node(code, destination, room.get("flags") or [])
    return await compute_room_state(code)


@api_router.post("/rooms/{code}/navigation")
async def navigation_graph(code: str, payload: RoomSessionRequest):
    room = await get_room(code)
    player = await get_player(payload.player_id) if payload.player_id else None
    if (not room or not player or player.get("room_code") != code or not payload.session_token
            or not secrets.compare_digest(player.get("session_token") or "", payload.session_token)):
        raise HTTPException(403, "A valid session in this room is required")
    result = await _q(lambda: supa.table("nodes").select("*").eq("story_id", room.get("story_id")).execute())
    return {"nodes": result.data or []}


@api_router.post("/rooms/{code}/test/nodes")
async def test_nodes(code: str, payload: RoomSessionRequest):
    room = await authorize_test_room(code, payload)
    if not room.get("story_id"):
        return {"nodes": []}
    result = await _q(lambda: supa.table("nodes").select("*").eq("story_id", room["story_id"]).execute())
    return {"nodes": result.data or []}


@api_router.post("/rooms/{code}/test/control")
async def test_control(code: str, payload: TestControlRequest):
    async with _vote_locks[code]:
        room = await authorize_test_room(code, payload)
        if not room.get("started") or not payload.visit_id or payload.visit_id != room.get("wheel_winner_choice_id"):
            raise HTTPException(409, "Refresh the room before using this control")
        metadata = test_metadata(room)
        history = list(metadata.get("history", []))
        flags = list(room.get("flags") or [])
        story_id = room["story_id"]
        presentation = room.get("presentation", "classic")
        override = None
        if payload.action == "back":
            if not history:
                raise HTTPException(400, "No previously visited node")
            snapshot = history.pop()
            target, flags, override = snapshot["node_id"], snapshot["flags"], history
        elif payload.action == "restart_node":
            target, override = room["current_node_id"], history
        elif payload.action in ("restart_story", "switch_story"):
            story_id = payload.story_id if payload.action == "switch_story" else story_id
            story = await get_story(story_id)
            if not story or not story.get("start_node_id"):
                raise HTTPException(400, "Story has no start node")
            if payload.action == "switch_story":
                presentation = payload.presentation
                if presentation == "shoug2" and not re.search(r"shoug[’\x27]?s tale", story.get("title", ""), re.IGNORECASE):
                    raise HTTPException(400, "Shoug 2.0 is only available for Shoug's Tale")
            target, flags, override = story["start_node_id"], [], []
        else:
            target = payload.node_id
        node = await get_node(target) if target else None
        if not node or node.get("story_id") != story_id:
            raise HTTPException(400, "Node must belong to the selected story")
        claimed = await _q(lambda: supa.table("rooms").update({"phase": "resolving", "phase_ends_at": None})
                           .eq("code", code).eq("phase", room["phase"])
                           .eq("wheel_winner_choice_id", payload.visit_id).execute())
        if not claimed.data:
            raise HTTPException(409, "The room has already advanced")
        try:
            await _q(lambda: supa.table("rooms").update({"story_id": story_id, "presentation": presentation}).eq("code", code).execute())
            await advance_to_node(code, target, flags, history_override=override)
        except Exception:
            await _q(lambda: supa.table("rooms").update({"story_id": room["story_id"], "presentation": room.get("presentation", "classic"), "phase": room["phase"]}).eq("code", code).eq("wheel_winner_choice_id", payload.visit_id).execute())
            raise
        return await compute_room_state(code)


# ============================================================
# The Baccarat Hunt adventure (multiplayer mini game in a room)
# ============================================================
# The room row stays the durable store (flags envelope + phase), exactly like
# Pack Light. While a room is active its adventure lives in memory here and is
# written through on every story change; Shoug's position is relayed over the
# room WebSocket and saved at a low rate.

_adventures: Dict[str, Dict[str, Any]] = {}
_adventure_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
_adventure_write_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
_adventure_tasks: Dict[str, asyncio.Task] = {}
ADVENTURE_TICK_SECONDS = 0.2
ADVENTURE_POSITION_SAVE_MS = 2_500
ADVENTURE_IDLE_EVICT_MS = 180_000


class AdventureCreateRequest(BaseModel):
    nickname: str
    # "ar" for عطر شاهين (the Kuwaiti Arabic card); every phone in the room follows it.
    lang: Optional[str] = "en"


class AdventureActionRequest(RoomSessionRequest):
    run_id: str
    action: str
    inst: Optional[str] = None
    value: Optional[str] = None
    # Navigator's latest movement seq when pressing A, so the door check waits for an in-flight step.
    seq: Optional[int] = None


class AdventureDevRequest(RoomSessionRequest):
    command: str
    x: Optional[int] = None
    y: Optional[int] = None
    dir: Optional[str] = None
    code: Optional[str] = None
    decoy: Optional[str] = None
    seed: Optional[int] = None
    variant: Optional[str] = None


class AdventureMoveRequest(RoomSessionRequest):
    type: Literal["adv_step", "adv_face"]
    run: str
    seq: int
    dir: str
    x: Optional[int] = None
    y: Optional[int] = None


async def _adventure_entry(code: str, refresh_players: bool = False) -> Optional[Dict[str, Any]]:
    entry = _adventures.get(code)
    if entry is None:
        room = await get_room(code)
        adv = AE.read_envelope((room or {}).get("flags"))
        if not room or not adv:
            return None
        entry = {"adv": adv, "room": room, "players": None, "players_at": 0, "pos_dirty": False,
                 "saved_at": 0, "write_seq": 0, "written_seq": 0}
        _adventures[code] = entry
    if refresh_players or entry["players"] is None or _ms() - entry["players_at"] > 10_000:
        res = await _q(lambda: supa.table("players").select("id,room_code,nickname,joined_at,is_host")
                       .eq("room_code", code).execute())
        entry["players"] = sorted(res.data or [], key=lambda p: p.get("joined_at") or "")
        entry["players_at"] = _ms()
    _ensure_adventure_loop(code)
    return entry


def _adventure_ctx(code: str, entry: Dict[str, Any]) -> Dict[str, Any]:
    return {"players": entry["players"] or [], "presence": manager.presence(code),
            "last_seen": manager.last_seen.get(code, {}),
            "test_creator_id": (test_metadata(entry["room"]) or {}).get("creator_id")}


def _adventure_snapshot(entry: Dict[str, Any]) -> Dict[str, Any]:
    adv = entry["adv"]
    entry["write_seq"] += 1
    entry["pos_dirty"] = False
    entry["saved_at"] = _ms()
    return {"seq": entry["write_seq"], "update": {
        "flags": AE.envelope_flags([], adv), "phase": AE.room_phase(adv), "started": adv["status"] != "lobby",
        "current_node_id": None, "phase_ends_at": None}}


async def _adventure_write(code: str, entry: Dict[str, Any], snapshot: Dict[str, Any]) -> None:
    # Written outside the game lock; an older snapshot never overwrites a newer one.
    async with _adventure_write_locks[code]:
        if snapshot["seq"] <= entry["written_seq"]:
            return
        update = snapshot["update"]
        await _q(lambda: supa.table("rooms").update(update).eq("code", code).execute())
        entry["written_seq"] = snapshot["seq"]


async def _adventure_publish(code: str, entry: Dict[str, Any]) -> Dict[str, Any]:
    adv = entry["adv"]
    now = _ms()
    ctx = _adventure_ctx(code, entry)
    view = AE.public_view(adv, ctx, now)
    await manager.broadcast(code, {"type": "adv_state", "state": view})
    for ws, (room_code, pid) in list(manager.bound.items()):
        if room_code != code:
            continue
        private = AE.private_view(adv, pid, ctx, now)
        if private:
            try:
                await ws.send_text(json.dumps({"type": "adv_private", "data": private}))
            except Exception:
                manager.disconnect(code, ws)
    return view


def _ensure_adventure_loop(code: str) -> None:
    task = _adventure_tasks.get(code)
    if task and not task.done():
        return
    try:
        _adventure_tasks[code] = asyncio.get_running_loop().create_task(_adventure_loop(code))
    except RuntimeError:
        pass  # No running loop (synchronous tests); actions still work.


async def _adventure_loop(code: str) -> None:
    idle_since: Optional[int] = None
    try:
        while True:
            await asyncio.sleep(ADVENTURE_TICK_SECONDS)
            entry = _adventures.get(code)
            if entry is None:
                return
            snapshot = None
            try:
                # Refresh the roster OUTSIDE the game lock: holding the lock across a database
                # round trip froze every step for that long, then the bunched steps were
                # rejected and Shoug snapped back while walking straight.
                if _ms() - entry["players_at"] > 10_000:
                    res = await _q(lambda: supa.table("players").select("id,room_code,nickname,joined_at,is_host")
                                   .eq("room_code", code).execute())
                    entry["players"] = sorted(res.data or [], key=lambda p: p.get("joined_at") or "")
                    entry["players_at"] = _ms()
                async with _adventure_locks[code]:
                    now = _ms()
                    if AE.tick(entry["adv"], _adventure_ctx(code, entry), now):
                        snapshot = _adventure_snapshot(entry)
                        await _adventure_publish(code, entry)
                    elif entry["pos_dirty"] and now - entry["saved_at"] > ADVENTURE_POSITION_SAVE_MS:
                        snapshot = _adventure_snapshot(entry)
                if snapshot:
                    await _adventure_write(code, entry, snapshot)
            except Exception:
                logger.exception(f"adventure tick failed for {code}")
            if manager.count(code) == 0:
                idle_since = idle_since or _ms()
                if _ms() - idle_since > ADVENTURE_IDLE_EVICT_MS:
                    if entry.get("pos_dirty"):
                        await _adventure_write(code, entry, _adventure_snapshot(entry))
                    _adventures.pop(code, None)
                    return
            else:
                idle_since = None
    except asyncio.CancelledError:
        return
    finally:
        if _adventure_tasks.get(code) is asyncio.current_task():
            _adventure_tasks.pop(code, None)


async def _adventure_player(code: str, payload: RoomSessionRequest) -> Dict[str, Any]:
    player = await get_player(payload.player_id) if payload.player_id else None
    if (not player or player.get("room_code") != code or not payload.session_token
            or not secrets.compare_digest(player.get("session_token") or "", payload.session_token)):
        raise HTTPException(403, "A valid session in this room is required")
    manager.touch_http(code, player["id"])
    return player


async def _adventure_commit(code: str, entry: Dict[str, Any]) -> Dict[str, Any]:
    snapshot = _adventure_snapshot(entry)
    view = await _adventure_publish(code, entry)
    return {"snapshot": snapshot, "view": view}


@api_router.post("/rooms/adventure")
async def create_adventure_room(payload: AdventureCreateRequest):
    nickname = payload.nickname.strip()
    if not nickname:
        raise HTTPException(400, "Enter a nickname first")
    created = await create_room(RoomCreateRequest(nickname=nickname))
    code, player = created["code"], created["player"]
    adv = AE.new_adventure(player["id"], bool(created.get("supreme_test_mode")), _ms(), payload.lang)
    if adv["test"]:
        # TEST99 skips the lobby: straight into a playable solo session.
        AE.start_intro(adv, _ms())
    await _q(lambda: supa.table("rooms").update({
        "flags": AE.envelope_flags([], adv), "phase": AE.room_phase(adv), "started": adv["status"] != "lobby",
    }).eq("code", code).execute())
    await _adventure_entry(code, refresh_players=True)
    return {**created, "adventure": True}


@api_router.get("/rooms/{code}/adventure/map")
async def adventure_map(code: str, response: Response, run_id: Optional[str] = None):
    entry = await _adventure_entry(code)
    if not entry:
        raise HTTPException(404, "This room is not playing The Baccarat Hunt")
    adv = entry["adv"]
    if run_id and run_id != adv["run_id"]:
        raise HTTPException(409, "The hunt has restarted")
    if run_id:
        response.headers["Cache-Control"] = "private, max-age=3600"
    return {"run_id": adv["run_id"], "layout": adventure_layout(adv["seed"], adv["variant"]).public()}


@api_router.post("/rooms/{code}/adventure/start")
async def adventure_start(code: str, payload: RoomSessionRequest):
    player = await _adventure_player(code, payload)
    entry = await _adventure_entry(code, refresh_players=True)
    if not entry:
        raise HTTPException(404, "This room is not playing The Baccarat Hunt")
    async with _adventure_locks[code]:
        adv = entry["adv"]
        if player["id"] != adv["host_id"]:
            raise HTTPException(403, "The host starts the hunt")
        if adv["status"] == "lobby":
            AE.start_intro(adv, _ms())
        result = await _adventure_commit(code, entry)
    await _adventure_write(code, entry, result["snapshot"])
    return {"ok": True, "adventure": result["view"]}


@api_router.post("/rooms/{code}/adventure/action")
async def adventure_action(code: str, payload: AdventureActionRequest):
    player = await _adventure_player(code, payload)
    entry = await _adventure_entry(code)
    if not entry:
        raise HTTPException(404, "This room is not playing The Baccarat Hunt")
    if payload.action == "interact" and payload.seq:
        # Steps travel over the socket, A over HTTP: give a step that is still in flight a moment to land.
        for _ in range(16):
            if entry["adv"].get("pos", {}).get("seq", 0) >= payload.seq:
                break
            await asyncio.sleep(0.05)
    async with _adventure_locks[code]:
        adv = entry["adv"]
        if payload.run_id != adv["run_id"]:
            raise HTTPException(409, "The hunt has restarted")
        try:
            outcome = AE.act(adv, _adventure_ctx(code, entry), player["id"], payload.action,
                             {"inst": payload.inst, "value": payload.value}, _ms())
        except AE.ActionError as err:
            raise HTTPException(err.status, err.detail)
        result = await _adventure_commit(code, entry)
    await _adventure_write(code, entry, result["snapshot"])
    return {"ok": True, "result": outcome, "adventure": result["view"]}


@api_router.post("/rooms/{code}/adventure/move")
async def adventure_move(code: str, payload: AdventureMoveRequest):
    """HTTP fallback for steering while the WebSocket reconnects."""
    player = await _adventure_player(code, payload)
    entry = await _adventure_entry(code)
    if not entry:
        raise HTTPException(404, "This room is not playing The Baccarat Hunt")
    accepted, pos, lock = await _adventure_handle_move(code, entry, player["id"], payload.model_dump())
    return {"accepted": accepted, "pos": pos, "lock": lock}


@api_router.post("/rooms/{code}/adventure/private")
async def adventure_private(code: str, payload: RoomSessionRequest):
    player = await _adventure_player(code, payload)
    entry = await _adventure_entry(code)
    if not entry:
        raise HTTPException(404, "This room is not playing The Baccarat Hunt")
    return {"private": AE.private_view(entry["adv"], player["id"], _adventure_ctx(code, entry), _ms())}


@api_router.post("/rooms/{code}/adventure/dev")
async def adventure_dev(code: str, payload: AdventureDevRequest):
    await authorize_test_room(code, payload)
    entry = await _adventure_entry(code, refresh_players=True)
    if not entry:
        raise HTTPException(404, "This room is not playing The Baccarat Hunt")
    manager.touch_http(code, payload.player_id)
    async with _adventure_locks[code]:
        try:
            out = AE.dev(entry["adv"], _adventure_ctx(code, entry), payload.command,
                         payload.model_dump(exclude={"player_id", "session_token", "command"}), _ms())
        except AE.ActionError as err:
            raise HTTPException(err.status, err.detail)
        result = await _adventure_commit(code, entry)
        await manager.broadcast(code, {"type": "adv_pos", "pos": entry["adv"]["pos"], "run": entry["adv"]["run_id"],
                                       "server_ms": _ms(), "teleport": True})
    await _adventure_write(code, entry, result["snapshot"])
    return {"ok": True, "dev": out, "adventure": result["view"]}


async def _adventure_handle_move(code: str, entry: Dict[str, Any], player_id: str, msg: Dict[str, Any],
                                 ws: Optional[WebSocket] = None):
    snapshot = None
    async with _adventure_locks[code]:
        adv = entry["adv"]
        now = _ms()
        accepted, triggers = AE.handle_move(adv, player_id, msg, now)
        if accepted:
            entry["pos_dirty"] = True
            await manager.broadcast(code, {"type": "adv_pos", "pos": adv["pos"], "run": adv["run_id"], "server_ms": now})
            if triggers:
                AE.tick(adv, _adventure_ctx(code, entry), now)
                snapshot = (await _adventure_commit(code, entry))["snapshot"]
        elif ws is not None:
            try:
                await ws.send_text(json.dumps({"type": "adv_correction", "pos": adv["pos"], "run": adv["run_id"],
                                               "lock": AE.movement_lock(adv), "nav_id": adv.get("nav_id"),
                                               "seq": msg.get("seq")}))
            except Exception:
                manager.disconnect(code, ws)
        pos = dict(adv["pos"])
        lock = AE.movement_lock(adv)
    if snapshot:
        await _adventure_write(code, entry, snapshot)
    return accepted, pos, lock


async def _adventure_presence_changed(code: str) -> None:
    entry = _adventures.get(code)
    if not entry:
        return
    snapshot = None
    async with _adventure_locks[code]:
        AE.tick(entry["adv"], _adventure_ctx(code, entry), _ms())
        snapshot = (await _adventure_commit(code, entry))["snapshot"]
    await _adventure_write(code, entry, snapshot)


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
                continue
            try:
                data = json.loads(msg)
            except ValueError:
                continue
            if not isinstance(data, dict):
                continue
            kind = data.get("type")
            if kind == "hello":
                player = await get_player(str(data.get("player_id") or "")) if data.get("player_id") else None
                if (not player or player.get("room_code") != code or not data.get("session_token")
                        or not secrets.compare_digest(player.get("session_token") or "", str(data.get("session_token")))):
                    await ws.send_text(json.dumps({"type": "hello_error", "detail": "Session not recognised"}))
                    continue
                manager.bind(code, ws, player["id"])
                await ws.send_text(json.dumps({"type": "hello_ok", "player_id": player["id"]}))
                if await _adventure_entry(code, refresh_players=True):
                    await _adventure_presence_changed(code)
            elif kind in ("adv_step", "adv_face"):
                player_id = manager.player_of(ws)
                entry = _adventures.get(code) or await _adventure_entry(code)
                if player_id and entry:
                    await _adventure_handle_move(code, entry, player_id, data, ws)
    except WebSocketDisconnect:
        manager.disconnect(code, ws)
    except Exception as e:
        logger.warning(f"WS error: {e}")
        manager.disconnect(code, ws)
    finally:
        if code in _adventures:
            try:
                await _adventure_presence_changed(code)
            except Exception:
                logger.exception("adventure presence update failed")


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
            id=n_start, story_id=story.id, title="Ticket Counter",
            story_text="Zayn stands at the airport ticket counter. The agent smiles: 'Which class today?' A screen behind her flickers with departure gates.",
            position_x=100, position_y=200,
            choices=[
                Choice(text="Buy a Business Class ticket", destination_node_id=n_biz_lounge, sets_flag="business_class"),
                Choice(text="Buy an Economy ticket", destination_node_id=n_econ_terminal, sets_flag="economy"),
            ],
        ),
        Node(
            id=n_biz_lounge, story_id=story.id, title="Business Class Lounge",
            story_text="Zayn sinks into a leather armchair in the lounge. Free espresso, quiet music. A steward offers a warm towel.",
            position_x=450, position_y=80,
            choices=[
                Choice(text="Accept the warm towel and relax", destination_node_id=n_biz_perk, sets_flag="vip_perk"),
                Choice(text="Head straight to the boarding gate", destination_node_id=n_gate),
            ],
        ),
        Node(
            id=n_biz_perk, story_id=story.id, title="VIP Perk",
            story_text="The steward slips Zayn a golden pass — 'For your next flight, sir.' Zayn pockets it and walks to the gate.",
            position_x=800, position_y=80,
            choices=[Choice(text="Continue to boarding gate", destination_node_id=n_gate)],
        ),
        Node(
            id=n_econ_terminal, story_id=story.id, title="Crowded Terminal",
            story_text="Zayn squeezes through a sea of travellers. Someone is arguing with a customs officer. A child drops an ice cream cone.",
            position_x=450, position_y=380,
            choices=[
                Choice(text="Help the child pick up the cone", destination_node_id=n_gate, sets_flag="kind_deed"),
                Choice(text="Push through toward the boarding gate", destination_node_id=n_gate),
            ],
        ),
        Node(
            id=n_gate, story_id=story.id, title="Boarding Gate 42",
            story_text="The group regroups at Gate 42. Departure boards blink. Everyone gathers around the desk.",
            position_x=850, position_y=230, is_location_gate=True,
            choices=[Choice(text="Approach the desk together", destination_node_id=n_vote)],
        ),
        Node(
            id=n_vote, story_id=story.id, title="Which Flight?",
            story_text="Two boards flash: a red-eye to Paris and a sunrise flight to Tokyo. The gate agent looks at the group: 'You decide together.'",
            position_x=1200, position_y=230, is_vote_gate=True,
            choices=[
                Choice(text="Paris", destination_node_id=n_end_paris),
                Choice(text="Tokyo", destination_node_id=n_end_tokyo),
            ],
        ),
        Node(
            id=n_end_paris, story_id=story.id, title="Ending — Paris",
            story_text="Wheels up over the Atlantic. Zayn presses his forehead against the window and grins — Paris, at last.",
            position_x=1550, position_y=100, is_end=True, choices=[],
        ),
        Node(
            id=n_end_tokyo, story_id=story.id, title="Ending — Tokyo",
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

# Plot Twist has isolated sessions and encrypted state; existing games are unchanged.
from plot_twist_api import router as plot_twist_router
app.include_router(plot_twist_router(lambda: supa, _q))

# Emoji Rooftop: same isolated room pattern; the clue bank is editable from the admin CMS.
from emoji_rooftop_api import router as emoji_rooftop_router
app.include_router(emoji_rooftop_router(lambda: supa, _q, require_admin))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=list(dict.fromkeys([origin.strip() for origin in os.environ.get("CORS_ORIGINS", "*").split(",") if origin.strip()] + ["https://moments-ten-psi.vercel.app"])),
    # Only this Moments project's Vercel aliases/previews; unrelated Vercel sites stay blocked.
    allow_origin_regex=r"https://moments(?:-[a-z0-9-]+)?-doordoorgames-projects\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    global supa, database_http
    url = os.environ.get("SUPABASE_URL")
    # Prefer the service-role key (bypasses RLS) for server-side operations;
    # fall back to the anon key if only that is set.
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    if url and key:
        # HTTP/2 pooled connections produced shared ReadError/EAGAIN failures
        # under simultaneous production requests. Use isolated HTTP/1.1 streams.
        database_http = httpx.Client(http2=False, timeout=30.0, limits=httpx.Limits(max_connections=20, max_keepalive_connections=10))
        supa = create_client(url, key, options=ClientOptions(httpx_client=database_http))
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


@app.on_event("shutdown")
async def _shutdown():
    for t in list(_adventure_tasks.values()):
        t.cancel()
    _adventure_tasks.clear()
    if database_http is not None:
        database_http.close()
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
