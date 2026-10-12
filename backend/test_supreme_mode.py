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
    nodes = {f'n{i}': {'id': f'n{i}', 'story_id': 'story', 'choices': [{'id': f'c{i}', 'text': 'Go', 'destination_node_id': f'n{i+1}', 'sets_flag': f'f{i}'}]} for i in range(5)}
    nodes['n5'] = {'id': 'n5', 'story_id': 'story', 'is_end': True, 'choices': []}
    async def room(code): return dict(db.rows['rooms'][0])
    async def node(nid): return nodes[nid]
    async def story(sid): return {'id': sid, 'title': 'Shoug’s Tale'}
    monkeypatch.setattr(server, 'get_story', story)
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
        host = server.Player(room_code='TEST', nickname='tEsT 99', is_host=True)
        db.rows['players'].append(host.model_dump())
        db.rows['rooms'][0].update(story_id='story', wheel_options=[{'supreme_v1': True, 'creator_id': host.id, 'history': []}])
        await server.join_room('TEST', server.RoomJoinRequest(nickname='Guest'))
        await server.advance_to_node('TEST', 'n0', [])
        for i in range(5):
            # Re-read persisted data each time, as a refresh/reconnect does.
            assert await server.is_supreme_room('TEST')
            assert db.rows['rooms'][0]['phase_ends_at'] is None
            await server.cast_vote('TEST', server.VoteRequest(player_id=host.id, choice_id=f'c{i}', node_id=f'n{i}', session_token=host.session_token, visit_id=db.rows['rooms'][0]['wheel_winner_choice_id']))
            assert db.rows['rooms'][0]['current_node_id'] == f'n{i+1}'
            if i < 4:
                with pytest.raises(HTTPException) as stale:
                    await server.cast_vote('TEST', server.VoteRequest(player_id=host.id, choice_id=f'c{i}', node_id=f'n{i}', session_token=host.session_token, visit_id=db.rows['rooms'][0]['wheel_winner_choice_id']))
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


@pytest.mark.parametrize('nickname', ['Test99', 'test99', 'TEST99', 'Test 99', ' T e s t 9 9 '])
def test_create_room_activates_mode_before_first_client_join(monkeypatch, nickname):
    db = DB(nickname)
    monkeypatch.setattr(server, 'supa', db)
    monkeypatch.setattr(server, 'generate_room_code', lambda: 'NEW99')
    async def get_room(code):
        return next((dict(row) for row in db.rows['rooms'] if row['code'] == code), None)
    monkeypatch.setattr(server, 'get_room', get_room)
    async def exercise():
        result = await server.create_room(server.RoomCreateRequest(nickname=nickname))
        assert result['code'] == 'NEW99'
        assert result['supreme_test_mode'] is True
        assert result['player']['is_host']
        assert await server.is_supreme_room('NEW99')
        assert len([p for p in db.rows['players'] if p['room_code'] == 'NEW99']) == 1
    asyncio.run(exercise())


def test_normal_creation_cannot_enable_supreme_mode(monkeypatch):
    db = DB('Normal')
    monkeypatch.setattr(server, 'supa', db)
    monkeypatch.setattr(server, 'generate_room_code', lambda: 'NEW99')
    async def get_room(code):
        return next((dict(row) for row in db.rows['rooms'] if row['code'] == code), None)
    monkeypatch.setattr(server, 'get_room', get_room)
    async def exercise():
        result = await server.create_room(server.RoomCreateRequest(nickname='Normal'))
        assert result['supreme_test_mode'] is False
        assert not await server.is_supreme_room('NEW99')
    asyncio.run(exercise())


def test_guest_and_missing_host_token_cannot_advance_test_room(monkeypatch):
    db = DB('Test99')
    db.rows['rooms'][0].update(phase='voting', current_node_id='n0', wheel_options=[{'supreme_v1': True, 'creator_id': 'host', 'history': []}], wheel_winner_choice_id='visit')
    db.rows['players'] = [
        {'id': 'host', 'nickname': 'Test99', 'is_host': True, 'room_code': 'TEST', 'session_token': 'valid-token'},
        {'id': 'guest', 'nickname': 'Guest', 'is_host': False, 'room_code': 'TEST', 'session_token': 'guest-token'},
    ]
    monkeypatch.setattr(server, 'supa', db)
    async def room(code): return dict(db.rows['rooms'][0])
    async def player(pid): return next(p for p in db.rows['players'] if p['id'] == pid)
    async def node(nid): return {'id': nid, 'choices': [{'id': 'c0', 'destination_node_id': 'n1'}]}
    monkeypatch.setattr(server, 'get_room', room)
    monkeypatch.setattr(server, 'get_player', player)
    monkeypatch.setattr(server, 'get_node', node)
    async def exercise():
        for pid, token in [('guest', 'guest-token'), ('host', ''), ('host', 'invalid')]:
            with pytest.raises(HTTPException) as err:
                await server.cast_vote('TEST', server.VoteRequest(
                    player_id=pid, choice_id='c0', node_id='n0', session_token=token, visit_id='visit'))
            assert err.value.status_code == 403
        assert db.rows['rooms'][0]['current_node_id'] == 'n0'
    asyncio.run(exercise())


