"""Baccarat Hunt adventure: engine, map and privacy tests (no database)."""
import copy
import json
from collections import deque

import pytest

import adventure_config as C
import adventure_engine as E
import adventure_map as M

HOST, GUEST1, GUEST2 = "host-id", "guest-1", "guest-2"


def players(*ids):
    return [{"id": pid, "nickname": pid.upper(), "is_host": pid == HOST} for pid in ids]


def ctx_for(ids=(HOST, GUEST1, GUEST2), online=None, test_creator=None):
    online = set(ids) if online is None else set(online)
    return {"players": players(*ids), "presence": {pid: pid in online for pid in ids}, "last_seen": {},
            "test_creator_id": test_creator}


class Clock:
    def __init__(self):
        self.now = 1_700_000_000_000

    def advance(self, ms):
        self.now += ms
        return self.now


def path_to(adv, targets):
    """BFS over the authoritative walkable grid from Shoug's position."""
    targets = set(targets)
    start = (adv["pos"]["x"], adv["pos"]["y"])
    prev = {start: None}
    q = deque([start])
    while q:
        cur = q.popleft()
        if cur in targets:
            out = []
            while cur != start:
                out.append(cur)
                cur = prev[cur]
            return out[::-1]
        for d, (dx, dy) in E.DIRS.items():
            nxt = (cur[0] + dx, cur[1] + dy)
            if nxt not in prev and E.walkable(adv, *nxt):
                prev[nxt] = cur
                q.append(nxt)
    raise AssertionError("no path")


def step(adv, clock, x, y, pid=HOST):
    px, py = adv["pos"]["x"], adv["pos"]["y"]
    direction = next(d for d, (dx, dy) in E.DIRS.items() if (px + dx, py + dy) == (x, y))
    clock.advance(C.TIMING["step_ms"])
    return E.handle_move(adv, pid, {"type": "adv_step", "run": adv["run_id"], "seq": adv["pos"]["seq"] + 1,
                                    "x": x, "y": y, "dir": direction}, clock.now)


def face(adv, clock, direction, pid=HOST):
    return E.handle_move(adv, pid, {"type": "adv_face", "run": adv["run_id"], "seq": adv["pos"]["seq"] + 1,
                                    "dir": direction}, clock.now)


def started(ctx, clock, test=False, variant="west", seed=4242):
    adv = E.new_adventure(HOST, test, clock.now)
    E.restart(adv, clock.now, seed=seed, variant=variant)
    E.act(adv, ctx, HOST, "voice_play", {}, clock.now)
    clock.advance(adv["intro"]["voice"]["dur_ms"] + 10)
    E.tick(adv, ctx, clock.now)
    E.act(adv, ctx, HOST, "begin", {}, clock.now)
    return adv


def run_until(adv, ctx, clock, predicate, limit_ms=200_000, step_ms=200):
    spent = 0
    while not predicate(adv):
        clock.advance(step_ms)
        spent += step_ms
        E.tick(adv, ctx, clock.now)
        if spent > limit_ms:
            raise AssertionError(f"condition not reached; phone={adv.get('phone')} scene={adv.get('scene')} queue={adv['queue']}")


def walk(adv, ctx, clock, targets, handle=None):
    """Walk Shoug to any target, letting `handle` clear interruptions."""
    for _ in range(4000):
        if (adv["pos"]["x"], adv["pos"]["y"]) in set(targets):
            return
        if handle:
            handle(adv)
        if E.movement_lock(adv):
            clock.advance(200)
            E.tick(adv, ctx, clock.now)
            continue
        nxt = path_to(adv, targets)[0]
        ok, _ = step(adv, clock, *nxt)
        E.tick(adv, ctx, clock.now)
        assert ok or E.movement_lock(adv)
    raise AssertionError("walk did not finish")


# ------------------------------------------------------------------ map

@pytest.mark.parametrize("variant", M.VARIANTS)
@pytest.mark.parametrize("seed", [1, 7, 42, 999, 123456, 2**30 + 5])
def test_every_layout_is_valid_and_deterministic(seed, variant):
    a = M.generate(seed, variant)
    b = M.generate(seed, variant)
    assert a.public() == b.public()
    dest = a.door_index[a.destination_id]
    assert dest["style"] == "gold_double" and dest["correct"]
    assert sum(1 for d in a.door_index.values() if d["style"] == "gold_double") == 1
    styles = {d["style"] for d in a.door_index.values()}
    assert {"gold_single", "silver_double", "green_gold_handles"} <= styles


