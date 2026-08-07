"""
Branching Narrative RPG Engine — Backend
Synchronized group-voting runtime:
- All players in a room share ONE current node, ONE set of flags, ONE phase.
- Phases per node: reading (10s, no votes) -> voting (20s or until everyone voted) -> resolve.
- Ties trigger a spinning-wheel (server picks random winner from tied options; broadcasts to clients for animation).
- Winning choice is applied for the whole group; everyone advances together.
- Editor (admin) endpoints and data model unchanged.
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
    Header,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
    Form,
)
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

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
# Helpers
# ============================================================

def _clean(doc: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


async def get_node(node_id: str) -> Optional[Dict[str, Any]]:
    return _clean(await db.nodes.find_one({"id": node_id}))


async def get_room(code: str) -> Optional[Dict[str, Any]]:
    return _clean(await db.rooms.find_one({"code": code}))


async def get_player(player_id: str) -> Optional[Dict[str, Any]]:
    return _clean(await db.players.find_one({"id": player_id}))


async def get_story(story_id: str) -> Optional[Dict[str, Any]]:
    return _clean(await db.stories.find_one({"id": story_id}))


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


def _json_from_ai(text: str) -> Dict[str, Any]:
    """Parse a JSON object even when a model wraps it in a markdown fence."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I | re.S)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("AI did not return a JSON object")
    return json.loads(text[start:end + 1])


async def _openai_json(system: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, "Ramble AI is not configured. Add OPENAI_API_KEY on the server.")

    def call():
        import requests
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


def _validate_proposal(story_id: str, proposal: Dict[str, Any], existing: List[Dict[str, Any]]) -> List[str]:
    errors: List[str] = []
    existing_ids = {n["id"] for n in existing}
    operations = proposal.get("operations") or []
    temp_ids = {op.get("temp_id") for op in operations if op.get("action") == "create"}
    temp_ids.discard(None)
    deleted = {op.get("node_id") for op in operations if op.get("action") == "delete"}
    valid_targets = (existing_ids - deleted) | temp_ids
    if not operations:
        errors.append("The proposal has no changes.")
    if len(temp_ids) != len([op for op in operations if op.get("action") == "create"]):
        errors.append("Every new node needs a unique temporary ID.")
    for op in operations:
        action = op.get("action")
        if action not in {"create", "update", "delete"}:
            errors.append(f"Unsupported action: {action}")
            continue
        if action in {"update", "delete"} and op.get("node_id") not in existing_ids:
            errors.append("A proposed change refers to a node that no longer exists.")
        node = op.get("node") or {}
        if action != "delete":
            if not str(node.get("title") or "").strip():
                errors.append("Every proposed node needs a title.")
            for choice in node.get("choices") or []:
                target = choice.get("destination_node_id")
                if target and target not in valid_targets:
                    errors.append(f"Choice '{choice.get('text', '')}' has an invalid destination.")
    return list(dict.fromkeys(errors))


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
    players = await db.players.find({"room_code": code}, {"_id": 0}).to_list(1000)
    story = None
    if room.get("story_id"):
        story = await get_story(room["story_id"])
    current_node = None
    filtered_choices: List[Dict[str, Any]] = []
    if room.get("current_node_id"):
        current_node = await get_node(room["current_node_id"])
        if current_node:
            filtered_choices = filter_choices_by_flags(current_node, room.get("flags") or [])

    vote_docs = []
    if room.get("current_node_id") and room.get("phase") in ("voting", "wheel", "ended"):
        vote_docs = await db.votes.find(
            {"room_code": code, "node_id": room["current_node_id"]}, {"_id": 0}
        ).to_list(1000)

    voted_player_ids = [v["player_id"] for v in vote_docs]
    tally: Dict[str, int] = {}
    if room.get("phase") in ("wheel", "ended"):
        # Reveal tally only after voting is closed / decision made
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


async def _start_phase_task(code: str, coro):
    _cancel_room_task(code)
    task = asyncio.create_task(coro)
    _room_tasks[code] = task


