-- Narrative RPG Engine — Supabase Schema
-- Run this once in the Supabase SQL Editor (or via migrate.py) before starting the backend.

-- Stories: root of the content graph
create table if not exists stories (
  id            text primary key,
  title         text not null,
  description   text not null default '',
  start_node_id text,                         -- no FK: circular dep with nodes
  created_at    text not null default ''
);

-- Nodes: graph nodes belonging to a story; choices embedded as JSONB
create table if not exists nodes (
  id               text primary key,
  story_id         text not null references stories(id) on delete cascade,
  title            text not null default '',
  story_text       text not null default '',
  character        text not null default '',
  position_x       double precision not null default 0,
  position_y       double precision not null default 0,
  is_location_gate boolean not null default false,
  is_vote_gate     boolean not null default false,
  is_end           boolean not null default false,
  choices          jsonb not null default '[]'::jsonb
  -- choices schema: [{id, text, destination_node_id, sets_flag, requires_flag}, ...]
);

-- Rooms: one active session per room code
create table if not exists rooms (
  code                   text primary key,
  story_id               text references stories(id),
  started                boolean not null default false,
  current_node_id        text,               -- no FK: nodes may be from any story
  phase                  text not null default 'lobby',
  phase_ends_at          text,
  flags                  jsonb not null default '[]'::jsonb,
  wheel_options          jsonb,
  wheel_winner_choice_id text,
  created_at             text not null default ''
);

-- Players: joined players per room
create table if not exists players (
  id        text primary key,
  room_code text not null references rooms(code) on delete cascade,
  nickname  text not null,
  joined_at text not null default '',
  is_host   boolean not null default false
);

-- Votes: one vote per player per node per room (unique enforced below)
create table if not exists votes (
  id         text primary key,
  room_code  text not null references rooms(code) on delete cascade,
  node_id    text not null,
  player_id  text not null references players(id) on delete cascade,
  choice_id  text not null,
  created_at text not null default ''
);

-- Indexes for common query patterns
create index if not exists nodes_story_id_idx      on nodes(story_id);
create index if not exists players_room_code_idx   on players(room_code);
create index if not exists votes_room_node_idx     on votes(room_code, node_id);
-- Prevent double-voting at the database level
create unique index if not exists votes_no_double_vote
  on votes(room_code, node_id, player_id);