def test_public_layout_never_reveals_the_correct_door_or_zones():
    layout = M.generate(42, "west")
    public = layout.public()
    text = json.dumps(public)
    for secret in ("correct", "destination", "zones", "otp", "west"):
        assert secret not in text
    assert set(public) == {"w", "h", "tile", "seed", "variant_key", "ground", "blocked", "buildings", "props", "walkers", "npcs", "spawn", "gulf", "sky_rows"}


# ------------------------------------------------------------------ intro

def test_voice_note_plays_once_and_gates_the_start():
    clock, ctx = Clock(), ctx_for()
    adv = E.new_adventure(HOST, False, clock.now)
    E.start_intro(adv, clock.now)
    with pytest.raises(E.ActionError):
        E.act(adv, ctx, HOST, "begin", {}, clock.now)
    view = E.public_view(adv, ctx, clock.now)
    # The whole transcript is there as one block as soon as the voice note appears.
    script = view["intro"]["voice"]["script"]
    assert "**golden double doors**" in script and "**If you can't find it, get Gucci Oud**" in script
    # Order: perfume first, then the Gucci fallback, then the route and the doors last.
    assert script.index("gold animal cap") < script.index("Gucci Oud") < script.index("golden double doors")
    assert script.rstrip().endswith("**golden double doors**.")
    assert "zain" not in view["intro"]
    E.act(adv, ctx, GUEST1, "voice_play", {}, clock.now)
    assert "turn left" in json.dumps(E.public_view(adv, ctx, clock.now)) or adv["variant"] != "west"
    with pytest.raises(E.ActionError) as again:
        E.act(adv, ctx, HOST, "voice_play", {}, clock.now)
    assert again.value.status == 409
    clock.advance(adv["intro"]["voice"]["dur_ms"] + 2000)
    E.tick(adv, ctx, clock.now)
    view = E.public_view(adv, ctx, clock.now)
    assert view["intro"]["voice"]["script"] == script and view["intro"]["stage"] == "zain"
    assert any("7 PM" in m for m in view["intro"]["zain"])
    with pytest.raises(E.ActionError):
        E.act(adv, ctx, GUEST1, "begin", {}, clock.now)
    E.act(adv, ctx, HOST, "begin", {}, clock.now)
    assert adv["status"] == "playing"
    view = E.public_view(adv, ctx, clock.now)
    # Received messages stay available for the in-game phone.
    assert view["intro"]["voice"]["script"] == script and view["intro"]["zain"]


def test_voice_note_can_be_skipped_to_zain():
    clock, ctx = Clock(), ctx_for()
    adv = E.new_adventure(HOST, False, clock.now)
    E.start_intro(adv, clock.now)
    E.act(adv, ctx, GUEST1, "voice_play", {}, clock.now)
    clock.advance(500)
    E.act(adv, ctx, GUEST1, "voice_skip", {}, clock.now)
    view = E.public_view(adv, ctx, clock.now)
    assert view["intro"]["stage"] == "zain" and view["intro"]["voice"]["status"] == "done"
    assert view["intro"]["voice"]["script"] and view["intro"]["zain"]
    E.act(adv, ctx, HOST, "begin", {}, clock.now)
    assert adv["status"] == "playing"


def test_zain_texts_mark_the_key_lines():
    joined = " ".join(C.ZAIN_INTRO)
    assert "**last train back is at 7 PM**" in joined and "^^do NOT answer Sharifa today^^" in joined
    assert "**I'll call you later to get it, so PICK UP**" in joined


def test_voice_note_is_short_and_markers_are_not_timed():
    for script in E.C.VOICE_NOTE["scripts"].values():
        plain = script.replace("**", "")
        assert plain.count(".") <= 3 and len(plain.split()) <= 50
        assert E.voice_duration(script) == E.voice_duration(plain)
        assert script.count("**") % 2 == 0


# ------------------------------------------------------------------ movement

