import asyncio
from types import SimpleNamespace

import server
import pytest
from fastapi import HTTPException


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, {}
        self.operation, self.payload, self.single = 'select', None, False
    def select(self, *args, **kwargs): return self
    def eq(self, key, value): self.filters[key] = value; return self
    def maybe_single(self): self.single = True; return self
    def insert(self, payload): self.operation, self.payload = 'insert', payload; return self
    def update(self, payload): self.operation, self.payload = 'update', payload; return self
    def delete(self): self.operation = 'delete'; return self
    def execute(self):
        rows = self.db.rows[self.table]
        matching = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        if self.operation == 'insert': rows.append(self.payload)
        if self.operation == 'update':
            for row in matching: row.update(self.payload)
        if self.operation == 'delete':
            for row in matching: rows.remove(row)
        return SimpleNamespace(data=(matching[0] if matching else None) if self.single else matching, count=len(matching))


class DB:
    def __init__(self, nickname):
        self.rows = {'rooms': [{'code': 'TEST', 'phase': 'lobby', 'flags': []}], 'players': [], 'votes': []}
    def table(self, name): return Query(self, name)


def test_consecutive_choices_and_persisted_mode(monkeypatch):
    db = DB('Test 99')
    monkeypatch.setattr(server, 'supa', db)
    nodes = {f'n{i}': {'id': f'n{i}', 'choices': [{'id': f'c{i}', 'text': 'Go', 'destination_node_id': f'n{i+1}', 'sets_flag': f'f{i}'}]} for i in range(5)}
    nodes['n5'] = {'id': 'n5', 'is_end': True, 'choices': []}
    async def room(code): return dict(db.rows['rooms'][0])
    async def node(nid): return nodes[nid]
    async def player(pid): return next(p for p in db.rows['players'] if p['id'] == pid)
    async def broadcast(code): pass
    async def no_timer(code, coro):
        coro.close()
        raise AssertionError('Supreme mode must never schedule a timer')
    monkeypatch.setattr(server, 'get_room', room)
    monkeypatch.setattr(server, 'get_node', node)
    monkeypatch.setattr(server, 'get_player', player)
    monkeypatch.setattr(server, 'broadcast_room_state', broadcast)
    monkeypatch.setattr(server, '_start_phase_task', no_timer)
    async def exercise():
        host = await server.join_room('TEST', server.RoomJoinRequest(nickname='tEsT 99'))
        await server.join_room('TEST', server.RoomJoinRequest(nickname='Guest'))
        await server.advance_to_node('TEST', 'n0', [])
        for i in range(5):
            # Re-read persisted data each time, as a refresh/reconnect does.
            assert await server.is_supreme_room('TEST')
            assert db.rows['rooms'][0]['phase_ends_at'] is None
            await server.cast_vote('TEST', server.VoteRequest(player_id=host.id, choice_id=f'c{i}'))
            assert db.rows['rooms'][0]['current_node_id'] == f'n{i+1}'
            if i < 4:
                with pytest.raises(HTTPException) as stale:
                    await server.cast_vote('TEST', server.VoteRequest(player_id=host.id, choice_id=f'c{i}', node_id=f'n{i}'))
                assert stale.value.status_code == 409
        assert db.rows['rooms'][0]['phase'] == 'ended'
        assert db.rows['rooms'][0]['flags'] == [f'f{i}' for i in range(5)]
    asyncio.run(exercise())


def test_guest_cannot_activate_normal_room(monkeypatch):
    db = DB('Normal')
    db.rows['players'] = [{'id': 'host', 'nickname': 'Normal', 'is_host': True, 'room_code': 'TEST'}, {'id': 'guest', 'nickname': 'Test99', 'is_host': False, 'room_code': 'TEST'}]
    monkeypatch.setattr(server, 'supa', db)
    assert not asyncio.run(server.is_supreme_room('TEST'))


def test_normal_multiplayer_vote_waits_for_other_players(monkeypatch):
    db = DB('Normal')
    db.rows['rooms'][0].update(phase='voting', current_node_id='n0')
    db.rows['players'] = [{'id': 'host', 'nickname': 'Normal', 'is_host': True, 'room_code': 'TEST'}, {'id': 'guest', 'nickname': 'Test99', 'is_host': False, 'room_code': 'TEST'}]
    monkeypatch.setattr(server, 'supa', db)
    async def room(code): return dict(db.rows['rooms'][0])
    async def player(pid): return db.rows['players'][0]
    async def node(nid): return {'id': nid, 'choices': [{'id': 'c0', 'destination_node_id': 'n1'}]}
    async def broadcast(code): pass
    async def must_not_advance(*args, **kwargs): raise AssertionError('Normal room must wait')
    monkeypatch.setattr(server, 'get_room', room)
    monkeypatch.setattr(server, 'get_player', player)
    monkeypatch.setattr(server, 'get_node', node)
    monkeypatch.setattr(server, 'broadcast_room_state', broadcast)
    monkeypatch.setattr(server, 'resolve_votes', must_not_advance)
    asyncio.run(server.cast_vote('TEST', server.VoteRequest(player_id='host', choice_id='c0')))
    assert db.rows['rooms'][0]['current_node_id'] == 'n0'
    assert len(db.rows['votes']) == 1