async def advance_to_node(code: str, node_id: str, flags: List[str]) -> None:
    """Enter a new node. Broadcasts reading phase; schedules automatic voting transition."""
    _cancel_room_task(code)
    node = await get_node(node_id)
    if not node:
        # Nothing to do — mark ended
        await db.rooms.update_one(
            {"code": code},
            {"$set": {
                "current_node_id": node_id,
                "phase": "ended",
                "phase_ends_at": None,
                "flags": flags,
                "wheel_options": None,
                "wheel_winner_choice_id": None,
            }},
        )
        await broadcast_room_state(code)
        return

    # Compute filtered choices to decide if terminal
    filtered = filter_choices_by_flags(node, flags)

    if node.get("is_end") or not filtered:
        # Terminal node — end the story
        await db.rooms.update_one(
            {"code": code},
            {"$set": {
                "current_node_id": node_id,
                "phase": "ended",
                "phase_ends_at": None,
                "flags": flags,
                "wheel_options": None,
                "wheel_winner_choice_id": None,
            }},
        )
        # Clear votes for cleanliness
        await db.votes.delete_many({"room_code": code})
        await broadcast_room_state(code)
        return

    # Non-terminal: start reading phase
    reading_ends = _now() + timedelta(seconds=READING_SECONDS)
    await db.rooms.update_one(
        {"code": code},
        {"$set": {
            "current_node_id": node_id,
            "phase": "reading",
            "phase_ends_at": reading_ends.isoformat(),
            "flags": flags,
            "wheel_options": None,
            "wheel_winner_choice_id": None,
        }},
    )
    # Clear votes for this node (fresh start)
    await db.votes.delete_many({"room_code": code, "node_id": node_id})
    await broadcast_room_state(code)
    await _start_phase_task(code, _reading_then_voting(code, node_id))


async def _reading_then_voting(code: str, node_id: str) -> None:
    try:
        await asyncio.sleep(READING_SECONDS)
        # Only transition if still on this node in reading phase
        room = await get_room(code)
        if not room or room.get("current_node_id") != node_id or room.get("phase") != "reading":
            return
        voting_ends = _now() + timedelta(seconds=VOTING_SECONDS)
        await db.rooms.update_one(
            {"code": code},
            {"$set": {"phase": "voting", "phase_ends_at": voting_ends.isoformat()}},
        )
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

    votes = await db.votes.find(
        {"room_code": code, "node_id": node_id}, {"_id": 0}
    ).to_list(1000)
    # Only count votes for still-available choices
    valid_votes = [v for v in votes if v["choice_id"] in filtered_ids]

    if not valid_votes:
        # No votes at all: random pick from filtered options
        picked = random.choice(filtered) if filtered else None
        if picked is None:
            await db.rooms.update_one({"code": code}, {"$set": {"phase": "ended", "phase_ends_at": None}})
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
    await db.rooms.update_one(
        {"code": code},
        {"$set": {
            "phase": "wheel",
            "phase_ends_at": wheel_ends.isoformat(),
            "wheel_options": tied_options,
            "wheel_winner_choice_id": picked["id"],
        }},
    )
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
        await db.rooms.update_one(
            {"code": code},
            {"$set": {"phase": "ended", "phase_ends_at": None, "flags": new_flags,
                       "wheel_options": None, "wheel_winner_choice_id": None}},
        )
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
    docs = await db.stories.find({}, {"_id": 0}).to_list(1000)
    result = []
    for s in docs:
        count = await db.nodes.count_documents({"story_id": s["id"]})
        s["node_count"] = count
        result.append(s)
    return result


# ============================================================
# Admin: auth + CRUD (UNCHANGED)
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
    docs = await db.stories.find({}, {"_id": 0}).to_list(1000)
    for s in docs:
        count = await db.nodes.count_documents({"story_id": s["id"]})
        s["node_count"] = count
    return docs


@api_router.post("/admin/stories", response_model=Story)
async def admin_create_story(payload: StoryCreate, _: bool = Depends(require_admin)):
    story = Story(title=payload.title, description=payload.description)
    await db.stories.insert_one(story.model_dump())
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
        await db.stories.update_one({"id": story_id}, {"$set": updates})
    return await get_story(story_id)