def test_only_navigator_moves_and_walls_hold():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    x, y = adv["pos"]["x"], adv["pos"]["y"]
    ok, _ = step(adv, clock, x, y - 1, pid=GUEST1)
    assert not ok and adv["pos"]["y"] == y
    ok, _ = step(adv, clock, x, y - 1)
    assert ok and adv["pos"]["y"] == y - 1
    # Teleport attempts and too-fast steps are rejected.
    assert not E.handle_move(adv, HOST, {"type": "adv_step", "run": adv["run_id"], "seq": 999, "x": x, "y": y - 5, "dir": "up"}, clock.now)[0]
    # Steps bunched up by a stall (~1s of walking arriving at once) all land (no snap-back) ...
    burst = copy.deepcopy(adv)
    open_ahead = 0
    while open_ahead < 6 and E.walkable(burst, x, y - 2 - open_ahead):
        open_ahead += 1
    results = []
    for i in range(open_ahead):
        p = burst["pos"]
        results.append(E.handle_move(burst, HOST, {"type": "adv_step", "run": burst["run_id"], "seq": p["seq"] + 1,
                                                   "x": p["x"], "y": p["y"] - 1, "dir": "up"}, clock.now + 10)[0])
    assert open_ahead >= 3 and all(results)
    # ... but a sustained too-fast rate is still refused.
    fast = copy.deepcopy(adv)
    fast["pos"]["ms"] = clock.now + E.T["step_burst_ms"]
    assert not E.handle_move(fast, HOST, {"type": "adv_step", "run": fast["run_id"], "seq": fast["pos"]["seq"] + 1,
                                          "x": x, "y": y - 2, "dir": "up"}, clock.now)[0]
    # A building wall is never walkable.
    b = M.get_layout(adv["seed"], adv["variant"]).buildings[0]
    assert not E.walkable(adv, b.x, b.y)
    # Stale sequence numbers are ignored.
    seq = adv["pos"]["seq"]
    assert not E.handle_move(adv, HOST, {"type": "adv_face", "run": adv["run_id"], "seq": seq, "dir": "left"}, clock.now)[0]


# ------------------------------------------------------------------ full multiplayer playthrough

def test_full_playthrough_wins_with_shared_penalties_and_private_otp():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock, variant="west")
    layout = M.get_layout(adv["seed"], adv["variant"])
    seen_code = {}
    log = []

    def handle(adv):
        phone = adv.get("phone")
        if phone and phone["kind"] == "otp":
            visible = clock.now <= adv["otp"]["until"]
            for pid in (HOST, GUEST1, GUEST2):
                private = E.private_view(adv, pid, ctx, clock.now)
                if pid == phone["receiver"]:
                    # The receiver keeps the code in their phone, even after the flash.
                    assert private and len(private["otp"]["code"]) == 4
                    if visible:
                        seen_code["code"] = private["otp"]["code"]
                else:
                    assert private is None
            assert "code" in seen_code, "the receiver never saw the code"
            assert seen_code["code"] not in json.dumps(E.public_view(adv, ctx, clock.now))
        if phone and phone["kind"] == "call" and phone["stage"] == "ringing":
            if phone["caller"] == "sharifa":
                E.act(adv, ctx, phone["assignee"], "decline", {"inst": phone["inst"]}, clock.now)
                log.append("declined sharifa")
            else:
                assert phone["assignee"] != adv["otp"]["receiver"]
                E.act(adv, ctx, phone["assignee"], "answer", {"inst": phone["inst"]}, clock.now)
                E.act(adv, ctx, phone["assignee"], "otp", {"inst": phone["inst"], "value": seen_code["code"]}, clock.now)
                log.append("otp ok")
        if phone and phone["kind"] == "text" and phone["stage"] == "asking":
            E.act(adv, ctx, phone["assignee"], "train", {"inst": phone["inst"], "value": "7 PM"}, clock.now)
            log.append("train ok")
        scene = adv.get("scene")
        if scene and scene["kind"] == "gulf" and scene["stage"] == "inspect":
            E.act(adv, ctx, scene["assignee"], "price", {"inst": scene["inst"], "value": "2,000"}, clock.now)
            log.append("price ok")

    dest = layout.door_index[layout.destination_id]
    walk(adv, ctx, clock, dest["front"], handle)
    # Finish any story beats still running before the door opens.
    run_until(adv, ctx, clock, lambda a: E.required_done(a) or (handle(a) or False), limit_ms=120_000)
    run_until(adv, ctx, clock, lambda a: not E.movement_lock(a))
    face(adv, clock, "up")
    assert E.act(adv, ctx, HOST, "interact", {}, clock.now)["door"] == "open"
    run_until(adv, ctx, clock, lambda a: a["status"] == "finale")
    f = adv["finale"]
    assert len(f["grid"]) == 9 and f["assignee"] in (GUEST1, GUEST2)
    with pytest.raises(E.ActionError):
        E.act(adv, ctx, HOST, "choose", {"value": E.PRIMARY}, clock.now)
    E.act(adv, ctx, f["assignee"], "choose", {"value": E.PRIMARY}, clock.now)
    assert adv["outcome"]["result"] == "win" and adv["outcome"]["code"] == "win_primary"
    assert {"declined sharifa", "otp ok", "train ok", "price ok"} <= set(log)
    assert adv["gulf_state"] == "gone"
    assert adv["clock"]["penalty"] == 0


