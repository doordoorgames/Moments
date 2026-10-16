"""Baccarat Hunt adventure engine.

A pure, server-authoritative state machine. server.py owns persistence,
sockets and timers; this module only transforms the JSON-serialisable
adventure dict. Nothing here may leak the OTP digits into public views.
"""
from __future__ import annotations

import json
import random
import secrets
import uuid
from typing import Any, Dict, List, Optional, Tuple

import adventure_config as C
from adventure_map import VARIANTS, get_layout

PREFIX = "__baccarat_adventure_v1__:"
T = C.TIMING
PRIMARY = next(p["id"] for p in C.PERFUMES if p.get("correct"))
FALLBACK = next(p["id"] for p in C.PERFUMES if p.get("fallback"))
PERFUMES = {p["id"]: p for p in C.PERFUMES}
DIRS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
SHARIFA_EVENTS = ("sharifa_1", "sharifa_2", "sharifa_3", "sharifa_4")
ALL_EVENTS = ("sharifa_1", "otp", "sharifa_2", "zain_call", "train", "gulf", "sharifa_3", "sharifa_4")
# Scene stages that stop the shared countdown (nothing for players to do).
PAUSING_SCENES = {("gulf", "greet"), ("gulf", "react"), ("gulf", "leave"), ("gulf", "wrong"),
                  ("door", "show"), ("door_locked", "show"), ("shop", "show")}
# Durations the clients need to draw countdown bars.
PUBLIC_TIMING = ("ring_ms", "otp_visible_ms", "otp_entry_ms", "train_answer_ms", "gulf_inspect_ms", "gulf_leave_ms", "finale_ms")


class ActionError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# ============================================================
# Envelope (persisted in rooms.flags)
# ============================================================

def read_envelope(flags) -> Optional[Dict[str, Any]]:
    for flag in flags or []:
        if isinstance(flag, str) and flag.startswith(PREFIX):
            try:
                return json.loads(flag[len(PREFIX):])
            except ValueError:
                return None
    return None


def strip_envelope(flags) -> List:
    return [f for f in flags or [] if not (isinstance(f, str) and f.startswith(PREFIX))]


def envelope_flags(flags, adv: Dict[str, Any]) -> List:
    return strip_envelope(flags) + [PREFIX + json.dumps(adv, separators=(",", ":"), sort_keys=True)]


def room_phase(adv: Dict[str, Any]) -> str:
    return "adventure_lobby" if adv["status"] == "lobby" else "adventure"


# ============================================================
# Helpers
# ============================================================

def word_ms(word: str) -> int:
    return T["voice_word_base_ms"] + len(word) * 26 + (210 if word[-1:] in ".,!?" else 0)


def voice_duration(script: str) -> int:
    # **markers** only style key words on screen; they are never spoken.
    return sum(word_ms(w) for w in script.replace("**", "").split()) + 700


def layout_of(adv) :
    return get_layout(adv["seed"], adv["variant"])


def _bump(adv: Dict[str, Any]) -> None:
    adv["rev"] = int(adv.get("rev", 0)) + 1


def _feed(adv, text: str, now: int, kind: str = "info") -> None:
    adv["feed"] = (adv.get("feed", []) + [{"id": uuid.uuid4().hex[:8], "text": text, "kind": kind, "ms": now}])[-T["feed_keep"]:]


def _penalty(adv, key: str, reason: str, now: int) -> int:
    seconds = C.PENALTY_S[key]
    adv["clock"]["penalty"] += seconds * 1000
    adv.setdefault("pen", []).append({"id": uuid.uuid4().hex[:8], "key": key, "s": seconds, "reason": reason, "ms": now})
    _feed(adv, C.FEED["penalty"].format(s=seconds, reason=reason), now, "penalty")
    return seconds


def _name(adv, ctx, pid: Optional[str]) -> str:
    for p in roster(adv, ctx):
        if p["id"] == pid:
            return p["nickname"]
    return "Someone"


def roster(adv, ctx) -> List[Dict[str, Any]]:
    """Real players from the room plus TEST99 simulated players."""
    online = ctx.get("presence", {})
    people = [{"id": p["id"], "nickname": p["nickname"], "is_host": bool(p.get("is_host")), "sim": False,
               "online": bool(online.get(p["id"], ctx.get("assume_online", False)))}
              for p in ctx.get("players", [])]
    sims = [{"id": s["id"], "nickname": s["nickname"], "is_host": False, "sim": True, "online": True}
            for s in adv.get("sims", [])]
    return people + sims


def _order_key(adv, pid: str) -> int:
    return random.Random(f"{adv['seed']}:{pid}").randrange(1 << 30)


def assign(adv, ctx, exclude=(), prefer_non_host=True) -> str:
    people = [p for p in roster(adv, ctx) if p["id"] not in exclude]
    live = [p for p in people if p["online"]] or people
    if prefer_non_host:
        guests = [p for p in live if p["id"] != adv["host_id"]]
        live = guests or live
    if not live:
        # Never deadlock: fall back to the host even if alone or offline.
        return adv["host_id"]
    counts = adv.setdefault("counts", {})
    pick = min(live, key=lambda p: (counts.get(p["id"], 0), _order_key(adv, p["id"])))
    counts[pick["id"]] = counts.get(pick["id"], 0) + 1
    return pick["id"]


def can_act_for(adv, ctx, actor: str, assignee: Optional[str]) -> bool:
    if actor == assignee:
        return True
    # TEST99: the creator plays every simulated participant from one phone.
    if adv.get("test") and ctx.get("test_creator_id") == actor:
        sims = {s["id"] for s in adv.get("sims", [])}
        return assignee in sims
    return False


# ============================================================
# Clocks
# ============================================================

def clock_remaining(adv, now: int) -> int:
    c = adv["clock"]
    spent = c["spent"] + (now - c["since"] if c.get("since") else 0)
    return max(0, c["limit"] - spent - c["penalty"])


def journey_ms(adv, now: int) -> int:
    c = adv["clock"]
    return c["spent"] + (now - c["since"] if c.get("since") else 0)


def _clock_should_run(adv) -> bool:
    if adv["status"] != "playing" or adv.get("paused"):
        return False
    scene = adv.get("scene")
    if scene and (scene["kind"], scene["stage"]) in PAUSING_SCENES:
        return False
    return True


def _sync_clock(adv, now: int) -> None:
    c = adv["clock"]
    run = _clock_should_run(adv)
    if run and not c.get("since"):
        c["since"] = now
    elif not run and c.get("since"):
        c["spent"] += now - c["since"]
        c["since"] = None


def finale_elapsed(adv, now: int) -> int:
    f = adv.get("finale") or {}
    if not f:
        return 0
    return f["spent"] + (now - f["since"] if f.get("since") else 0)


