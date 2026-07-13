"""
Branching Narrative RPG Engine — Backend
Core multiplayer branching-narrative engine with:
- Story/Node/Choice graph
- Rooms + Players (join by room code + nickname)
- Independent per-player progression
- Location Gates (all players must arrive to proceed)
- Vote Gates (majority decides the next node)
- Flag-based conditional choices (requires_flag / sets_flag)
- Admin CRUD (password-gated) + WebSocket live sync
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import string
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
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

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    current_node_id: Optional[str] = None
    flags: List[str] = Field(default_factory=list)
    joined_at: str = Field(default_factory=_now_iso)
    is_host: bool = False


class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str
    story_id: Optional[str] = None
    started: bool = False
    created_at: str = Field(default_factory=_now_iso)


class Vote(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_code: str
    node_id: str
    player_id: str
    choice_id: str
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


class RoomJoinRequest(BaseModel):
    nickname: str


class RoomSelectStoryRequest(BaseModel):
    story_id: str


class ChoiceRequest(BaseModel):
    choice_id: str


class VoteRequest(BaseModel):
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
    return "".join(random.choices(alphabet, k=length))


def filter_choices_for_player(node: Dict[str, Any], player_flags: List[str]) -> List[Dict[str, Any]]:
    """Return only the choices whose requires_flag is satisfied (or None)."""
    flags = set(player_flags or [])
    result: List[Dict[str, Any]] = []
    for c in node.get("choices", []) or []:
        req = c.get("requires_flag")
        if req and req not in flags:
            continue
        result.append(c)
    return result


def require_admin(x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


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


async def broadcast_room_state(room_code: str) -> None:
    state = await compute_room_state(room_code)
    if state is not None:
        await manager.broadcast(room_code, {"type": "room_state", "state": state})


async def compute_room_state(room_code: str) -> Optional[Dict[str, Any]]:
    room = await get_room(room_code)
    if not room:
        return None
    players_cursor = db.players.find({"room_code": room_code}, {"_id": 0})
    players = await players_cursor.to_list(1000)
    story = None
    if room.get("story_id"):
        story = await get_story(room["story_id"])

    # Location gates progress
    gates: Dict[str, Dict[str, Any]] = {}
    for p in players:
        node_id = p.get("current_node_id")
        if not node_id:
            continue
        node = await get_node(node_id)
        if node and node.get("is_location_gate"):
            g = gates.setdefault(node_id, {"node_id": node_id, "title": node.get("title"), "reached": [], "total": len(players)})
            g["reached"].append({"player_id": p["id"], "nickname": p["nickname"]})

    # Vote gates tallies
    vote_states: Dict[str, Dict[str, Any]] = {}
    for p in players:
        node_id = p.get("current_node_id")
        if not node_id:
            continue
        node = await get_node(node_id)
        if node and node.get("is_vote_gate"):
            if node_id in vote_states:
                continue
            votes = await db.votes.find({"room_code": room_code, "node_id": node_id}, {"_id": 0}).to_list(1000)
            tally: Dict[str, int] = {c["id"]: 0 for c in node.get("choices", [])}
            voted_players: List[str] = []
            for v in votes:
                tally[v["choice_id"]] = tally.get(v["choice_id"], 0) + 1
                voted_players.append(v["player_id"])
            eligible = [pp for pp in players if pp.get("current_node_id") == node_id]
            vote_states[node_id] = {
                "node_id": node_id,
                "title": node.get("title"),
                "tally": tally,
                "voted_player_ids": voted_players,
                "eligible": len(eligible),
                "total_votes": len(votes),
                "choices": node.get("choices", []),
            }

    return {
        "room": room,
        "story": story,
        "players": players,
        "location_gates": list(gates.values()),
        "vote_gates": list(vote_states.values()),
    }


# ============================================================
# Public: stories listing
# ============================================================

@api_router.get("/")
async def root():
    return {"message": "Narrative RPG Engine", "ok": True}


@api_router.get("/stories")
async def list_stories_public():
    docs = await db.stories.find({}, {"_id": 0}).to_list(1000)
    # Attach node counts
    result = []
    for s in docs:
        count = await db.nodes.count_documents({"story_id": s["id"]})
        s["node_count"] = count
        result.append(s)
    return result


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
    docs = await db.stories.find({}, {"_id": 0}).to_list(1000)
    for s in docs:
        count = await db.nodes.count_documents({"story_id": s["id"]})
        s["node_count"] = count
    return docs


@api_router.post("/admin/stories", response_model=Story)
async def admin_create_story(payload: StoryCreate, _: bool = Depends(require_admin)):
    story = Story(title=payload.title, description=payload.description)
    doc = story.model_dump()
    await db.stories.insert_one(doc)
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
    # If story has no start node yet, set this as start
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
    # Remove edges from other nodes' choices
    async for other in db.nodes.find({"choices.destination_node_id": node_id}, {"_id": 0}):
        new_choices = []
        for c in other.get("choices", []):
            if c.get("destination_node_id") == node_id:
                c = {**c, "destination_node_id": None}
            new_choices.append(c)
        await db.nodes.update_one({"id": other["id"]}, {"$set": {"choices": new_choices}})
    await db.nodes.delete_one({"id": node_id})
    # Clear start if this was start node
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


# ============================================================
# Player: rooms / join / play
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
    # Check nickname uniqueness (case-insensitive)
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
    start = story["start_node_id"]
    await db.players.update_many(
        {"room_code": code},
        {"$set": {"current_node_id": start, "flags": []}},
    )
    await db.votes.delete_many({"room_code": code})
    await db.rooms.update_one({"code": code}, {"$set": {"started": True}})
    await broadcast_room_state(code)
    return {"ok": True}


@api_router.post("/rooms/{code}/reset")
async def reset_room(code: str):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    await db.players.update_many({"room_code": code}, {"$set": {"current_node_id": None, "flags": []}})
    await db.votes.delete_many({"room_code": code})
    await db.rooms.update_one({"code": code}, {"$set": {"started": False}})
    await broadcast_room_state(code)
    return {"ok": True}


@api_router.get("/rooms/{code}/players/{player_id}/view")
async def get_player_view(code: str, player_id: str):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    player = await get_player(player_id)
    if not player or player["room_code"] != code:
        raise HTTPException(404, "Player not found")
    if not player.get("current_node_id"):
        return {"player": player, "node": None, "choices": [], "waiting": None}
    node = await get_node(player["current_node_id"])
    if not node:
        return {"player": player, "node": None, "choices": [], "waiting": None}

    filtered = filter_choices_for_player(node, player.get("flags", []))

    waiting: Optional[Dict[str, Any]] = None
    if node.get("is_location_gate"):
        # count how many players in the room have reached this node
        all_players = await db.players.find({"room_code": code}, {"_id": 0}).to_list(1000)
        reached = [p for p in all_players if p.get("current_node_id") == node["id"]]
        waiting = {
            "type": "location_gate",
            "reached": [{"player_id": p["id"], "nickname": p["nickname"]} for p in reached],
            "total": len(all_players),
            "reached_count": len(reached),
            "complete": len(reached) == len(all_players) and len(all_players) > 0,
        }
    elif node.get("is_vote_gate"):
        all_players = await db.players.find({"room_code": code}, {"_id": 0}).to_list(1000)
        eligible = [p for p in all_players if p.get("current_node_id") == node["id"]]
        votes = await db.votes.find({"room_code": code, "node_id": node["id"]}, {"_id": 0}).to_list(1000)
        tally: Dict[str, int] = {c["id"]: 0 for c in node.get("choices", [])}
        voted_ids: List[str] = []
        for v in votes:
            tally[v["choice_id"]] = tally.get(v["choice_id"], 0) + 1
            voted_ids.append(v["player_id"])
        waiting = {
            "type": "vote_gate",
            "tally": tally,
            "total_votes": len(votes),
            "eligible": len(eligible),
            "has_voted": player_id in voted_ids,
            "voted_player_ids": voted_ids,
            "resolved": False,
        }

    return {"player": player, "node": node, "choices": filtered, "waiting": waiting}


@api_router.post("/rooms/{code}/players/{player_id}/choose")
async def player_choose(code: str, player_id: str, payload: ChoiceRequest):
    room = await get_room(code)
    if not room:
        raise HTTPException(404, "Room not found")
    player = await get_player(player_id)
    if not player or player["room_code"] != code:
        raise HTTPException(404, "Player not found")
    node = await get_node(player.get("current_node_id") or "")
    if not node:
        raise HTTPException(400, "Player not on a node")
    if node.get("is_vote_gate"):
        raise HTTPException(400, "Use /vote endpoint for vote gates")
    # find choice
    choice = next((c for c in node.get("choices", []) if c["id"] == payload.choice_id), None)
    if not choice:
        raise HTTPException(400, "Invalid choice")

    if node.get("is_location_gate"):
        # Choosing at a location gate is only allowed once all players reached; then advance EVERYONE at the gate together.
        all_players = await db.players.find({"room_code": code}, {"_id": 0}).to_list(1000)
        reached = [p for p in all_players if p.get("current_node_id") == node["id"]]
        if len(reached) != len(all_players):
            raise HTTPException(400, "Waiting for all players to reach the location gate")
        dest = choice.get("destination_node_id")
        set_flag = choice.get("sets_flag")
        for p in reached:
            new_flags = list(p.get("flags") or [])
            if set_flag and set_flag not in new_flags:
                new_flags.append(set_flag)
            await db.players.update_one(
                {"id": p["id"]},
                {"$set": {"current_node_id": dest, "flags": new_flags}},
            )
        await broadcast_room_state(code)
        return await get_player_view(code, player_id)

    # requires_flag check for normal nodes
    if choice.get("requires_flag") and choice["requires_flag"] not in (player.get("flags") or []):
        raise HTTPException(400, "Choice not available for this player")
    # advance the caller only
    new_flags = list(player.get("flags") or [])
    if choice.get("sets_flag") and choice["sets_flag"] not in new_flags:
        new_flags.append(choice["sets_flag"])
    dest = choice.get("destination_node_id")
    updates = {"flags": new_flags, "current_node_id": dest}
    await db.players.update_one({"id": player_id}, {"$set": updates})
    await broadcast_room_state(code)
    return await get_player_view(code, player_id)


async def _resolve_vote_gate(code: str, node_id: str) -> Optional[str]:
    """If majority reached, apply winning choice to all players on this vote gate. Returns winning choice_id or None."""
    node = await get_node(node_id)
    if not node or not node.get("is_vote_gate"):
        return None
    all_players = await db.players.find({"room_code": code}, {"_id": 0}).to_list(1000)
    eligible = [p for p in all_players if p.get("current_node_id") == node_id]
    if not eligible:
        return None
    votes = await db.votes.find({"room_code": code, "node_id": node_id}, {"_id": 0}).to_list(1000)
    if len(votes) < len(eligible):
        return None  # still waiting for everyone eligible to vote
    tally = Counter(v["choice_id"] for v in votes)
    if not tally:
        return None
    top = tally.most_common()
    winning_choice_id, top_count = top[0]
    # Tie-break: pick earliest cast vote among tied choices (deterministic)
    tied = [cid for cid, cnt in top if cnt == top_count]
    if len(tied) > 1:
        # find earliest vote among tied choices
        earliest_by_choice: Dict[str, str] = {}
        for v in sorted(votes, key=lambda x: x.get("created_at", "")):
            if v["choice_id"] in tied and v["choice_id"] not in earliest_by_choice:
                earliest_by_choice[v["choice_id"]] = v["created_at"]
        winning_choice_id = min(earliest_by_choice, key=lambda k: earliest_by_choice[k])
    winning_choice = next((c for c in node.get("choices", []) if c["id"] == winning_choice_id), None)
    if not winning_choice:
        return None
    dest = winning_choice.get("destination_node_id")
    # Advance all eligible players
    for p in eligible:
        new_flags = list(p.get("flags") or [])
        if winning_choice.get("sets_flag") and winning_choice["sets_flag"] not in new_flags:
            new_flags.append(winning_choice["sets_flag"])
        await db.players.update_one(
            {"id": p["id"]},
            {"$set": {"current_node_id": dest, "flags": new_flags}},
        )
    # Clean up votes for this gate
    await db.votes.delete_many({"room_code": code, "node_id": node_id})
    await manager.broadcast(code, {"type": "vote_resolved", "node_id": node_id, "choice_id": winning_choice_id})
    return winning_choice_id


@api_router.post("/rooms/{code}/players/{player_id}/vote")
async def player_vote(code: str, player_id: str, payload: VoteRequest):
    player = await get_player(player_id)
    if not player or player["room_code"] != code:
        raise HTTPException(404, "Player not found")
    node = await get_node(player.get("current_node_id") or "")
    if not node:
        raise HTTPException(400, "Player not on a node")
    if not node.get("is_vote_gate"):
        raise HTTPException(400, "Current node is not a vote gate")
    choice = next((c for c in node.get("choices", []) if c["id"] == payload.choice_id), None)
    if not choice:
        raise HTTPException(400, "Invalid choice")
    existing = await db.votes.find_one({"room_code": code, "node_id": node["id"], "player_id": player_id})
    if existing:
        raise HTTPException(400, "Already voted")
    v = Vote(room_code=code, node_id=node["id"], player_id=player_id, choice_id=payload.choice_id)
    await db.votes.insert_one(v.model_dump())
    await _resolve_vote_gate(code, node["id"])
    await broadcast_room_state(code)
    return await get_player_view(code, player_id)


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
        # Send initial snapshot
        state = await compute_room_state(code)
        await ws.send_text(json.dumps({"type": "room_state", "state": state}))
        while True:
            # Keep alive; clients don't need to send anything, but we listen for pings.
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

    story = Story(title="Airport Adventure — Zayn", description="A short branching tale about Zayn navigating a mysterious airport with his friends. Choose your ticket, meet at the boarding gate, and vote on which flight to take.")
    # Pre-generate node IDs so we can wire choices
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
            id=n_start,
            story_id=story.id,
            title="Ticket Counter",
            character="Zayn",
            story_text="Zayn stands at the airport ticket counter. The agent smiles: 'Which class today?' A screen behind her flickers with departure gates.",
            position_x=100, position_y=200,
            choices=[
                Choice(text="Buy a Business Class ticket", destination_node_id=n_biz_lounge, sets_flag="business_class"),
                Choice(text="Buy an Economy ticket", destination_node_id=n_econ_terminal, sets_flag="economy"),
            ],
        ),
        Node(
            id=n_biz_lounge,
            story_id=story.id,
            title="Business Class Lounge",
            character="Zayn",
            story_text="Zayn sinks into a leather armchair in the lounge. Free espresso, quiet music. A steward offers a warm towel.",
            position_x=450, position_y=80,
            choices=[
                Choice(text="Accept the warm towel and relax", destination_node_id=n_biz_perk, sets_flag="vip_perk"),
                Choice(text="Head straight to the boarding gate", destination_node_id=n_gate),
            ],
        ),
        Node(
            id=n_biz_perk,
            story_id=story.id,
            title="VIP Perk",
            character="Zayn",
            story_text="The steward slips Zayn a golden pass — 'For your next flight, sir.' Zayn pockets it and walks to the gate.",
            position_x=800, position_y=80,
            choices=[
                Choice(text="Continue to boarding gate", destination_node_id=n_gate),
            ],
        ),
        Node(
            id=n_econ_terminal,
            story_id=story.id,
            title="Crowded Terminal",
            character="Zayn",
            story_text="Zayn squeezes through a sea of travellers. Someone is arguing with a customs officer. A child drops an ice cream cone.",
            position_x=450, position_y=380,
            choices=[
                Choice(text="Help the child pick up the cone", destination_node_id=n_gate, sets_flag="kind_deed"),
                Choice(text="Push through toward the boarding gate", destination_node_id=n_gate),
            ],
        ),
        Node(
            id=n_gate,
            story_id=story.id,
            title="Boarding Gate 42",
            character="Group",
            story_text="The group finally regroups at Gate 42. Departure boards blink. Everyone waits until the whole party has arrived — no-one flies alone tonight.",
            position_x=850, position_y=230,
            is_location_gate=True,
            choices=[
                Choice(text="Approach the desk together", destination_node_id=n_vote),
            ],
        ),
        Node(
            id=n_vote,
            story_id=story.id,
            title="Which Flight? (Group Vote)",
            character="Group",
            story_text="Two boards flash: a red-eye to Paris and a sunrise flight to Tokyo. The gate agent looks at the group: 'You decide together.'",
            position_x=1200, position_y=230,
            is_vote_gate=True,
            choices=[
                Choice(text="Vote: Paris", destination_node_id=n_end_paris),
                Choice(text="Vote: Tokyo", destination_node_id=n_end_tokyo),
            ],
        ),
        Node(
            id=n_end_paris,
            story_id=story.id,
            title="Ending — Paris",
            character="Zayn",
            story_text="Wheels up over the Atlantic. Zayn presses his forehead against the window and grins — Paris, at last.",
            position_x=1550, position_y=100,
            is_end=True,
            choices=[],
        ),
        Node(
            id=n_end_tokyo,
            story_id=story.id,
            title="Ending — Tokyo",
            character="Zayn",
            story_text="Golden dawn over the Pacific. Zayn sips green tea from a paper cup as the cabin whispers with excitement — Tokyo awaits.",
            position_x=1550, position_y=360,
            is_end=True,
            choices=[],
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
    client.close()
