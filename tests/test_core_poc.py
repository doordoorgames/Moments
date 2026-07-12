"""
POC simulation for the branching narrative multiplayer engine.

Simulates 3 players in one room:
  - Different starting choices (flag branching)
  - Convergence at a Location Gate (must all reach before any can advance)
  - Vote Gate resolution by majority
  - Independent per-player progression

Run with: python /app/tests/test_core_poc.py
"""
import os
import sys
import time
import requests

BASE = os.environ.get("BASE_URL", "http://localhost:8001/api")


def assert_true(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"PASS: {msg}")


def api(method, path, **kw):
    url = f"{BASE}{path}"
    resp = requests.request(method, url, timeout=15, **kw)
    if resp.status_code >= 400:
        print(f"HTTP {resp.status_code} {method} {url}: {resp.text}")
    return resp


def main():
    print("== 1. Fetch available stories (should include Zayn) ==")
    r = api("GET", "/stories")
    assert_true(r.status_code == 200, "GET /stories 200")
    stories = r.json()
    zayn = next((s for s in stories if "Zayn" in s["title"]), None)
    assert_true(zayn is not None, f"Zayn story present ({len(stories)} stories)")
    story_id = zayn["id"]

    print("\n== 2. Create room ==")
    r = api("POST", "/rooms")
    assert_true(r.status_code == 200, "POST /rooms 200")
    code = r.json()["code"]
    print(f"Room code: {code}")

    print("\n== 3. 3 players join ==")
    players = []
    for name in ["Ava", "Bea", "Cara"]:
        r = api("POST", f"/rooms/{code}/join", json={"nickname": name})
        assert_true(r.status_code == 200, f"{name} joined")
        players.append(r.json())

    print("\n== 4. Nickname duplication rejected ==")
    r = api("POST", f"/rooms/{code}/join", json={"nickname": "AVA"})
    assert_true(r.status_code == 400, "duplicate nickname rejected")

    print("\n== 5. Select story + start ==")
    r = api("POST", f"/rooms/{code}/select-story", json={"story_id": story_id})
    assert_true(r.status_code == 200, "select story")
    r = api("POST", f"/rooms/{code}/start")
    assert_true(r.status_code == 200, "start room")

    print("\n== 6. All players see the ticket counter ==")
    for p in players:
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        assert_true(r.status_code == 200, f"{p['nickname']} view 200")
        v = r.json()
        assert_true(v["node"] and "Ticket" in v["node"]["title"], f"{p['nickname']} at Ticket Counter")
        assert_true(len(v["choices"]) == 2, f"{p['nickname']} sees 2 choices")

    print("\n== 7. Ava chooses Business, Bea chooses Economy, Cara chooses Business ==")
    plans = {
        "Ava": "Business",
        "Bea": "Economy",
        "Cara": "Business",
    }
    for p in players:
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        v = r.json()
        target_kw = plans[p["nickname"]]
        choice = next(c for c in v["choices"] if target_kw.lower() in c["text"].lower())
        r = api("POST", f"/rooms/{code}/players/{p['id']}/choose", json={"choice_id": choice["id"]})
        assert_true(r.status_code == 200, f"{p['nickname']} chose {target_kw}")

    print("\n== 8. Verify flag branching ==")
    for p in players:
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        v = r.json()
        flags = v["player"]["flags"]
        if plans[p["nickname"]] == "Business":
            assert_true("business_class" in flags, f"{p['nickname']} has business_class flag")
            assert_true("Lounge" in v["node"]["title"], f"{p['nickname']} in Lounge")
        else:
            assert_true("economy" in flags, f"{p['nickname']} has economy flag")
            assert_true("Terminal" in v["node"]["title"], f"{p['nickname']} in Terminal")

    print("\n== 9. Drive everyone to Boarding Gate 42 (location gate) ==")
    # Ava: accepts warm towel -> VIP perk -> gate
    # Cara: heads straight to gate
    # Bea: helps child (kind_deed) -> gate
    def advance_via(nickname_kw, choice_kw):
        p = next(p for p in players if p["nickname"] == nickname_kw)
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        v = r.json()
        choice = next((c for c in v["choices"] if choice_kw.lower() in c["text"].lower()), None)
        assert_true(choice is not None, f"{nickname_kw} sees choice matching '{choice_kw}'")
        r = api("POST", f"/rooms/{code}/players/{p['id']}/choose", json={"choice_id": choice["id"]})
        assert_true(r.status_code == 200, f"{nickname_kw} advanced via '{choice_kw}'")

    advance_via("Ava", "warm towel")   # to VIP perk
    advance_via("Ava", "boarding gate")  # to gate

    advance_via("Cara", "boarding gate")

    advance_via("Bea", "pick up")

    # After these, all should be at Boarding Gate 42
    print("\n== 10. All players should be at the location gate; nobody can proceed alone ==")
    # Try to advance one player from the gate — should fail because the gate's only choice targets vote node, but is_location_gate must have all reached (they should be all reached now).
    # Actually all 3 have reached now. Check waiting.complete = True for each.
    for p in players:
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        v = r.json()
        assert_true(v["node"]["title"] == "Boarding Gate 42", f"{p['nickname']} at Boarding Gate 42")
        w = v.get("waiting") or {}
        assert_true(w.get("type") == "location_gate", f"{p['nickname']} sees location gate waiting")
        assert_true(w.get("complete") is True, f"{p['nickname']} sees gate complete (all arrived)")

    print("\n== 10b. Simulate scenario where not everyone arrived (retest) ==")
    # Reset room and only 2 arrive at gate then a 3rd tries to progress from gate
    api("POST", f"/rooms/{code}/reset")
    api("POST", f"/rooms/{code}/start")
    # send Ava and Cara to gate; leave Bea at start
    advance_via("Ava", "business")  # to lounge
    advance_via("Ava", "boarding gate")  # gate
    advance_via("Cara", "business")
    advance_via("Cara", "boarding gate")
    # Now Ava tries to progress from the gate — should be blocked because Bea not yet there.
    p_ava = next(p for p in players if p["nickname"] == "Ava")
    r = api("GET", f"/rooms/{code}/players/{p_ava['id']}/view")
    v = r.json()
    assert_true(v["node"]["title"] == "Boarding Gate 42", "Ava at gate")
    assert_true(v["waiting"]["complete"] is False, "gate not complete (Bea missing)")
    # Try to choose
    if v["choices"]:
        r = api("POST", f"/rooms/{code}/players/{p_ava['id']}/choose", json={"choice_id": v["choices"][0]["id"]})
        assert_true(r.status_code == 400, "Ava blocked from advancing past incomplete gate")
    # Bring Bea to gate
    advance_via("Bea", "economy")
    advance_via("Bea", "boarding gate")
    # Now everyone can proceed; ONE player choosing at the gate advances the whole group.
    p0 = next(p for p in players if p["nickname"] == "Ava")
    r = api("GET", f"/rooms/{code}/players/{p0['id']}/view")
    v = r.json()
    assert_true(v["waiting"]["complete"] is True, "Ava sees gate complete")
    choice = v["choices"][0]
    r = api("POST", f"/rooms/{code}/players/{p0['id']}/choose", json={"choice_id": choice["id"]})
    assert_true(r.status_code == 200, "Ava advanced the group past the gate")
    # Verify everyone advanced together
    for name in ["Ava", "Bea", "Cara"]:
        p = next(p for p in players if p["nickname"] == name)
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        v = r.json()
        assert_true(v["node"]["is_vote_gate"] is True, f"{name} advanced to vote gate with the group")

    print("\n== 11. Vote gate: 2 vote Paris, 1 votes Tokyo → majority Paris ==")
    for p in players:
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        v = r.json()
        assert_true(v["node"]["is_vote_gate"] is True, f"{p['nickname']} at vote gate")

    def vote_for(nickname, choice_kw):
        p = next(p for p in players if p["nickname"] == nickname)
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        v = r.json()
        c = next(cc for cc in v["node"]["choices"] if choice_kw.lower() in cc["text"].lower())
        r = api("POST", f"/rooms/{code}/players/{p['id']}/vote", json={"choice_id": c["id"]})
        assert_true(r.status_code == 200, f"{nickname} voted {choice_kw}")

    vote_for("Ava", "Paris")
    vote_for("Bea", "Paris")
    # Cannot vote twice
    r_dup = api("POST", f"/rooms/{code}/players/{next(p for p in players if p['nickname']=='Ava')['id']}/vote", json={"choice_id": "whatever"})
    assert_true(r_dup.status_code == 400, "double-vote rejected")
    vote_for("Cara", "Tokyo")

    # After the third vote, resolution should apply — all move to Paris ending.
    for p in players:
        r = api("GET", f"/rooms/{code}/players/{p['id']}/view")
        v = r.json()
        assert_true(v["node"]["title"] == "Ending — Paris", f"{p['nickname']} at Paris ending")
        assert_true(v["node"]["is_end"] is True, f"{p['nickname']} at end node")

    print("\n== 12. Admin auth ==")
    r = api("POST", "/admin/login", json={"password": "wrong"})
    assert_true(r.status_code == 401, "bad admin password rejected")
    r = api("POST", "/admin/login", json={"password": "admin123"})
    assert_true(r.status_code == 200, "good admin password accepted")
    token = r.json()["token"]

    r = api("GET", "/admin/stories", headers={"X-Admin-Token": token})
    assert_true(r.status_code == 200, "admin can list stories")
    r = api("GET", "/admin/stories")
    assert_true(r.status_code == 401, "unauth admin call rejected")

    r = api("GET", f"/admin/stories/{story_id}/graph", headers={"X-Admin-Token": token})
    assert_true(r.status_code == 200, "admin can load story graph")
    graph = r.json()
    assert_true(len(graph["nodes"]) == 8, f"Zayn story has 8 nodes (got {len(graph['nodes'])})")

    print("\nALL POC TESTS PASSED")


if __name__ == "__main__":
    main()