def _sync_finale_clock(adv, now: int) -> None:
    f = adv.get("finale")
    if not f:
        return
    run = adv["status"] == "finale" and not adv.get("paused") and not f.get("choice")
    if run and not f.get("since"):
        f["since"] = now
    elif not run and f.get("since"):
        f["spent"] += now - f["since"]
        f["since"] = None


# ============================================================
# Runs
# ============================================================

def new_adventure(host_id: str, test: bool, now: int, lang: Optional[str] = "en") -> Dict[str, Any]:
    adv = {"v": 1, "status": "lobby", "test": bool(test), "host_id": host_id, "created_ms": now, "lang": "ar" if lang == "ar" else "en",
           "sims": [dict(s) for s in C.SIM_PLAYERS] if test else [], "rev": 0}
    _new_run_fields(adv, now)
    adv["status"] = "lobby"
    return adv


def _new_run_fields(adv, now: int, seed: Optional[int] = None, variant: Optional[str] = None) -> None:
    seed = seed or (secrets.randbelow(2_000_000_000) + 1)
    rng = random.Random(seed)
    variant = variant if variant in VARIANTS else rng.choice(VARIANTS)
    layout = get_layout(seed, variant)
    sx, sy, sdir = layout.spawn
    grid = [p["id"] for p in C.PERFUMES]
    rng.shuffle(grid)
    code = "".join(str(secrets.randbelow(10)) for _ in range(4))
    while len(set(code)) < 3 or code[0] == "0":
        code = "".join(str(secrets.randbelow(10)) for _ in range(4))
    adv.update({
        "run_id": uuid.uuid4().hex, "seed": seed, "variant": variant, "started_ms": None,
        "counts": {}, "nav_id": adv["host_id"], "nav_since": now,
        "pos": {"x": sx, "y": sy, "dir": sdir, "seq": 0, "ms": now},
        "clock": {"limit": T["journey_ms"], "spent": 0, "since": None, "penalty": 0},
        "intro": {"stage": "voice", "voice": {"status": "ready", "start_ms": None, "dur_ms": voice_duration(C.VOICE_NOTE["scripts"][variant])},
                  "zain_ms": None, "ready": []},
        "ev": {e: {"st": "pending"} for e in ALL_EVENTS},
        "queue": [], "phone": None, "scene": None,
        "otp": {"code": code, "receiver": None, "until": None, "attempts": T["otp_attempts"], "solved": False},
        "plan": {"after_otp": rng.choice([["sharifa_2", "zain_call"], ["zain_call", "sharifa_2"]])},
        "doors": [], "sharifa_n": 0, "finale": {"grid": grid}, "outcome": None,
        "feed": [], "pen": [], "paused": False, "gulf_state": "waiting", "talks": 0,
    })
    _bump(adv)


def start_intro(adv, now: int) -> None:
    if adv["status"] != "lobby":
        raise ActionError(409, "The hunt has already started")
    adv["status"] = "intro"
    _bump(adv)


def restart(adv, now: int, seed: Optional[int] = None, variant: Optional[str] = None) -> None:
    _new_run_fields(adv, now, seed, variant)
    adv["status"] = "intro"


# ============================================================
# Locks and derived state
# ============================================================

def movement_lock(adv) -> Optional[str]:
    if adv["status"] != "playing":
        return adv["status"]
    if adv.get("paused"):
        return "paused"
    scene = adv.get("scene")
    if scene:
        return scene["kind"]
    phone = adv.get("phone")
    if phone and phone.get("stage") == "missed":
        return "missed_call"
    if adv["ev"]["gulf"]["st"] == "queued":
        return "gulf"
    return None


def _gulf_tiles(adv) -> set:
    layout = layout_of(adv)
    return {tuple(t) for t in layout.gulf["tiles"]}


def walkable(adv, x: int, y: int) -> bool:
    layout = layout_of(adv)
    if adv.get("gulf_state") == "gone" and (x, y) in _gulf_tiles(adv):
        return layout.in_bounds(x, y) and layout.ground[y][x] in (1, 2, 3, 4)
    return layout.walkable(x, y)


def required_done(adv) -> bool:
    return all(adv["ev"][e]["st"] == "done" for e in C.REQUIRED_EVENTS)


# ============================================================
# Movement
# ============================================================

def handle_move(adv, pid: str, msg: Dict[str, Any], now: int) -> Tuple[bool, List[str]]:
    """Returns (accepted, triggers). Rejections leave state untouched."""
    if adv["status"] != "playing" or pid != adv.get("nav_id"):
        return False, []
    if msg.get("run") != adv["run_id"]:
        return False, []
    seq = int(msg.get("seq") or 0)
    pos = adv["pos"]
    if seq <= pos["seq"]:
        return False, []
    direction = msg.get("dir")
    if direction not in DIRS:
        return False, []
    if msg.get("type") == "adv_face":
        if movement_lock(adv):
            return False, []
        pos.update({"dir": direction, "seq": seq})
        return True, []
    if movement_lock(adv):
        return False, []
    x, y = int(msg.get("x", -1)), int(msg.get("y", -1))
    dx, dy = DIRS[direction]
    if (x, y) != (pos["x"] + dx, pos["y"] + dy):
        return False, []
    # Token-bucket pacing: "ms" is a virtual clock that advances one interval per step.
    # Steps bunched up by network jitter are accepted; a sustained fast rate is not.
    paced = max(now, pos.get("ms", 0) + T["min_step_interval_ms"])
    if paced - now > T["step_burst_ms"]:
        return False, []
    if not walkable(adv, x, y):
        return False, []
    pos.update({"x": x, "y": y, "dir": direction, "seq": seq, "ms": paced})
    triggers = []
    layout = layout_of(adv)
    if (x, y) in layout.zones["fountain"] and adv["ev"]["train"]["st"] == "pending":
        _queue(adv, "train")
        triggers.append("train")
    if (x, y) in layout.zones["gulf"] and adv["ev"]["gulf"]["st"] == "pending":
        _queue(adv, "gulf", front=True)
        triggers.append("gulf")
    if triggers:
        _bump(adv)
    return True, triggers


def _queue(adv, eid: str, front: bool = False) -> None:
    if adv["ev"][eid]["st"] != "pending":
        return
    adv["ev"][eid]["st"] = "queued"
    if front:
        adv["queue"].insert(0, eid)
    else:
        adv["queue"].append(eid)


# ============================================================
# Event starters
# ============================================================

def _start_call(adv, ctx, eid: str, caller: str, now: int, exclude=()) -> None:
    assignee = assign(adv, ctx, exclude=exclude)
    adv["phone"] = {"kind": "call", "eid": eid, "inst": uuid.uuid4().hex[:10], "caller": caller,
                    "assignee": assignee, "stage": "ringing", "until": now + T["ring_ms"], "line": None, "since": now}
    adv["ev"].setdefault(eid, {"st": "pending"})["st"] = "active"