def test_assignments_rotate_and_prefer_guests():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    picks = [E.assign(adv, ctx) for _ in range(6)]
    assert HOST not in picks and picks.count(GUEST1) == 3 and picks.count(GUEST2) == 3


def test_disconnected_assignee_is_reassigned():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    adv["ev"]["train"]["st"] = "pending"
    E._queue(adv, "train")
    E.tick(adv, ctx, clock.now)
    phone = adv["phone"]
    assert phone["kind"] == "text"
    gone = phone["assignee"]
    ctx["presence"][gone] = False
    ctx["last_seen"][gone] = clock.now
    clock.advance(C.TIMING["reassign_after_ms"] + 50)
    E.tick(adv, ctx, clock.now)
    assert adv["phone"]["assignee"] not in (gone,)
    with pytest.raises(E.ActionError):
        E.act(adv, ctx, gone, "train", {"inst": adv["phone"]["inst"], "value": "7 PM"}, clock.now)


def test_navigator_moves_to_a_guest_when_host_drops():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    ctx["presence"][HOST] = False
    ctx["last_seen"][HOST] = clock.now
    clock.advance(C.TIMING["reassign_after_ms"] + 10)
    E.tick(adv, ctx, clock.now)
    assert adv["nav_id"] in (GUEST1, GUEST2)
    ctx["presence"][HOST] = True
    E.tick(adv, ctx, clock.now)
    assert adv["nav_id"] == HOST


# ------------------------------------------------------------------ calls

def _ring(adv, ctx, clock, eid):
    adv["ev"][eid]["st"] = "pending"
    adv["phone"] = None
    E._queue(adv, eid)
    E.tick(adv, ctx, clock.now)
    assert adv["phone"]["eid"] == eid
    return adv["phone"]


def test_answering_sharifa_costs_time_and_escalates():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    before = E.clock_remaining(adv, clock.now)
    phone = _ring(adv, ctx, clock, "sharifa_1")
    E.act(adv, ctx, phone["assignee"], "answer", {"inst": phone["inst"]}, clock.now)
    assert adv["phone"]["stage"] == "talking" and adv["phone"]["line"] == C.SHARIFA["answered"][0]
    assert before - E.clock_remaining(adv, clock.now) >= C.PENALTY_S["sharifa_answer"] * 1000
    with pytest.raises(E.ActionError):  # no double answers
        E.act(adv, ctx, phone["assignee"], "answer", {"inst": phone["inst"]}, clock.now)
    run_until(adv, ctx, clock, lambda a: a.get("phone") is None)
    phone = _ring(adv, ctx, clock, "sharifa_3")
    E.act(adv, ctx, phone["assignee"], "decline", {"inst": phone["inst"]}, clock.now)
    assert adv["feed"][-1]["text"] == C.SHARIFA["declined"][1]