@api_router.delete("/admin/stories/{story_id}")
async def admin_delete_story(story_id: str, _: bool = Depends(require_admin)):
    await db.stories.delete_one({"id": story_id})
    await db.nodes.delete_many({"story_id": story_id})
    return {"ok": True}


@api_router.get("/admin/stories/{story_id}/graph")
async def admin_get_graph(story_id: str, _: bool = Depends(require_admin)):
    story = await get_story(story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    nodes = await db.nodes.find({"story_id": story_id}, {"_id": 0}).to_list(5000)
    return {"story": story, "nodes": nodes}


@api_router.post("/admin/nodes", response_model=Node)
async def admin_create_node(payload: NodeCreate, _: bool = Depends(require_admin)):
    node = Node(**payload.model_dump())
    await db.nodes.insert_one(node.model_dump())
    story = await get_story(payload.story_id)
    if story and not story.get("start_node_id"):
        await db.stories.update_one({"id": payload.story_id}, {"$set": {"start_node_id": node.id}})
    return node


@api_router.put("/admin/nodes/{node_id}")
async def admin_update_node(node_id: str, payload: NodeUpdate, _: bool = Depends(require_admin)):
    updates: Dict[str, Any] = {}
    for k, v in payload.model_dump().items():
        if v is None:
            continue
        if k == "choices":
            updates[k] = [Choice(**c).model_dump() if not isinstance(c, dict) else c for c in v]
        else:
            updates[k] = v
    if updates:
        await db.nodes.update_one({"id": node_id}, {"$set": updates})
    return await get_node(node_id)


@api_router.delete("/admin/nodes/{node_id}")
async def admin_delete_node(node_id: str, _: bool = Depends(require_admin)):
    async for other in db.nodes.find({"choices.destination_node_id": node_id}, {"_id": 0}):
        new_choices = []
        for c in other.get("choices", []):
            if c.get("destination_node_id") == node_id:
                c = {**c, "destination_node_id": None}
            new_choices.append(c)
        await db.nodes.update_one({"id": other["id"]}, {"$set": {"choices": new_choices}})
    await db.nodes.delete_one({"id": node_id})
    story = await db.stories.find_one({"start_node_id": node_id})
    if story:
        await db.stories.update_one({"id": story["id"]}, {"$set": {"start_node_id": None}})
    return {"ok": True}


@api_router.post("/admin/nodes/positions")
async def admin_bulk_positions(updates: List[PositionUpdate], _: bool = Depends(require_admin)):
    for u in updates:
        await db.nodes.update_one(
            {"id": u.id},
            {"$set": {"position_x": u.position_x, "position_y": u.position_y}},
        )
    return {"ok": True, "count": len(updates)}


@api_router.post("/admin/stories/{story_id}/set-start")
async def admin_set_start_node(story_id: str, node_id: str, _: bool = Depends(require_admin)):
    await db.stories.update_one({"id": story_id}, {"$set": {"start_node_id": node_id}})
    return await get_story(story_id)


@api_router.post("/admin/ramble/transcribe")
async def admin_ramble_transcribe(
    audio: UploadFile = File(...),
    story_id: str = Form(...),
    _: bool = Depends(require_admin),
):
    if not await get_story(story_id):
        raise HTTPException(404, "Story not found")
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, "Transcription is not configured. Add OPENAI_API_KEY on the server.")
    content = await audio.read()
    if not content or len(content) > 25 * 1024 * 1024:
        raise HTTPException(400, "Recording is empty or larger than 25 MB")

    def call():
        import requests
        response = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {key}"},
            files={"file": (audio.filename or "ramble.webm", content, audio.content_type or "audio/webm")},
            data={"model": os.environ.get("RAMBLE_TRANSCRIBE_MODEL", "whisper-1")},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()
    try:
        result = await asyncio.to_thread(call)
        return {"transcript": result.get("text", "").strip()}
    except Exception as exc:
        logger.exception("Ramble transcription failed")
        raise HTTPException(502, f"Transcription failed: {str(exc)[:160]}")