def _start_otp(adv, ctx, now: int) -> None:
    otp = adv["otp"]
    receiver = ctx.get("test_creator_id") if adv.get("test") and ctx.get("test_creator_id") else assign(adv, ctx)
    otp.update({"receiver": receiver, "until": now + T["otp_visible_ms"]})
    adv["phone"] = {"kind": "otp", "eid": "otp", "inst": uuid.uuid4().hex[:10], "receiver": receiver,
                    "stage": "arrived", "until": now + T["otp_notice_ms"], "since": now}
    adv["ev"]["otp"]["st"] = "active"


def _start_train(adv, ctx, now: int) -> None:
    assignee = assign(adv, ctx)
    adv["phone"] = {"kind": "text", "eid": "train", "inst": uuid.uuid4().hex[:10], "assignee": assignee,
                    "stage": "asking", "until": now + T["train_answer_ms"], "answer": None, "since": now}
    adv["ev"]["train"]["st"] = "active"


def _start_gulf(adv, ctx, now: int) -> None:
    assignee = assign(adv, ctx)
    adv["scene"] = {"kind": "gulf", "inst": uuid.uuid4().hex[:10], "assignee": assignee, "stage": "greet",
                    "until": now + T["gulf_greet_ms"], "attempts": T["gulf_attempts"], "line": C.GULF["greet"], "since": now}
    adv["ev"]["gulf"]["st"] = "active"
    adv["gulf_state"] = "active"


def _start_next(adv, ctx, now: int) -> bool:
    """Start the first queued item whose slot is free."""
    for eid in list(adv["queue"]):
        if eid == "gulf":
            if adv.get("phone") or adv.get("scene"):
                continue
            adv["queue"].remove(eid)
            _start_gulf(adv, ctx, now)
            return True
        if adv.get("phone") or (adv.get("scene") and adv["scene"]["kind"] in ("gulf", "shop")):
            continue
        # Phone events wait while the Gulf encounter is queued; it has priority.
        if "gulf" in adv["queue"]:
            continue
        adv["queue"].remove(eid)
        if eid in SHARIFA_EVENTS or eid.startswith("sharifa_dev"):
            _start_call(adv, ctx, eid, "sharifa", now)
        elif eid == "zain_call":
            exclude = [adv["otp"]["receiver"]] if adv["otp"].get("receiver") else []
            _start_call(adv, ctx, eid, "zain", now, exclude=exclude)
        elif eid == "otp":
            _start_otp(adv, ctx, now)
        elif eid == "train":
            _start_train(adv, ctx, now)
        return True
    return False


def _finish_event(adv, eid: str, ok: Optional[bool], now: int) -> None:
    ev = adv["ev"].setdefault(eid, {"st": "pending"})
    ev.update({"st": "done", "ok": ok, "at": now})


# ============================================================
# Ticks (server timer)
# ============================================================

def tick(adv, ctx, now: int) -> bool:
    before = adv.get("rev", 0)
    status = adv["status"]
    if status == "intro":
        _tick_intro(adv, now)
    elif status == "playing":
        _tick_playing(adv, ctx, now)
    elif status == "finale":
        _tick_finale(adv, ctx, now)
    if status in ("intro", "playing", "finale"):
        _tick_presence(adv, ctx, now)
    return adv.get("rev", 0) != before


def _tick_intro(adv, now: int) -> None:
    intro = adv["intro"]
    voice = intro["voice"]
    if voice["status"] == "playing" and now >= voice["start_ms"] + voice["dur_ms"]:
        voice["status"] = "done"
        intro["stage"] = "zain"
        intro["zain_ms"] = now
        _bump(adv)


def _tick_playing(adv, ctx, now: int) -> None:
    _sync_clock(adv, now)
    if adv.get("paused"):
        return
    if clock_remaining(adv, now) <= 0:
        finish(adv, ctx, "lose_journey_timeout", now)
        return
    j = journey_ms(adv, now)
    ev = adv["ev"]
    s = C.SCHEDULE
    changed = False

    def due(eid, cond):
        nonlocal changed
        if ev[eid]["st"] == "pending" and cond:
            _queue(adv, eid)
            changed = True

    due("sharifa_1", j >= s["sharifa_1"])
    due("otp", j >= s["otp"])
    first, second = adv["plan"]["after_otp"]
    otp_at = ev["otp"].get("at")
    due(first, ev["otp"]["st"] == "done" and otp_at is not None and now >= otp_at + s["after_otp_gap_ms"])
    first_at = ev[first].get("at")
    gap = s["after_call_gap_ms"] if first == "sharifa_2" else 15_000
    due(second, ev[first]["st"] == "done" and first_at is not None and now >= first_at + gap)
    due("train", j >= s["train_fallback"])
    gulf_at = ev["gulf"].get("at")
    due("sharifa_3", ev["gulf"]["st"] == "done" and gulf_at is not None and now >= gulf_at + s["sharifa_after_gulf_ms"])
    due("sharifa_4", j >= s["sharifa_late"])

    changed |= _tick_phone(adv, ctx, now)
    changed |= _tick_scene(adv, ctx, now)
    if adv["status"] != "playing":
        # The shop cutscene just handed over to the counter: everyone must hear about it now.
        _bump(adv)
        return
    # Standing at the right door too early: bring the next story beat forward
    # instead of making everyone wait for the schedule.
    if not required_done(adv) and not adv["queue"] and not adv.get("phone") and not adv.get("scene") and at_destination(adv):
        if _fire_pending_required(adv):
            changed = True
    while _start_next(adv, ctx, now):
        changed = True
    _sync_clock(adv, now)
    if changed:
        _bump(adv)


def _end_phone(adv, now: int, ok: Optional[bool]) -> None:
    phone = adv["phone"]
    adv["phone"] = None
    if phone:
        _finish_event(adv, phone["eid"], ok, now)


def _tick_phone(adv, ctx, now: int) -> bool:
    phone = adv.get("phone")
    if not phone or not phone.get("until") or now < phone["until"]:
        return False
    kind, stage = phone["kind"], phone["stage"]
    if kind == "otp":
        _end_phone(adv, now, True)
    elif kind == "call" and phone["caller"] == "sharifa":
        if stage == "ringing":
            _feed(adv, C.SHARIFA["missed"], now)
            _end_phone(adv, now, True)
        else:
            _end_phone(adv, now, stage != "talking")
    elif kind == "call" and phone["caller"] == "zain":
        if stage == "ringing":
            _zain_missed(adv, ctx, now)
        elif stage == "otp_entry":
            phone.update({"stage": "hangup", "line": C.ZAIN_CALL["timeout"], "until": now + T["zain_line_ms"]})
            _penalty(adv, "otp_failed", "Zain gave up on the code", now)
        elif stage == "missed":
            # Anyone may call back now; keep waiting, never soft-lock.
            phone["open"] = True
            phone["until"] = None
        elif stage in ("success", "failed", "hangup", "wrong"):
            if stage == "wrong":
                phone.update({"stage": "otp_entry", "line": None, "until": now + T["otp_entry_ms"]})
            else:
                adv["otp"]["solved"] = stage == "success"
                _end_phone(adv, now, stage == "success")
    elif kind == "text":
        if stage == "asking":
            _train_wrong(adv, now, None)
        elif stage == "confirm":
            phone.update({"stage": "typing", "until": now + T["train_typing_ms"]})
        elif stage == "typing":
            # Shoug's text lands first, Zain types, then her reply: never two bubbles at once.
            if phone.get("ok"):
                phone.update({"stage": "correct", "line": C.TRAIN["zain_correct"], "until": now + T["train_reply_ms"]})
            else:
                phone.update({"stage": "angry", "line": C.TRAIN["zain_wrong"], "until": now + T["train_reply_ms"]})
                _penalty(adv, "train_wrong", "Wrong train time", now)
        elif stage in ("angry", "correct"):
            _end_phone(adv, now, stage == "correct")
    return True