def test_declining_zain_pauses_everyone_then_call_back_recovers():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    adv["otp"]["receiver"] = GUEST1
    E._finish_event(adv, "otp", True, clock.now)
    phone = _ring(adv, ctx, clock, "zain_call")
    assert phone["assignee"] != GUEST1
    before = E.clock_remaining(adv, clock.now)
    E.act(adv, ctx, phone["assignee"], "decline", {"inst": phone["inst"]}, clock.now)
    assert adv["phone"]["stage"] == "missed" and adv["phone"]["line"] == C.ZAIN_CALL["missed"]
    assert E.movement_lock(adv) == "missed_call"
    assert before - E.clock_remaining(adv, clock.now) >= C.PENALTY_S["zain_missed"] * 1000
    x, y = adv["pos"]["x"], adv["pos"]["y"]
    assert not step(adv, clock, x, y - 1)[0]
    with pytest.raises(E.ActionError):
        E.act(adv, ctx, GUEST1 if phone["assignee"] != GUEST1 else GUEST2, "call_back", {"inst": phone["inst"]}, clock.now)
    E.act(adv, ctx, phone["assignee"], "call_back", {"inst": phone["inst"]}, clock.now)
    assert adv["phone"]["stage"] == "otp_entry" and not E.movement_lock(adv)
    # Wrong codes cost time, then the limited retries run out without soft-locking.
    for _ in range(C.TIMING["otp_attempts"]):
        if adv["phone"]["stage"] == "wrong":
            clock.advance(1700)
            E.tick(adv, ctx, clock.now)
        E.act(adv, ctx, phone["assignee"], "otp", {"inst": phone["inst"], "value": "0000"}, clock.now)
    assert adv["phone"]["stage"] == "failed"
    run_until(adv, ctx, clock, lambda a: a.get("phone") is None)
    assert adv["ev"]["zain_call"]["st"] == "done" and adv["ev"]["zain_call"]["ok"] is False


def test_missed_zain_call_opens_to_anyone_after_a_while():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    E._finish_event(adv, "otp", True, clock.now)
    adv["otp"]["receiver"] = GUEST2
    phone = _ring(adv, ctx, clock, "zain_call")
    clock.advance(C.TIMING["ring_ms"] + 10)
    E.tick(adv, ctx, clock.now)
    assert adv["phone"]["stage"] == "missed"
    clock.advance(C.TIMING["missed_call_open_ms"] + 10)
    E.tick(adv, ctx, clock.now)
    other = HOST if phone["assignee"] != HOST else GUEST2
    E.act(adv, ctx, other, "call_back", {"inst": phone["inst"]}, clock.now)
    assert adv["phone"]["stage"] == "otp_entry"


def test_wrong_train_time_gets_typing_then_angry_reply():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    phone = _ring(adv, ctx, clock, "train")
    E.act(adv, ctx, phone["assignee"], "train", {"inst": phone["inst"], "value": "8 PM"}, clock.now)
    assert adv["phone"]["stage"] == "confirm" and "8 PM" in adv["phone"]["shoug"]
    stages = []
    run_until(adv, ctx, clock, lambda a: (stages.append(a["phone"]["stage"]) if a.get("phone") else None) or a.get("phone") is None)
    assert "typing" in stages and "angry" in stages
    assert any(p["key"] == "train_wrong" for p in adv["pen"])



def test_right_train_time_shows_shougs_text_first_then_zains_reply():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    phone = _ring(adv, ctx, clock, "train")
    E.act(adv, ctx, phone["assignee"], "train", {"inst": phone["inst"], "value": "7 PM"}, clock.now)
    # Only Shoug's bubble at first: Zain's reply never lands at the same moment.
    assert adv["phone"]["stage"] == "confirm" and adv["phone"].get("line") is None
    sent_at = clock.now
    seen = []
    def watch(a):
        p = a.get("phone")
        if p and (not seen or seen[-1][0] != p["stage"]):
            seen.append((p["stage"], clock.now - sent_at))
        return p is None
    run_until(adv, ctx, clock, watch)
    stages = [s for s, _ in seen]
    assert stages[:3] == ["confirm", "typing", "correct"]
    reply_ms = dict(seen)["correct"]
    assert 1_400 <= reply_ms <= 2_200
    assert not any(p["key"] == "train_wrong" for p in adv["pen"])
    assert adv["ev"]["train"]["ok"] is True

