"""Baccarat Hunt adventure over the real HTTP + WebSocket routes (in-memory database)."""
import json
import queue
import time
from types import SimpleNamespace

import pytest

import adventure_config as C
import adventure_engine as AE
import server


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, []
        self.operation, self.payload, self.single, self.count = "select", None, False, None

    def select(self, *args, count=None, **kwargs):
        self.count = count
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def maybe_single(self):
        self.single = True
        return self

    def insert(self, payload):
        self.operation, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.operation, self.payload = "update", payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def _match(self, row):
        for key, value in self.filters:
            current = row.get(key)
            if isinstance(value, str) and isinstance(current, list):
                if json.dumps(current) != value:
                    return False
            elif current != value:
                return False
        return True

    def execute(self):
        rows = self.db.rows.setdefault(self.table, [])
        matching = [r for r in rows if self._match(r)]
        if self.operation == "insert":
            rows.append(json.loads(json.dumps(self.payload)))
            return SimpleNamespace(data=[self.payload], count=1)
        if self.operation == "update":
            for row in matching:
                row.update(json.loads(json.dumps(self.payload)))
        if self.operation == "delete":
            for row in matching:
                rows.remove(row)
        data = [dict(r) for r in matching]
        if self.single:
            return SimpleNamespace(data=data[0] if data else None, count=len(data))
        return SimpleNamespace(data=data, count=len(data))


class DB:
    def __init__(self):
        self.rows = {"rooms": [], "players": [], "votes": [], "stories": [], "nodes": []}

    def table(self, name):
        return Query(self, name)


@pytest.fixture
def client(monkeypatch):
    from fastapi.testclient import TestClient
    db = DB()
    monkeypatch.setattr(server, "supa", db)
    monkeypatch.setattr(AE, "voice_duration", lambda script: 250)
    monkeypatch.setitem(C.SCHEDULE, "sharifa_1", 10**9)
    monkeypatch.setitem(C.SCHEDULE, "sharifa_late", 10**9)
    monkeypatch.setitem(C.SCHEDULE, "otp", 300)
    monkeypatch.setitem(C.SCHEDULE, "after_otp_gap_ms", 200)
    monkeypatch.setitem(C.SCHEDULE, "after_call_gap_ms", 200)
    monkeypatch.setitem(C.SCHEDULE, "train_fallback", 10**9)
    server._adventures.clear()
    with TestClient(server.app) as c:
        c.db = db
        yield c
    server._adventures.clear()


def recv(ws, timeout=6.0):
    message = ws._send_queue.get(timeout=timeout)
    if isinstance(message, BaseException):
        raise message
    text = message.get("text")
    return json.loads(text) if text and text.startswith("{") else text


def wait_for(ws, predicate, timeout=8.0):
    deadline = time.time() + timeout
    seen = []
    while time.time() < deadline:
        try:
            msg = recv(ws, timeout=max(0.05, deadline - time.time()))
        except queue.Empty:
            break
        seen.append(msg)
        if isinstance(msg, dict) and predicate(msg):
            return msg, seen
    raise AssertionError(f"message not received; saw {[m.get('type') if isinstance(m, dict) else m for m in seen][-12:]}")


def drain(ws, seconds=0.4):
    out = []
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            out.append(recv(ws, timeout=max(0.02, deadline - time.time())))
        except queue.Empty:
            break
    return out


def session(player):
    return {"player_id": player["id"], "session_token": player["session_token"]}