def _zain_missed(adv, ctx, now: int) -> None:
    phone = adv["phone"]
    phone.update({"stage": "missed", "line": C.ZAIN_CALL["missed"], "until": now + T["missed_call_open_ms"], "open": False})
    _penalty(adv, "zain_missed", "Zain got declined", now)


def _train_wrong(adv, now: int, answer: Optional[str]) -> None:
    phone = adv["phone"]
    text = C.TRAIN["shoug_wrong"].format(answer=answer) if answer else C.TRAIN["shoug_timeout"]
    phone.update({"stage": "confirm", "answer": answer, "shoug": text, "until": now + T["train_confirm_ms"]})


def _tick_scene(adv, ctx, now: int) -> bool:
    scene = adv.get("scene")
    if not scene or not scene.get("until") or now < scene["until"]:
        return False
    kind, stage = scene["kind"], scene["stage"]
    if kind == "gulf":
        if stage == "greet":
            scene.update({"stage": "inspect", "line": C.GULF["ask"], "until": now + T["gulf_inspect_ms"]})
        elif stage == "inspect":
            _penalty(adv, "price_reveal", "Shoug had to read it herself", now)
            scene.update({"stage": "react", "line": C.GULF["react"], "reveal": C.GULF["reveal"], "until": now + T["gulf_react_ms"]})
        elif stage == "wrong":
            scene.update({"stage": "inspect", "line": C.GULF["ask"], "until": now + T["gulf_inspect_ms"]})
        elif stage == "react":
            scene.update({"stage": "leave", "line": C.GULF["leave"], "until": now + T["gulf_leave_ms"]})
        elif stage == "leave":
            adv["scene"] = None
            adv["gulf_state"] = "gone"
            _finish_event(adv, "gulf", scene.get("ok", True), now)
    elif kind in ("door", "door_locked"):
        adv["scene"] = None
    elif kind == "shop":
        adv["scene"] = None
        start_finale(adv, ctx, now)
    return True


def _tick_finale(adv, ctx, now: int) -> None:
    _sync_finale_clock(adv, now)
    f = adv["finale"]
    if adv.get("paused") or f.get("choice"):
        return
    e = finale_elapsed(adv, now)
    grabbed = sorted(h["id"] for h in f["hands"] if h.get("grab") is not None and h["grab"] <= e)
    if grabbed != f.get("grabbed", []):
        new = len(grabbed) - len(f.get("grabbed", []))
        f["grabbed"] = grabbed
        for _ in range(max(0, new)):
            _feed(adv, C.FEED["hand_grab"], now, "hand")
        _bump(adv)
    if e >= f["dur"]:
        finish(adv, ctx, "lose_finale_timeout", now)


def _tick_presence(adv, ctx, now: int) -> None:
    people = roster(adv, ctx)
    online = {p["id"] for p in people if p["online"]}
    last_seen = ctx.get("last_seen", {})
    grace = T["reassign_after_ms"]

    def gone(pid):
        if not pid or pid in online:
            return False
        if any(p["id"] == pid and p["sim"] for p in people):
            return False
        seen = last_seen.get(pid)
        return seen is None or now - seen >= grace

    # Navigator: the host whenever connected, otherwise the earliest connected player.
    nav = adv.get("nav_id")
    host = adv["host_id"]
    desired = nav
    if host in online:
        desired = host
    elif gone(nav):
        candidates = [p for p in people if p["online"] and not p["sim"]]
        if candidates:
            desired = candidates[0]["id"]
    if desired != nav:
        adv["nav_id"] = desired
        adv["nav_since"] = now
        _feed(adv, C.FEED["navigator"].format(name=_name(adv, ctx, desired)), now)
        _bump(adv)

    for slot in ("phone", "scene", "finale"):
        holder = adv.get(slot)
        if not holder or (slot == "finale" and adv["status"] != "finale"):
            continue
        key = "receiver" if holder.get("kind") == "otp" else "assignee"
        pid = holder.get(key)
        if holder.get("kind") == "otp" or not gone(pid):
            continue
        exclude = [pid]
        if holder.get("eid") == "zain_call" and adv["otp"].get("receiver"):
            exclude.append(adv["otp"]["receiver"])
        new = assign(adv, ctx, exclude=exclude)
        if new != pid:
            holder[key] = new
            _feed(adv, C.FEED["reassigned"].format(old=_name(adv, ctx, pid), new=_name(adv, ctx, new)), now)
            _bump(adv)


# ============================================================
# Player actions
# ============================================================

def act(adv, ctx, actor: str, action: str, payload: Dict[str, Any], now: int) -> Dict[str, Any]:
    """Apply one player action. Returns a result dict; raises ActionError."""
    handler = ACTIONS.get(action)
    if not handler:
        raise ActionError(400, "Unknown action")
    inst = payload.get("inst")
    result = handler(adv, ctx, actor, payload, now, inst) or {}
    if adv["status"] == "playing":
        while _start_next(adv, ctx, now):
            pass
        _sync_clock(adv, now)
    elif adv["status"] == "finale":
        _sync_finale_clock(adv, now)
    _bump(adv)
    return result


def _require_phone(adv, kind: str, inst: Optional[str], stages) -> Dict[str, Any]:
    phone = adv.get("phone")
    if not phone or phone["kind"] != kind or (inst and phone["inst"] != inst) or phone["stage"] not in stages:
        raise ActionError(409, "That moment has passed")
    return phone


def _require_assignee(adv, ctx, actor: str, holder: Dict[str, Any], key: str = "assignee") -> None:
    if not can_act_for(adv, ctx, actor, holder.get(key)):
        raise ActionError(403, f"This one is for {_name(adv, ctx, holder.get(key))}")