@pytest.fixture
def control_room(monkeypatch):
    db = DB('Test99')
    db.rows['rooms'][0].update(story_id='s1', started=True, current_node_id=None,
        wheel_options=[{'supreme_v1': True, 'creator_id': 'host', 'history': []}])
    db.rows['players'] = [{'id': 'host', 'nickname': 'Test99', 'is_host': True,
        'room_code': 'TEST', 'session_token': 'secret'}, {'id': 'guest', 'nickname': 'Guest',
        'is_host': False, 'room_code': 'TEST', 'session_token': 'guest-token'}]
    nodes = {
        'a': {'id': 'a', 'story_id': 's1', 'story_text': 'London', 'choices': [
            {'id': 'left', 'text': 'Left', 'destination_node_id': 'b', 'sets_flag': 'left'},
            {'id': 'right', 'text': 'Right', 'destination_node_id': 'c'},
            {'id': 'loop', 'text': 'Loop', 'destination_node_id': 'a'},
            {'id': 'end', 'text': 'End', 'destination_node_id': None}]},
        'b': {'id': 'b', 'story_id': 's1', 'node_type': 'narration', 'narration_next_node_id': 'c'},
        'c': {'id': 'c', 'story_id': 's1', 'is_end': True, 'choices': []},
        'other': {'id': 'other', 'story_id': 's2', 'is_end': True, 'choices': []},
    }
    stories = {'s1': {'id': 's1', 'title': 'Shoug’s Tale', 'start_node_id': 'a'},
               's2': {'id': 's2', 'title': 'Other Tale', 'start_node_id': 'other'}}
    db.rows['nodes'] = list(nodes.values())
    monkeypatch.setattr(server, 'supa', db)
    async def room(code): return dict(db.rows['rooms'][0]) if code == 'TEST' else None
    async def node(nid): return nodes.get(nid)
    async def story(sid): return stories.get(sid)
    async def player(pid): return next((p for p in db.rows['players'] if p['id'] == pid), None)
    broadcasts = []
    async def broadcast(code):
        state = await server.compute_room_state(code)
        broadcasts.append(state)
        return state
    monkeypatch.setattr(server, 'get_room', room)
    monkeypatch.setattr(server, 'get_node', node)
    monkeypatch.setattr(server, 'get_story', story)
    monkeypatch.setattr(server, 'get_player', player)
    monkeypatch.setattr(server, 'broadcast_room_state', broadcast)
    return db, broadcasts


def control_payload(db, action, **extra):
    return server.TestControlRequest(action=action, player_id='host', session_token='secret',
        visit_id=db.rows['rooms'][0]['wheel_winner_choice_id'], **extra)


def vote_payload(db, choice):
    room = db.rows['rooms'][0]
    return server.VoteRequest(player_id='host', session_token='secret', choice_id=choice,
        node_id=room['current_node_id'], visit_id=room['wheel_winner_choice_id'])


def test_controls_branch_flags_and_reconnection(control_room):
    db, broadcasts = control_room
    async def exercise():
        await server.advance_to_node('TEST', 'a', [])
        stale = vote_payload(db, 'left')
        result = await server.cast_vote('TEST', stale)
        assert result['room']['current_node_id'] == 'b'
        assert result['room']['phase'] == 'narration'
        assert result['room']['flags'] == ['left']
        await server.test_control('TEST', control_payload(db, 'back'))
        assert db.rows['rooms'][0]['current_node_id'] == 'a'
        assert db.rows['rooms'][0]['flags'] == []
        with pytest.raises(HTTPException) as err:
            await server.cast_vote('TEST', stale)
        assert err.value.status_code == 409
        await server.test_control('TEST', control_payload(db, 'jump', node_id='c'))
        assert db.rows['rooms'][0]['phase'] == 'ended'
        await server.test_control('TEST', control_payload(db, 'restart_node'))
        await server.test_control('TEST', control_payload(db, 'restart_story'))
        assert db.rows['rooms'][0]['current_node_id'] == 'a'
        assert db.rows['rooms'][0]['phase_ends_at'] is None
        refreshed = await server.compute_room_state('TEST')
        assert refreshed['room']['supreme_test_mode']
        assert refreshed['room']['wheel_options'] is None
        assert refreshed['room']['node_visit_id'] == db.rows['rooms'][0]['wheel_winner_choice_id']
        assert broadcasts[-1]['room']['current_node_id'] == refreshed['room']['current_node_id']
        await server.test_control('TEST', control_payload(db, 'switch_story', story_id='s2'))
        assert db.rows['rooms'][0]['story_id'] == 's2'
        assert db.rows['rooms'][0]['current_node_id'] == 'other'
        assert db.rows['rooms'][0]['presentation'] == 'classic'
        await server.test_control('TEST', control_payload(db, 'switch_story', story_id='s1', presentation='shoug2'))
        assert db.rows['rooms'][0]['presentation'] == 'shoug2'
        assert len(broadcasts) >= 8
    asyncio.run(exercise())