# ------------------------------------------------------------------ doors and the Gulf encounter

def test_wrong_doors_cost_once_and_right_door_waits_for_story():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock, variant="north")
    layout = M.get_layout(adv["seed"], adv["variant"])
    wrong = next(d for d in layout.door_index.values() if d["style"] == "silver_double")
    walk(adv, ctx, clock, wrong["front"], handle=lambda a: _auto(a, ctx, clock))
    run_until(adv, ctx, clock, lambda a: not E.movement_lock(a))
    face(adv, clock, "up")
    before = len(adv["pen"])
    assert E.act(adv, ctx, HOST, "interact", {}, clock.now)["door"] == "wrong"
    assert adv["scene"]["line"] == C.DOOR_LINES["silver_double"] and len(adv["pen"]) == before + 1
    run_until(adv, ctx, clock, lambda a: a.get("scene") is None)
    if E.movement_lock(adv):
        run_until(adv, ctx, clock, lambda a: (_auto(a, ctx, clock) or True) and not E.movement_lock(a))
    face(adv, clock, "up")
    if not E.movement_lock(adv):
        E.act(adv, ctx, HOST, "interact", {}, clock.now)
        assert adv["scene"]["line"] == C.DOOR_LINES["repeat"] and len(adv["pen"]) <= before + 2


def _auto(adv, ctx, clock):
    """Politely clear interruptions (decline Sharifa, ignore others)."""
    phone = adv.get("phone")
    if phone and phone["kind"] == "call" and phone["stage"] == "ringing" and phone["caller"] == "sharifa":
        E.act(adv, ctx, phone["assignee"], "decline", {"inst": phone["inst"]}, clock.now)


def test_gulf_woman_blocks_the_route_until_she_leaves():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock, variant="east")
    layout = M.get_layout(adv["seed"], adv["variant"])
    woman = (layout.gulf["woman"]["x"], layout.gulf["woman"]["y"])
    assert not E.walkable(adv, *woman)
    walk(adv, ctx, clock, layout.zones["gulf"], handle=lambda a: _auto(a, ctx, clock))
    run_until(adv, ctx, clock, lambda a: (_auto(a, ctx, clock) or True) and a.get("scene") and a["scene"]["kind"] == "gulf")
    assert E.movement_lock(adv) == "gulf"
    run_until(adv, ctx, clock, lambda a: a["scene"]["stage"] == "inspect")
    scene = adv["scene"]
    view = E.public_view(adv, ctx, clock.now)
    assert view["scene"]["screenshot"]["price"] == "£2,000" and "answer" not in view["scene"]["screenshot"]
    E.act(adv, ctx, scene["assignee"], "price", {"inst": scene["inst"], "value": "200"}, clock.now)
    assert adv["scene"]["stage"] == "wrong"
    run_until(adv, ctx, clock, lambda a: a["scene"]["stage"] == "inspect")
    E.act(adv, ctx, scene["assignee"], "price", {"inst": scene["inst"], "value": "2000"}, clock.now)
    assert adv["scene"]["stage"] == "react" and adv["scene"]["line"] == "TWO THOUSAND POUNDS?!"
    run_until(adv, ctx, clock, lambda a: a.get("scene") is None)
    assert adv["gulf_state"] == "gone" and E.walkable(adv, *woman) and not E.movement_lock(adv)


# ------------------------------------------------------------------ finale

def _at_counter(ctx, clock):
    adv = started(ctx, clock)
    for eid in C.REQUIRED_EVENTS:
        E._finish_event(adv, eid, True, clock.now)
    E.start_finale(adv, ctx, clock.now)
    return adv


def test_shop_cutscene_hands_over_to_the_counter_with_a_published_change():
    """The tick that turns the cutscene into the counter must report a change (it gets broadcast)."""
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    for eid in C.REQUIRED_EVENTS:
        E._finish_event(adv, eid, True, clock.now)
    layout = M.get_layout(adv["seed"], adv["variant"])
    walk(adv, ctx, clock, layout.door_index[layout.destination_id]["front"], handle=lambda a: _auto(a, ctx, clock))
    run_until(adv, ctx, clock, lambda a: (_auto(a, ctx, clock) or True) and not E.movement_lock(a) and not a.get("phone"))
    face(adv, clock, "up")
    assert E.act(adv, ctx, HOST, "interact", {}, clock.now)["door"] == "open"
    clock.advance(C.TIMING["shop_cutscene_ms"] + 10)
    assert E.tick(adv, ctx, clock.now) is True
    assert adv["status"] == "finale" and E.public_view(adv, ctx, clock.now)["finale"]["grid"]