def _a_voice_play(adv, ctx, actor, p, now, inst):
    if adv["status"] != "intro":
        raise ActionError(409, "The voice note is gone")
    voice = adv["intro"]["voice"]
    if voice["status"] != "ready":
        raise ActionError(409, "This voice note can only be played once")
    voice.update({"status": "playing", "start_ms": now})
    return {}


def _a_voice_skip(adv, ctx, actor, p, now, inst):
    """Move on without waiting for the whole voice note: the transcript stays on screen."""
    if adv["status"] != "intro":
        raise ActionError(409, "Already started")
    intro = adv["intro"]
    if intro["stage"] != "voice":
        return {}
    intro["voice"]["status"] = "done"
    intro["stage"] = "zain"
    intro["zain_ms"] = now
    return {}


def _a_ready(adv, ctx, actor, p, now, inst):
    if adv["status"] != "intro":
        raise ActionError(409, "Already started")
    if actor not in adv["intro"]["ready"]:
        adv["intro"]["ready"].append(actor)
    return {}


def _a_begin(adv, ctx, actor, p, now, inst):
    if adv["status"] != "intro":
        raise ActionError(409, "Already started")
    if actor != adv["host_id"] and not (adv.get("test") and actor == ctx.get("test_creator_id")):
        raise ActionError(403, "The host starts the hunt")
    if adv["intro"]["voice"]["status"] != "done":
        raise ActionError(409, "Listen to Shaheen's voice note first")
    _begin_playing(adv, now)
    return {}


def _begin_playing(adv, now: int) -> None:
    adv["status"] = "playing"
    adv["started_ms"] = now
    adv["intro"]["stage"] = "done"
    adv["intro"]["voice"]["status"] = "done"
    # Allow the very first step immediately (the step-rate guard measures from here).
    adv["pos"]["ms"] = now - 1_000
    _sync_clock(adv, now)


def _a_answer(adv, ctx, actor, p, now, inst):
    phone = _require_phone(adv, "call", inst, ("ringing",))
    _require_assignee(adv, ctx, actor, phone)
    if phone["caller"] == "sharifa":
        n = adv["sharifa_n"]
        adv["sharifa_n"] = n + 1
        line = C.SHARIFA["answered"][min(n, len(C.SHARIFA["answered"]) - 1)]
        phone.update({"stage": "talking", "line": line, "until": now + T["sharifa_talk_ms"]})
        _penalty(adv, "sharifa_answer", f"{_name(adv, ctx, phone['assignee'])} answered Sharifa", now)
    else:
        phone.update({"stage": "otp_entry", "line": C.ZAIN_CALL["answered"], "until": now + T["otp_entry_ms"]})
    return {}


def _a_decline(adv, ctx, actor, p, now, inst):
    phone = _require_phone(adv, "call", inst, ("ringing",))
    _require_assignee(adv, ctx, actor, phone)
    if phone["caller"] == "sharifa":
        n = adv["sharifa_n"]
        adv["sharifa_n"] = n + 1
        _feed(adv, C.SHARIFA["declined"][min(n, len(C.SHARIFA["declined"]) - 1)], now, "sharifa")
        _end_phone(adv, now, True)
    else:
        _zain_missed(adv, ctx, now)
    return {}


def _a_call_back(adv, ctx, actor, p, now, inst):
    phone = _require_phone(adv, "call", inst, ("missed",))
    in_room = any(x["id"] == actor for x in roster(adv, ctx))
    if not (can_act_for(adv, ctx, actor, phone["assignee"]) or (phone.get("open") and in_room)):
        raise ActionError(403, f"{_name(adv, ctx, phone['assignee'])} has to call Zain back")
    if phone.get("open") and actor != phone["assignee"] and not can_act_for(adv, ctx, actor, phone["assignee"]):
        phone["assignee"] = actor
    phone.update({"stage": "otp_entry", "line": C.ZAIN_CALL["callback"], "until": now + T["otp_entry_ms"], "open": False})
    return {}


def _a_otp(adv, ctx, actor, p, now, inst):
    phone = _require_phone(adv, "call", inst, ("otp_entry",))
    if phone["caller"] != "zain":
        raise ActionError(409, "That moment has passed")
    _require_assignee(adv, ctx, actor, phone)
    value = "".join(ch for ch in str(p.get("value", "")) if ch.isdigit())
    if len(value) != 4:
        raise ActionError(400, "Enter all four digits")
    otp = adv["otp"]
    if value == otp["code"]:
        phone.update({"stage": "success", "line": C.ZAIN_CALL["correct"], "until": now + T["zain_line_ms"]})
        return {"correct": True}
    otp["attempts"] -= 1
    _penalty(adv, "otp_wrong", "Wrong code for Zain", now)
    if otp["attempts"] <= 0:
        phone.update({"stage": "failed", "line": C.ZAIN_CALL["failed"], "until": now + T["zain_line_ms"]})
        _penalty(adv, "otp_failed", "Zain lost the tickets", now)
    else:
        phone.update({"stage": "wrong", "line": C.ZAIN_CALL["wrong"], "until": now + 1_600, "attempts_left": otp["attempts"]})
    return {"correct": False, "attempts_left": max(0, otp["attempts"])}


def _a_train(adv, ctx, actor, p, now, inst):
    phone = _require_phone(adv, "text", inst, ("asking",))
    _require_assignee(adv, ctx, actor, phone)
    answer = str(p.get("value", ""))
    if answer not in C.TRAIN["options"]:
        raise ActionError(400, "Pick one of the times")
    if answer == C.TRAIN["correct"]:
        phone.update({"stage": "confirm", "ok": True, "answer": answer, "shoug": C.TRAIN["shoug_correct"],
                      "until": now + T["train_confirm_ms"]})
        return {"correct": True}
    _train_wrong(adv, now, answer)
    return {"correct": False}


def _a_price(adv, ctx, actor, p, now, inst):
    scene = adv.get("scene")
    if not scene or scene["kind"] != "gulf" or scene["stage"] != "inspect" or (inst and scene["inst"] != inst):
        raise ActionError(409, "That moment has passed")
    _require_assignee(adv, ctx, actor, scene)
    value = "".join(ch for ch in str(p.get("value", "")) if ch.isdigit())
    if not value:
        raise ActionError(400, "Type the price")
    if value == C.GULF["screenshot"]["answer"]:
        scene.update({"stage": "react", "line": C.GULF["react"], "reveal": None, "until": now + T["gulf_react_ms"], "ok": True})
        return {"correct": True}
    scene["attempts"] -= 1
    _penalty(adv, "price_wrong", "Misread the price", now)
    if scene["attempts"] <= 0:
        scene.update({"stage": "react", "line": C.GULF["react"], "reveal": C.GULF["reveal"], "until": now + T["gulf_react_ms"], "ok": False})
    else:
        scene.update({"stage": "wrong", "line": C.GULF["wrong"], "until": now + T["gulf_wrong_ms"]})
    return {"correct": False}