def test_multiplayer_room_moves_and_private_otp(client):
    created = client.post("/api/rooms/adventure", json={"nickname": "Hala"}).json()
    code, host = created["code"], created["player"]
    noor = client.post(f"/api/rooms/{code}/join", json={"nickname": "Noor"}).json()
    dana = client.post(f"/api/rooms/{code}/join", json={"nickname": "Dana"}).json()
    state = client.get(f"/api/rooms/{code}").json()
    assert state["adventure"]["status"] == "lobby"
    assert not any(isinstance(f, str) and f.startswith(AE.PREFIX) for f in state["room"]["flags"])
    # Guests cannot start the hunt.
    assert client.post(f"/api/rooms/{code}/adventure/start", json=session(noor)).status_code == 403

    sockets = {}
    for who in (host, noor, dana):
        ws = client.websocket_connect(f"/api/ws/rooms/{code}").__enter__()
        assert recv(ws)["type"] == "room_state"
        ws.send_text(json.dumps({"type": "hello", **session(who)}))
        wait_for(ws, lambda m: m["type"] == "hello_ok")
        sockets[who["id"]] = ws
    try:
        start = client.post(f"/api/rooms/{code}/adventure/start", json=session(host)).json()
        run_id = start["adventure"]["run_id"]
        layout = client.get(f"/api/rooms/{code}/adventure/map", params={"run_id": run_id}).json()["layout"]
        assert layout["w"] == 54 and "zones" not in layout
        act = lambda who, action, **kw: client.post(f"/api/rooms/{code}/adventure/action",
                                                    json={**session(who), "run_id": run_id, "action": action, **kw})
        assert act(noor, "voice_play").status_code == 200
        assert act(dana, "voice_play").status_code == 409  # once per run
        wait_for(sockets[host["id"]], lambda m: m["type"] == "adv_state" and m["state"]["intro"]["stage"] == "zain")
        assert act(noor, "begin").status_code == 403
        assert act(host, "begin").status_code == 200
        for ws in sockets.values():
            wait_for(ws, lambda m: m["type"] == "adv_state" and m["state"]["status"] == "playing")

        # Only the navigator (host) moves Shoug; everyone receives the step.
        pos = client.get(f"/api/rooms/{code}").json()["adventure"]["pos"]
        sockets[noor["id"]].send_text(json.dumps({"type": "adv_step", "run": run_id, "seq": 5, "x": pos["x"], "y": pos["y"] - 1, "dir": "up"}))
        correction, _ = wait_for(sockets[noor["id"]], lambda m: m["type"] == "adv_correction")
        assert correction["pos"]["y"] == pos["y"]
        sockets[host["id"]].send_text(json.dumps({"type": "adv_step", "run": run_id, "seq": 1, "x": pos["x"], "y": pos["y"] - 1, "dir": "up"}))
        for ws in sockets.values():
            moved, _ = wait_for(ws, lambda m: m["type"] == "adv_pos")
            assert moved["pos"]["y"] == pos["y"] - 1

        # The confirmation code reaches exactly one phone.
        privates = {}
        for pid, ws in sockets.items():
            msgs = drain(ws, 1.6)
            privates[pid] = [m for m in msgs if isinstance(m, dict) and m["type"] == "adv_private"]
        receivers = [pid for pid, msgs in privates.items() if msgs]
        assert len(receivers) == 1 and receivers[0] != host["id"]
        code_digits = privates[receivers[0]][0]["data"]["otp"]["code"]
        assert len(code_digits) == 4
        everything = json.dumps(client.get(f"/api/rooms/{code}").json())
        assert code_digits not in everything.replace(run_id, "")
        others = [p for p in (noor, dana) if p["id"] != receivers[0]]
        assert client.post(f"/api/rooms/{code}/adventure/private", json=session(others[0])).json()["private"] is None

        # Zain calls a different player; decline Sharifa if she gets in first.
        def zain_ringing(m):
            if m["type"] != "adv_state" or not m["state"]["phone"]:
                return False
            phone = m["state"]["phone"]
            if phone["kind"] == "call" and phone["caller"] == "sharifa" and phone["stage"] == "ringing":
                who = next(p for p in (host, noor, dana) if p["id"] == phone["assignee"])
                act(who, "decline", inst=phone["inst"])
                return False
            return phone["kind"] == "call" and phone["caller"] == "zain" and phone["stage"] == "ringing"
        msg, _ = wait_for(sockets[host["id"]], zain_ringing, timeout=12)
        phone = msg["state"]["phone"]
        assert phone["assignee"] != receivers[0]
        answerer = next(p for p in (host, noor, dana) if p["id"] == phone["assignee"])
        intruder = next(p for p in (noor, dana) if p["id"] != answerer["id"])
        assert act(intruder, "answer", inst=phone["inst"]).status_code == 403
        assert act(answerer, "answer", inst=phone["inst"]).status_code == 200
        assert act(answerer, "answer", inst=phone["inst"]).status_code == 409  # no duplicate answers
        assert act(answerer, "otp", inst=phone["inst"], value=code_digits).json()["result"]["correct"] is True
        # Persisted through the room row and recoverable after an eviction.
        server._adventures.clear()
        recovered = client.get(f"/api/rooms/{code}").json()["adventure"]
        assert recovered["run_id"] == run_id and recovered["status"] == "playing"
        assert client.post(f"/api/rooms/{code}/adventure/dev", json={**session(host), "command": "show_otp"}).status_code == 403
    finally:
        for ws in sockets.values():
            ws.__exit__(None, None, None)