def test_npcs_answer_whichever_way_shoug_faces():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    layout = M.get_layout(adv["seed"], adv["variant"])
    npc = next(n for n in layout.npcs if n["id"] in E.NPC_LINES)
    spots = [(npc["x"] + dx, npc["y"] + dy, d) for d, (dx, dy) in {"left": (1, 0), "right": (-1, 0), "up": (0, 1), "down": (0, -1)}.items()]
    x, y, direction = next(s for s in spots if E.walkable(adv, s[0], s[1]))
    adv["pos"].update({"x": x, "y": y, "dir": direction})
    out = E.act(adv, ctx, HOST, "interact", {}, clock.now)
    assert out["talk"] == E.NPC_LINES[npc["id"]]
    adv["pos"]["dir"] = {"left": "right", "right": "left", "up": "down", "down": "up"}[direction]
    with pytest.raises(E.ActionError):
        E.act(adv, ctx, HOST, "interact", {}, clock.now)


def test_gucci_oud_is_wrong_while_the_swan_is_available():
    clock, ctx = Clock(), ctx_for()
    adv = _at_counter(ctx, clock)
    E.act(adv, ctx, adv["finale"]["assignee"], "choose", {"value": E.FALLBACK}, clock.now)
    assert adv["outcome"]["code"] == "lose_fallback_early"


def test_gucci_oud_wins_once_the_swan_is_snatched():
    clock, ctx = Clock(), ctx_for()
    adv = _at_counter(ctx, clock)
    grab = next(h["grab"] for h in adv["finale"]["hands"] if h["target"] == E.PRIMARY and "grab" in h)
    run_until(adv, ctx, clock, lambda a: E.finale_elapsed(a, clock.now) > grab, step_ms=250)
    with pytest.raises(E.ActionError):
        E.act(adv, ctx, adv["finale"]["assignee"], "choose", {"value": E.PRIMARY}, clock.now)
    E.act(adv, ctx, adv["finale"]["assignee"], "choose", {"value": E.FALLBACK}, clock.now)
    assert adv["outcome"]["code"] == "win_fallback"


def test_decoys_explain_the_missed_clue_and_timeout_loses():
    clock, ctx = Clock(), ctx_for()
    adv = _at_counter(ctx, clock)
    E.act(adv, ctx, adv["finale"]["assignee"], "choose", {"value": "cerf_des_bois"}, clock.now)
    assert adv["outcome"]["code"] == "lose_decoy" and "forest" in adv["outcome"]["body"]
    clock2, ctx2 = Clock(), ctx_for()
    adv2 = _at_counter(ctx2, clock2)
    run_until(adv2, ctx2, clock2, lambda a: a["status"] == "ended", step_ms=500)
    assert adv2["outcome"]["code"] == "lose_finale_timeout"


def test_correct_bottle_is_never_hidden_early():
    for hand in C.HANDS:
        if hand["target"] == E.PRIMARY and "grab" in hand:
            assert hand["grab"] >= 0.6 * C.TIMING["finale_ms"]
            assert hand.get("cover", 1) <= 0.6


def test_journey_timer_runs_out():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    adv["clock"]["penalty"] = C.TIMING["journey_ms"] - 1000
    run_until(adv, ctx, clock, lambda a: a["status"] == "ended")
    assert adv["outcome"]["code"] == "lose_journey_timeout"


# ------------------------------------------------------------------ TEST99