@api_router.post("/admin/ramble/interpret")
async def admin_ramble_interpret(payload: RambleInterpretRequest, _: bool = Depends(require_admin)):
    story = await get_story(payload.story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    nodes = await db.nodes.find({"story_id": payload.story_id}, {"_id": 0}).to_list(2000)
    if payload.selected_node_id and not any(n["id"] == payload.selected_node_id for n in nodes):
        raise HTTPException(400, "Selected node is not part of this story")
    compact_nodes = [{
        "id": n["id"], "title": n.get("title"), "story_text": n.get("story_text"),
        "character": n.get("character"), "position_x": n.get("position_x"),
        "position_y": n.get("position_y"), "is_location_gate": n.get("is_location_gate", False),
        "is_vote_gate": n.get("is_vote_gate", False), "is_end": n.get("is_end", False),
        "choices": n.get("choices", []),
    } for n in nodes]
    system = """You are Moments' careful story-structure assistant. Convert an author's natural-language ramble into a PREVIEW proposal only. Never claim it is applied. Use the existing node model exactly. Return JSON with: summary (string), assumptions (string[]), clarifications ({id,question,options[],allow_ai_decide}[]; only structurally important unknowns), operations ({action:create|update|delete,temp_id?,node_id?,reason,node?}[]), and warnings (string[]). For create/update node fields may include title, story_text, character, position_x, position_y, is_location_gate, is_vote_gate, is_end, choices. Each choice requires id, text, destination_node_id (existing id or create temp_id), sets_flag, requires_flag. Preserve fields not intentionally changed in updates by returning a complete merged node. Never delete a branch without explicit author language. Prefer 1-5 focused changes. Place new cards near the selected/context node without overlapping. If a key decision is missing, ask a clarification and still provide a clearly marked best-effort draft. Do not invent important character/location/branch decisions silently."""
    result = await _openai_json(system, {
        "story": story, "nodes": compact_nodes, "selected_node_id": payload.selected_node_id,
        "transcript": payload.transcript, "variation_count": payload.variation_count,
    })
    errors = _validate_proposal(payload.story_id, result, nodes)
    return {"proposal": result, "validation_errors": errors}


@api_router.post("/admin/ramble/apply")
async def admin_ramble_apply(payload: RambleApplyRequest, _: bool = Depends(require_admin)):
    story = await get_story(payload.story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    existing = await db.nodes.find({"story_id": payload.story_id}, {"_id": 0}).to_list(2000)
    errors = _validate_proposal(payload.story_id, payload.proposal, existing)
    if errors:
        raise HTTPException(400, {"message": "Proposal validation failed", "errors": errors})
    operations = payload.proposal.get("operations") or []
    id_map = {op["temp_id"]: str(uuid.uuid4()) for op in operations if op.get("action") == "create"}
    backup = {n["id"]: n for n in existing}
    touched: List[str] = []
    try:
        for op in operations:
            if op["action"] == "delete":
                await db.nodes.delete_one({"id": op["node_id"], "story_id": payload.story_id})
                touched.append(op["node_id"])
                continue
            body = dict(op.get("node") or {})
            choices = []
            for raw_choice in body.get("choices") or []:
                c = dict(raw_choice)
                c["id"] = c.get("id") or str(uuid.uuid4())
                c["destination_node_id"] = id_map.get(c.get("destination_node_id"), c.get("destination_node_id"))
                choices.append(Choice(**c).model_dump())
            body["choices"] = choices
            if op["action"] == "create":
                node = Node(id=id_map[op["temp_id"]], story_id=payload.story_id, **body).model_dump()
                await db.nodes.insert_one(node)
                touched.append(node["id"])
            else:
                node_id = op["node_id"]
                merged = {**backup[node_id], **body, "id": node_id, "story_id": payload.story_id}
                node = Node(**merged).model_dump()
                await db.nodes.replace_one({"id": node_id, "story_id": payload.story_id}, node)
                touched.append(node_id)
        # Clear any incoming references to explicitly deleted nodes unless proposal updated them.
        deleted = {op["node_id"] for op in operations if op.get("action") == "delete"}
        if deleted:
            remaining = await db.nodes.find({"story_id": payload.story_id}, {"_id": 0}).to_list(2000)
            for n in remaining:
                repaired = [{**c, "destination_node_id": None} if c.get("destination_node_id") in deleted else c for c in n.get("choices", [])]
                if repaired != n.get("choices", []):
                    await db.nodes.update_one({"id": n["id"]}, {"$set": {"choices": repaired}})
            if story.get("start_node_id") in deleted:
                await db.stories.update_one({"id": payload.story_id}, {"$set": {"start_node_id": None}})
        return {"ok": True, "created_id_map": id_map, "touched_node_ids": touched}
    except Exception:
        logger.exception("Ramble apply failed; restoring story nodes")
        await db.nodes.delete_many({"story_id": payload.story_id})
        if existing:
            await db.nodes.insert_many(existing)
        raise HTTPException(500, "Could not apply proposal. The original graph was restored.")


# ============================================================
# Player runtime: rooms, join, vote (shared group voting)
# ============================================================

@api_router.post("/rooms")
async def create_room():
    for _ in range(10):
        code = generate_room_code()
        if not await db.rooms.find_one({"code": code}):
            room = Room(code=code)
            await db.rooms.insert_one(room.model_dump())
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
    existing = await db.players.count_documents({"room_code": code})
    existing_names = await db.players.find({"room_code": code}, {"_id": 0, "nickname": 1}).to_list(1000)
    if any(p["nickname"].lower() == payload.nickname.lower() for p in existing_names):
        raise HTTPException(400, "Nickname already taken in this room")
    player = Player(
        room_code=code,
        nickname=payload.nickname,
        is_host=(existing == 0),
    )
    await db.players.insert_one(player.model_dump())
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
    await db.rooms.update_one({"code": code}, {"$set": {"story_id": payload.story_id}})
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
    await db.votes.delete_many({"room_code": code})
    await db.rooms.update_one(
        {"code": code},
        {"$set": {"started": True, "flags": [], "wheel_options": None, "wheel_winner_choice_id": None}},
    )
    await advance_to_node(code, story["start_node_id"], [])
    return {"ok": True}


@api_router.post("/rooms/{code}/reset")
async def reset_room(code: str):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    _cancel_room_task(code)
    await db.votes.delete_many({"room_code": code})
    await db.rooms.update_one(
        {"code": code},
        {"$set": {
            "started": False,
            "current_node_id": None,
            "phase": "lobby",
            "phase_ends_at": None,
            "flags": [],
            "wheel_options": None,
            "wheel_winner_choice_id": None,
        }},
    )
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

    existing = await db.votes.find_one({
        "room_code": code,
        "node_id": room["current_node_id"],
        "player_id": payload.player_id,
    })
    if existing:
        raise HTTPException(400, "You have already voted for this scene")

    vote_doc = {
        "id": str(uuid.uuid4()),
        "room_code": code,
        "node_id": room["current_node_id"],
        "player_id": payload.player_id,
        "choice_id": payload.choice_id,
        "created_at": _now_iso(),
    }
    await db.votes.insert_one(vote_doc)
    await broadcast_room_state(code)

    # If everyone has voted, immediately resolve
    total_players = await db.players.count_documents({"room_code": code})
    votes_now = await db.votes.count_documents({"room_code": code, "node_id": room["current_node_id"]})
    if votes_now >= total_players and total_players > 0:
        _cancel_room_task(code)
        await resolve_votes(code, room["current_node_id"], reason="all_voted")

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
    existing = await db.stories.find_one({"title": "Airport Adventure — Zayn"})
    if existing:
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

    await db.stories.insert_one(story.model_dump())
    for n in nodes:
        await db.nodes.insert_one(n.model_dump())
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
    await db.stories.create_index("id", unique=True)
    await db.nodes.create_index("id", unique=True)
    await db.nodes.create_index("story_id")
    await db.rooms.create_index("code", unique=True)
    await db.players.create_index("id", unique=True)
    await db.players.create_index("room_code")
    await db.votes.create_index([("room_code", 1), ("node_id", 1), ("player_id", 1)])
    await seed_zayn_story()
    logger.info(f"Admin token: {ADMIN_TOKEN}")


@app.on_event("shutdown")
async def _shutdown():
    for t in list(_room_tasks.values()):
        try:
            t.cancel()
        except Exception:
            pass
    client.close()