def test_test99_room_is_immediately_playable_and_dev_is_creator_only(client):
    created = client.post("/api/rooms/adventure", json={"nickname": " t E s t 9 9 "}).json()
    code, tester = created["code"], created["player"]
    assert created["supreme_test_mode"] is True
    state = client.get(f"/api/rooms/{code}").json()["adventure"]
    assert state["status"] == "intro" and {p["nickname"] for p in state["roster"]} >= {"Noor", "Dana"}
    dev = lambda who, command, **kw: client.post(f"/api/rooms/{code}/adventure/dev", json={**session(who), "command": command, **kw})
    assert dev(tester, "skip_intro").json()["adventure"]["status"] == "playing"
    assert dev(tester, "otp").status_code == 200
    shown = dev(tester, "show_otp").json()["dev"]["otp"]
    assert len(shown["code"]) == 4 and shown["receiver"] == tester["id"]
    assert client.post(f"/api/rooms/{code}/adventure/private", json=session(tester)).json()["private"]["otp"]["code"] == shown["code"]
    view = dev(tester, "zain").json()["adventure"]
    phone = view["phone"]
    assert phone["caller"] == "zain" and phone["assignee"].startswith("sim_")
    run_id = view["run_id"]
    act = lambda action, **kw: client.post(f"/api/rooms/{code}/adventure/action", json={**session(tester), "run_id": run_id, "action": action, **kw})
    assert act("decline", inst=phone["inst"]).json()["adventure"]["phone"]["stage"] == "missed"
    assert act("call_back", inst=phone["inst"]).json()["adventure"]["phone"]["stage"] == "otp_entry"
    assert act("otp", inst=phone["inst"], value=shown["code"]).json()["result"]["correct"]
    assert dev(tester, "teleport_shop").status_code == 200
    final = dev(tester, "finale").json()["adventure"]
    assert final["status"] == "finale" and len(final["finale"]["grid"]) == 9
    assert act("choose", value="gucci_oud").json()["adventure"]["outcome"]["code"] == "lose_fallback_early"
    assert dev(tester, "restart").json()["adventure"]["status"] == "intro"
    assert dev(tester, "force_win", code="win_fallback").json()["adventure"]["outcome"]["code"] == "win_fallback"
    # A real guest in a TEST99 room plays normally but never gets the developer controls.
    guest = client.post(f"/api/rooms/{code}/join", json={"nickname": "Guest"}).json()
    assert dev(guest, "skip_intro").status_code == 403
    assert dev(guest, "show_otp").status_code == 403
    assert client.post(f"/api/rooms/{code}/adventure/private", json=session(guest)).json()["private"] is None


def test_story_routes_refuse_adventure_rooms(client):
    created = client.post("/api/rooms/adventure", json={"nickname": "Hala"}).json()
    code, host = created["code"], created["player"]
    client.db.rows["stories"].append({"id": "s1", "title": "Zayn", "start_node_id": "n1"})
    assert client.post(f"/api/rooms/{code}/select-story", json={**session(host), "story_id": "s1"}).status_code == 409
    assert client.post(f"/api/rooms/{code}/start", json=session(host)).status_code == 409


def test_normal_story_rooms_are_unaffected(client):
    created = client.post("/api/rooms", json={"nickname": "Hala"}).json()
    state = client.get(f"/api/rooms/{created['code']}").json()
    assert "adventure" not in state
    assert client.get(f"/api/rooms/{created['code']}/adventure/map").status_code == 404