def _a_interact(adv, ctx, actor, p, now, inst):
    if adv["status"] != "playing":
        raise ActionError(409, "Not now")
    if actor != adv.get("nav_id"):
        raise ActionError(403, "Only the navigator opens doors")
    if movement_lock(adv):
        raise ActionError(409, "Hold on a second")
    layout = layout_of(adv)
    pos = adv["pos"]
    npc_line = _npc_line(adv, layout, pos)
    if npc_line:
        _feed(adv, npc_line, now, "npc")
        return {"talk": npc_line}
    door = layout.door_at_front(pos["x"], pos["y"]) if pos["dir"] == "up" else None
    if not door:
        raise ActionError(409, "Face a door or a person first")
    if door["correct"]:
        if required_done(adv):
            adv["scene"] = {"kind": "shop", "stage": "show", "inst": uuid.uuid4().hex[:10], "until": now + T["shop_cutscene_ms"],
                            "lines": C.SHOP["lines"], "title": C.SHOP["title"], "subtitle": C.SHOP["subtitle"], "since": now}
            adv["queue"] = [e for e in adv["queue"] if not e.startswith("sharifa")]
            return {"door": "open"}
        adv["scene"] = {"kind": "door_locked", "stage": "show", "inst": uuid.uuid4().hex[:10], "line": C.DOOR_LINES["locked"],
                        "door": door["id"], "until": now + T["door_scene_ms"], "since": now}
        _fire_pending_required(adv)
        return {"door": "locked"}
    first_time = door["id"] not in adv["doors"]
    line = C.DOOR_LINES.get(door["style"]) or C.DOOR_LINES["generic"][sum(map(ord, door["id"])) % len(C.DOOR_LINES["generic"])]
    if not first_time:
        line = C.DOOR_LINES["repeat"]
    adv["scene"] = {"kind": "door", "stage": "show", "inst": uuid.uuid4().hex[:10], "line": line, "door": door["id"],
                    "sign": door["sign"], "until": now + T["door_scene_ms"], "since": now, "first": first_time}
    if first_time:
        adv["doors"].append(door["id"])
        _penalty(adv, "wrong_door", "Wrong shop", now)
    return {"door": "wrong"}


NPC_LINES = {
    "busker": "The busker plays a very dramatic violin version of a love song.",
    "shopkeeper": "\"Welcome to Bicester Village, love! Bargains everywhere.\"",
    "bench_sitter": "\"Lovely evening for it. Mind the shoppers, they're vicious near the perfume.\"",
}


def _npc_line(adv, layout, pos) -> Optional[str]:
    dx, dy = DIRS.get(pos.get("dir"), (0, -1))
    tx, ty = pos["x"] + dx, pos["y"] + dy
    for npc in layout.npcs:
        if (npc["x"], npc["y"]) == (tx, ty):
            return NPC_LINES.get(npc["id"])
    return None


def _fire_pending_required(adv) -> bool:
    """At the right door too early: pull the next story beat forward."""
    ev = adv["ev"]
    for eid in ("otp", "zain_call", "train"):
        if ev[eid]["st"] == "pending":
            if eid == "zain_call" and ev["otp"]["st"] != "done":
                continue
            _queue(adv, eid)
            adv["queue"].remove(eid)
            adv["queue"].insert(0, eid)
            return True
    return False


def at_destination(adv) -> bool:
    layout = layout_of(adv)
    pos = adv["pos"]
    return (pos["x"], pos["y"]) in layout.door_index[layout.destination_id]["front"]


def _a_choose(adv, ctx, actor, p, now, inst):
    if adv["status"] != "finale":
        raise ActionError(409, "Not at the counter")
    f = adv["finale"]
    _require_assignee(adv, ctx, actor, f)
    if f.get("choice"):
        raise ActionError(409, "The choice is already made")
    bottle = p.get("value")
    if bottle not in PERFUMES:
        raise ActionError(400, "Pick a bottle")
    e = finale_elapsed(adv, now)
    if bottle_taken(f, bottle, e):
        raise ActionError(409, C.FEED["taken_choice"])
    f["choice"] = bottle
    f["choice_ms"] = e
    f["chooser"] = f["assignee"]
    primary_gone = bottle_taken(f, PRIMARY, e)
    if bottle == PRIMARY:
        finish(adv, ctx, "win_primary", now)
    elif bottle == FALLBACK:
        finish(adv, ctx, "win_fallback" if primary_gone else "lose_fallback_early", now)
    else:
        finish(adv, ctx, "lose_decoy", now, decoy=bottle)
    return {"result": adv["outcome"]["result"]}


def _a_restart(adv, ctx, actor, p, now, inst):
    if actor != adv["host_id"] and not (adv.get("test") and actor == ctx.get("test_creator_id")):
        raise ActionError(403, "Only the host can restart")
    if adv["status"] not in ("ended",) and not adv.get("test"):
        raise ActionError(409, "Finish this hunt first")
    restart(adv, now)
    return {}


ACTIONS = {
    "voice_play": _a_voice_play, "voice_skip": _a_voice_skip, "ready": _a_ready, "begin": _a_begin,
    "answer": _a_answer, "decline": _a_decline, "call_back": _a_call_back, "otp": _a_otp,
    "train": _a_train, "price": _a_price, "interact": _a_interact, "choose": _a_choose, "restart": _a_restart,
}


# ============================================================
# Finale and outcomes
# ============================================================

def bottle_taken(f: Dict[str, Any], bottle: str, e: int) -> bool:
    if f.get("choice") == bottle:
        return False
    return any(h["target"] == bottle and h.get("grab") is not None and h["grab"] <= e for h in f.get("hands", []))


def _hand_side(slot: int) -> str:
    row, col = divmod(slot, 3)
    if col == 0:
        return "left"
    if col == 2:
        return "right"
    return "top" if row < 2 else "bottom"


def start_finale(adv, ctx, now: int) -> None:
    adv["status"] = "finale"
    adv["scene"] = None
    adv["phone"] = None
    adv["queue"] = []
    _sync_clock(adv, now)
    grid = adv["finale"]["grid"]
    hands = []
    jitter = random.Random(adv["seed"] + 77)
    for h in C.HANDS:
        hand = dict(h)
        hand["slot"] = grid.index(h["target"])
        hand["from"] = _hand_side(hand["slot"])
        shift = jitter.randrange(-400, 401)
        for key in ("enter", "grab", "retreat"):
            if key in hand:
                hand[key] = max(800, hand[key] + shift)
        hands.append(hand)
    adv["finale"] = {"grid": grid, "hands": hands, "dur": T["finale_ms"], "spent": 0, "since": now,
                     "assignee": assign(adv, ctx), "choice": None, "grabbed": []}
    _bump(adv)


