import asyncio
from types import SimpleNamespace

import server


class FakeQuery:
    def __init__(self, table, player_count, updates):
        self.table = table
        self.player_count = player_count
        self.updates = updates

    def select(self, *args, **kwargs):
        return self

    def update(self, payload):
        if self.table == "rooms":
            self.updates.append(payload)
        return self

    def delete(self):
        return self

    def eq(self, *args):
        return self

    def execute(self):
        count = self.player_count if self.table == "players" else None
        return SimpleNamespace(count=count, data=[])


class FakeSupabase:
    def __init__(self, player_count):
        self.player_count = player_count
        self.updates = []

    def table(self, name):
        return FakeQuery(name, self.player_count, self.updates)


def run_advance(monkeypatch, player_count):
    fake = FakeSupabase(player_count)
    monkeypatch.setattr(server, "supa", fake)

    async def get_node(_node_id):
        return {
            "id": "node-1",
            "node_type": "story",
            "is_end": False,
            "choices": [{"id": "choice-1", "destination_node_id": "node-2"}],
        }

    async def no_broadcast(_code):
        return None

    scheduled = []

    async def capture_task(_code, coroutine):
        scheduled.append(coroutine)
        coroutine.close()

    monkeypatch.setattr(server, "get_node", get_node)
    monkeypatch.setattr(server, "broadcast_room_state", no_broadcast)
    monkeypatch.setattr(server, "_start_phase_task", capture_task)
    asyncio.run(server.advance_to_node("ROOM1", "node-1", []))
    return fake.updates[-1], scheduled


def test_one_player_can_vote_immediately(monkeypatch):
    update, scheduled = run_advance(monkeypatch, player_count=1)
    assert update["phase"] == "voting"
    assert update["phase_ends_at"] is not None
    assert len(scheduled) == 1


def test_multiplayer_keeps_reading_buffer(monkeypatch):
    update, scheduled = run_advance(monkeypatch, player_count=2)
    assert update["phase"] == "reading"
    assert update["phase_ends_at"] is not None
    assert len(scheduled) == 1