def test_controls_reject_guests_and_foreign_nodes(control_room):
    db, _ = control_room
    async def exercise():
        await server.advance_to_node('TEST', 'a', [])
        for payload in [control_payload(db, 'jump', node_id='other'),
                        server.TestControlRequest(action='restart_story', player_id='guest', session_token='guest-token', visit_id='visit')]:
            with pytest.raises(HTTPException):
                await server.test_control('TEST', payload)
        for fn, payload in [(server.start_room, server.RoomSessionRequest()),
                            (server.reset_room, server.RoomSessionRequest()),
                            (server.select_story, server.RoomSelectStoryRequest(story_id='s2'))]:
            with pytest.raises(HTTPException) as err:
                await fn('TEST', payload)
            assert err.value.status_code == 403
        assert db.rows['rooms'][0]['current_node_id'] == 'a'
    asyncio.run(exercise())


def test_self_loop_concurrency_and_dangling_end_preserve_mode(control_room):
    db, _ = control_room
    async def exercise():
        await server.advance_to_node('TEST', 'a', [])
        payload = vote_payload(db, 'loop')
        results = await asyncio.gather(server.cast_vote('TEST', payload), server.cast_vote('TEST', payload), return_exceptions=True)
        assert sum(isinstance(r, HTTPException) for r in results) == 1
        assert db.rows['rooms'][0]['current_node_id'] == 'a'
        await server.cast_vote('TEST', vote_payload(db, 'end'))
        assert db.rows['rooms'][0]['phase'] == 'ended'
        assert await server.is_supreme_room('TEST')
        await server.test_control('TEST', control_payload(db, 'restart_story'))
        await server.cast_vote('TEST', vote_payload(db, 'left'))
        visit = db.rows['rooms'][0]['wheel_winner_choice_id']
        await server.advance_narration('TEST', server.NarrationAdvanceRequest(player_id='host', session_token='secret', visit_id=visit))
        assert db.rows['rooms'][0]['current_node_id'] == 'c'
        assert db.rows['rooms'][0]['phase'] == 'ended'
    asyncio.run(exercise())


def test_first_join_of_empty_room_never_activates_mode(monkeypatch):
    db = DB('Test99')
    monkeypatch.setattr(server, 'supa', db)
    async def room(code): return dict(db.rows['rooms'][0])
    async def broadcast(code): pass
    monkeypatch.setattr(server, 'get_room', room)
    monkeypatch.setattr(server, 'broadcast_room_state', broadcast)
    async def exercise():
        await server.join_room('TEST', server.RoomJoinRequest(nickname='Test99'))
        assert not await server.is_supreme_room('TEST')
    asyncio.run(exercise())


def test_http_and_websocket_authoritative_state(control_room):
    from fastapi.testclient import TestClient
    db, _ = control_room
    client = TestClient(server.app)
    asyncio.run(server.advance_to_node('TEST', 'a', []))
    with client.websocket_connect('/api/ws/rooms/TEST') as ws:
        snapshot = ws.receive_json()
        assert snapshot['type'] == 'room_state'
        assert snapshot['state']['room']['supreme_test_mode'] is True
        assert snapshot['state']['room']['phase_ends_at'] is None
    payload = vote_payload(db, 'right').model_dump()
    response = client.post('/api/rooms/TEST/vote', json=payload)
    assert response.status_code == 200
    assert response.json()['room']['current_node_id'] == 'c'
    refreshed = client.get('/api/rooms/TEST').json()
    assert refreshed['room']['current_node_id'] == 'c'
    with client.websocket_connect('/api/ws/rooms/TEST') as ws:
        assert ws.receive_json()['state']['room']['current_node_id'] == 'c'