def finish(adv, ctx, code: str, now: int, decoy: Optional[str] = None) -> None:
    _sync_clock(adv, now)
    if adv["status"] == "finale":
        _sync_finale_clock(adv, now)
    base = dict(C.OUTCOMES["lose_decoy" if code == "lose_decoy" else code])
    if code == "lose_decoy":
        base["body"] = PERFUMES[decoy]["why"]
    remaining = clock_remaining(adv, now)
    adv["outcome"] = {
        "result": "win" if code.startswith("win") else "lose", "code": code, "title": base["title"], "body": base["body"],
        "shaheen": base.get("shaheen"), "choice": (adv.get("finale") or {}).get("choice"),
        "choice_name": PERFUMES.get((adv.get("finale") or {}).get("choice") or "", {}).get("name"),
        "chooser": (adv.get("finale") or {}).get("chooser"),
        "stats": {"remaining_ms": remaining, "penalty_s": sum(p["s"] for p in adv.get("pen", [])), "penalties": adv.get("pen", [])[-12:],
                  "doors": len(adv.get("doors", []))},
    }
    adv["status"] = "ended"
    adv["phone"] = None
    adv["scene"] = None
    adv["queue"] = []
    c = adv["clock"]
    if c.get("since"):
        c["spent"] += now - c["since"]
        c["since"] = None
    _bump(adv)


# ============================================================
# Test99 developer controls
# ============================================================

def dev(adv, ctx, command: str, payload: Dict[str, Any], now: int) -> Dict[str, Any]:
    if not adv.get("test"):
        raise ActionError(403, "TEST99 only")
    layout = layout_of(adv)
    out: Dict[str, Any] = {}
    if command == "restart":
        restart(adv, now, seed=payload.get("seed"), variant=payload.get("variant"))
        return _dev_done(adv, now, out)
    if command == "skip_intro":
        if adv["status"] in ("lobby", "intro"):
            _begin_playing(adv, now)
        return _dev_done(adv, now, out)
    if command == "show_otp":
        out["otp"] = {"code": adv["otp"]["code"], "receiver": adv["otp"].get("receiver"), "attempts": adv["otp"]["attempts"],
                      "solved": adv["otp"]["solved"]}
        return out
    if command in ("pause", "resume"):
        adv["paused"] = command == "pause"
        _sync_clock(adv, now)
        _sync_finale_clock(adv, now)
        return _dev_done(adv, now, out)
    if command == "reset_timer":
        c = adv["clock"]
        c.update({"spent": 0, "penalty": 0, "since": None})
        adv["pen"] = []
        _sync_clock(adv, now)
        return _dev_done(adv, now, out)
    if command in ("force_win", "force_lose"):
        code = payload.get("code") or ("win_primary" if command == "force_win" else "lose_journey_timeout")
        if code not in C.OUTCOMES and code != "lose_decoy":
            raise ActionError(400, "Unknown ending")
        if adv["status"] in ("lobby", "intro"):
            _begin_playing(adv, now)
        decoy = payload.get("decoy") or "cerf_des_bois"
        finish(adv, ctx, code, now, decoy=decoy if code == "lose_decoy" else None)
        return out
    # Everything below needs the hunt running.
    if adv["status"] in ("lobby", "intro"):
        _begin_playing(adv, now)
    if adv["status"] == "ended":
        restart(adv, now)
        _begin_playing(adv, now)
    if command == "teleport":
        x, y = int(payload.get("x", -1)), int(payload.get("y", -1))
        if not walkable(adv, x, y):
            raise ActionError(400, "Not walkable")
        _teleport(adv, x, y, payload.get("dir", "up"), now)
    elif command == "teleport_shop":
        if adv["status"] == "finale":
            raise ActionError(409, "Already at the counter")
        dest = layout.door_index[layout.destination_id]
        fx, fy = sorted(dest["front"])[0]
        _teleport(adv, fx, fy, "up", now)
    elif command == "sharifa":
        n = sum(1 for e in adv["ev"] if e.startswith("sharifa_dev"))
        eid = f"sharifa_dev{n + 1}"
        adv["ev"][eid] = {"st": "pending"}
        _queue(adv, eid)
        adv["queue"].remove(eid)
        adv["queue"].insert(0, eid)
        _clear_phone_for_dev(adv, now)
    elif command == "otp":
        _clear_phone_for_dev(adv, now)
        adv["ev"]["otp"] = {"st": "pending"}
        _queue(adv, "otp")
        adv["queue"].remove("otp")
        adv["queue"].insert(0, "otp")
    elif command == "reset_otp":
        _clear_phone_for_dev(adv, now)
        code = "".join(str(secrets.randbelow(10)) for _ in range(4))
        while len(set(code)) < 3 or code[0] == "0" or code == adv["otp"]["code"]:
            code = "".join(str(secrets.randbelow(10)) for _ in range(4))
        adv["otp"].update({"code": code, "attempts": T["otp_attempts"], "solved": False, "receiver": None, "until": None})
        adv["ev"]["otp"] = {"st": "pending"}
        adv["ev"]["zain_call"] = {"st": "pending"}
        _queue(adv, "otp")
        adv["queue"].remove("otp")
        adv["queue"].insert(0, "otp")
    elif command == "zain":
        _clear_phone_for_dev(adv, now)
        if adv["ev"]["otp"]["st"] != "done":
            # Skipping straight to Zain still lands the code in the tester's phone.
            adv["otp"]["receiver"] = ctx.get("test_creator_id")
            adv["otp"]["until"] = now
            _finish_event(adv, "otp", True, now)
        adv["otp"].update({"attempts": T["otp_attempts"], "solved": False})
        adv["ev"]["zain_call"] = {"st": "pending"}
        _queue(adv, "zain_call")
        adv["queue"].remove("zain_call")
        adv["queue"].insert(0, "zain_call")
    elif command == "train":
        _clear_phone_for_dev(adv, now)
        adv["ev"]["train"] = {"st": "pending"}
        _queue(adv, "train")
        adv["queue"].remove("train")
        adv["queue"].insert(0, "train")
    elif command == "gulf":
        _clear_phone_for_dev(adv, now)
        adv["scene"] = None
        adv["gulf_state"] = "waiting"
        adv["ev"]["gulf"] = {"st": "pending"}
        wx, wy = layout.gulf["woman"]["x"], layout.gulf["woman"]["y"]
        _teleport(adv, wx, wy + 2, "up", now)
        _queue(adv, "gulf", front=True)
    elif command == "complete_story":
        for eid in C.REQUIRED_EVENTS:
            if adv["ev"][eid]["st"] != "done":
                _finish_event(adv, eid, True, now)
        adv["queue"] = [e for e in adv["queue"] if e not in C.REQUIRED_EVENTS]
        if adv.get("phone") and adv["phone"]["eid"] in C.REQUIRED_EVENTS:
            adv["phone"] = None
        if adv.get("scene") and adv["scene"]["kind"] == "gulf":
            adv["scene"] = None
        adv["gulf_state"] = "gone"
    elif command == "finale":
        if adv["status"] != "finale":
            for eid in C.REQUIRED_EVENTS:
                if adv["ev"][eid]["st"] != "done":
                    _finish_event(adv, eid, True, now)
            adv["gulf_state"] = "gone"
            start_finale(adv, ctx, now)
    else:
        raise ActionError(400, "Unknown test control")
    return _dev_done(adv, now, out, ctx)