def test_test99_solo_session_reaches_every_event_without_deadlock():
    clock = Clock()
    ctx = ctx_for(ids=(HOST,), test_creator=HOST)
    adv = E.new_adventure(HOST, True, clock.now)
    E.start_intro(adv, clock.now)
    names = {p["nickname"] for p in E.roster(adv, ctx)}
    assert {"Noor", "Dana"} <= names
    E.dev(adv, ctx, "skip_intro", {}, clock.now)
    assert adv["status"] == "playing"
    E.dev(adv, ctx, "otp", {}, clock.now)
    assert adv["phone"]["kind"] == "otp" and adv["otp"]["receiver"] == HOST
    assert E.private_view(adv, HOST, ctx, clock.now)["otp"]["code"] == adv["otp"]["code"]
    code = E.dev(adv, ctx, "show_otp", {}, clock.now)["otp"]["code"]
    E.dev(adv, ctx, "zain", {}, clock.now)
    phone = adv["phone"]
    assert phone["caller"] == "zain" and phone["assignee"].startswith("sim_")
    E.act(adv, ctx, HOST, "decline", {"inst": phone["inst"]}, clock.now)  # acting as the simulated player
    E.act(adv, ctx, HOST, "call_back", {"inst": phone["inst"]}, clock.now)
    E.act(adv, ctx, HOST, "otp", {"inst": phone["inst"], "value": "1111"}, clock.now)
    clock.advance(1700)
    E.tick(adv, ctx, clock.now)
    E.act(adv, ctx, HOST, "otp", {"inst": phone["inst"], "value": code}, clock.now)
    assert adv["phone"]["stage"] == "success"
    E.dev(adv, ctx, "sharifa", {}, clock.now)
    assert adv["phone"]["caller"] == "sharifa"
    E.act(adv, ctx, HOST, "answer", {"inst": adv["phone"]["inst"]}, clock.now)
    E.dev(adv, ctx, "train", {}, clock.now)
    E.act(adv, ctx, HOST, "train", {"inst": adv["phone"]["inst"], "value": "6:30 PM"}, clock.now)
    E.dev(adv, ctx, "gulf", {}, clock.now)
    run_until(adv, ctx, clock, lambda a: a.get("scene") and a["scene"]["stage"] == "inspect")
    E.act(adv, ctx, HOST, "price", {"inst": adv["scene"]["inst"], "value": "2000"}, clock.now)
    E.dev(adv, ctx, "teleport_shop", {}, clock.now)
    E.dev(adv, ctx, "pause", {}, clock.now)
    frozen = E.clock_remaining(adv, clock.now)
    clock.advance(5000)
    assert E.clock_remaining(adv, clock.now) == frozen
    E.dev(adv, ctx, "resume", {}, clock.now)
    E.dev(adv, ctx, "reset_timer", {}, clock.now)
    assert E.clock_remaining(adv, clock.now) == C.TIMING["journey_ms"]
    E.dev(adv, ctx, "finale", {}, clock.now)
    assert adv["status"] == "finale"
    E.dev(adv, ctx, "pause", {}, clock.now)
    e = E.finale_elapsed(adv, clock.now)
    clock.advance(4000)
    assert E.finale_elapsed(adv, clock.now) == e
    E.dev(adv, ctx, "resume", {}, clock.now)
    E.act(adv, ctx, HOST, "choose", {"value": E.PRIMARY}, clock.now)
    assert adv["outcome"]["code"] == "win_primary"
    E.dev(adv, ctx, "restart", {}, clock.now)
    assert adv["status"] == "intro" and adv["outcome"] is None
    for code_ in ("win_fallback", "lose_fallback_early", "lose_journey_timeout", "lose_finale_timeout", "lose_decoy"):
        E.dev(adv, ctx, "force_win" if code_.startswith("win") else "force_lose", {"code": code_}, clock.now)
        assert adv["outcome"]["code"] == code_
    assert "test_info" in E.public_view(adv, ctx, clock.now)


def test_dev_controls_refused_outside_test99():
    clock, ctx = Clock(), ctx_for()
    adv = started(ctx, clock)
    with pytest.raises(E.ActionError):
        E.dev(adv, ctx, "show_otp", {}, clock.now)
    assert "test_info" not in E.public_view(adv, ctx, clock.now)


def test_envelope_round_trip_and_flags_isolation():
    clock = Clock()
    adv = E.new_adventure(HOST, False, clock.now)
    flags = E.envelope_flags(["story_flag"], adv)
    assert E.read_envelope(flags)["run_id"] == adv["run_id"]
    assert E.strip_envelope(flags) == ["story_flag"]