def _clear_phone_for_dev(adv, now: int) -> None:
    phone = adv.get("phone")
    if phone:
        eid = phone["eid"]
        adv["phone"] = None
        adv["ev"][eid] = {"st": "pending"} if eid in ("zain_call", "otp", "train") else {"st": "done", "ok": True, "at": now}


def _teleport(adv, x: int, y: int, direction: str, now: int) -> None:
    pos = adv["pos"]
    pos.update({"x": x, "y": y, "dir": direction if direction in DIRS else "up", "seq": pos["seq"] + 1000, "ms": now - 1_000})
    adv["teleport_seq"] = pos["seq"]


def _dev_done(adv, now: int, out: Dict[str, Any], ctx=None) -> Dict[str, Any]:
    if ctx is not None and adv["status"] == "playing":
        while _start_next(adv, ctx, now):
            pass
    _sync_clock(adv, now)
    _sync_finale_clock(adv, now)
    _bump(adv)
    return out


# ============================================================
# Views
# ============================================================

def _public_phone(adv, ctx, now: int) -> Optional[Dict[str, Any]]:
    phone = adv.get("phone")
    if not phone:
        return None
    view = {k: v for k, v in phone.items() if k not in ("code",)}
    if phone["kind"] == "otp":
        view["receiver_name"] = _name(adv, ctx, phone["receiver"])
        view["reveal_until"] = adv["otp"].get("until")
    else:
        view["assignee_name"] = _name(adv, ctx, phone.get("assignee"))
    if phone["kind"] == "text":
        view["question"] = C.TRAIN["question"]
        view["options"] = C.TRAIN["options"]
    if phone["kind"] == "call" and phone["caller"] == "zain":
        view["attempts_left"] = adv["otp"]["attempts"]
    return view


def _public_scene(adv, ctx, now: int) -> Optional[Dict[str, Any]]:
    scene = adv.get("scene")
    if not scene:
        return None
    view = dict(scene)
    if scene["kind"] == "gulf":
        view["assignee_name"] = _name(adv, ctx, scene["assignee"])
        view["screenshot"] = {k: v for k, v in C.GULF["screenshot"].items() if k != "answer"}
        view["son_line"] = C.GULF["son"]
    return view


def public_view(adv, ctx, now: int) -> Dict[str, Any]:
    layout = layout_of(adv)
    intro = adv["intro"]
    voice = intro["voice"]
    voice_view = {"status": voice["status"], "start_ms": voice["start_ms"], "dur_ms": voice["dur_ms"], "from": C.VOICE_NOTE["from"]}
    if adv["status"] != "lobby":
        # The full transcript shows as one block the moment the voice note appears,
        # and stays in Shoug's phone for the rest of the hunt. The audio still plays once.
        voice_view["script"] = C.VOICE_NOTE["scripts"][adv["variant"]]
        voice_view["audio"] = C.VOICE_NOTE["audio"].get(adv["variant"])
    intro_view = {"stage": intro["stage"], "voice": voice_view, "ready": list(intro["ready"]), "zain_ms": intro.get("zain_ms")}
    if adv["status"] != "lobby" and intro["stage"] in ("zain", "done"):
        # Zain's texts, once received, stay readable in Shoug's phone.
        intro_view["zain"] = C.ZAIN_INTRO
    f = adv.get("finale") or {}
    finale_view = None
    if adv["status"] in ("finale", "ended") and f.get("hands"):
        e = finale_elapsed(adv, now)
        finale_view = {
            "grid": [{"id": b, "name": PERFUMES[b]["name"], "note": PERFUMES[b]["note"], "cap": PERFUMES[b]["cap"],
                      "clear": PERFUMES[b]["clear"]} for b in f["grid"]],
            "hands": f["hands"], "dur": f["dur"], "elapsed_ms": e, "running": bool(f.get("since")),
            "assignee": f["assignee"], "assignee_name": _name(adv, ctx, f["assignee"]),
            "taken": [b for b in f["grid"] if bottle_taken(f, b, e)], "choice": f.get("choice"),
        }
    people = roster(adv, ctx)
    view = {
        "run_id": adv["run_id"], "seed": adv["seed"], "status": adv["status"], "lang": adv.get("lang", "en"), "test": adv.get("test", False), "rev": adv.get("rev", 0),
        "host_id": adv["host_id"], "nav_id": adv.get("nav_id"), "roster": people,
        "pos": adv["pos"], "teleport_seq": adv.get("teleport_seq"), "lock": movement_lock(adv),
        "clock": {"remaining_ms": clock_remaining(adv, now), "running": bool(adv["clock"].get("since")), "limit_ms": adv["clock"]["limit"]},
        "server_ms": now, "step_ms": T["step_ms"], "intro": intro_view,
        "phone": _public_phone(adv, ctx, now), "scene": _public_scene(adv, ctx, now),
        "otp": {"receiver": adv["otp"].get("receiver"), "receiver_name": _name(adv, ctx, adv["otp"].get("receiver")) if adv["otp"].get("receiver") else None},
        "doors_tried": list(adv.get("doors", [])), "gulf_state": adv.get("gulf_state", "waiting"),
        "finale": finale_view, "outcome": adv.get("outcome"), "feed": adv.get("feed", []),
        "penalties": adv.get("pen", [])[-6:], "paused": adv.get("paused", False),
        "penalty_s": dict(C.PENALTY_S),
        "timing": {k: T[k] for k in PUBLIC_TIMING},
    }
    if adv.get("test"):
        view["test_info"] = {
            "variant": adv["variant"], "events": adv["ev"], "queue": adv["queue"], "plan": adv["plan"],
            "counts": adv.get("counts", {}), "journey_ms": journey_ms(adv, now), "required_done": required_done(adv),
            "destination": layout.destination_id,
        }
    return view


def private_view(adv, pid: str, ctx, now: int) -> Optional[Dict[str, Any]]:
    """Only the OTP receiver ever gets the digits. The big on-screen flash lasts until
    `until`; after that the code stays in that player's phone (messages) for the run, so
    they can look it up again after a wrong try with Zain."""
    otp = adv.get("otp") or {}
    receiver = otp.get("receiver")
    until = otp.get("until")
    if not receiver or until is None:
        return None
    sims = {s["id"] for s in adv.get("sims", [])}
    if pid == receiver or (adv.get("test") and pid == ctx.get("test_creator_id") and receiver in sims):
        return {"otp": {"code": otp["code"], "until": until, "for": receiver}}
    return None
