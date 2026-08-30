-- 问象 user profiles, divination sessions, chat, usage.

create table if not exists profiles (
  user_id text primary key,
  nickname text not null default '',
  gender text,
  birth_year integer,
  province text,
  city text,
  district text,
  wechat_openid text,
  is_admin boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists divination_sessions (
  id text primary key,
  user_id text not null,
  mode text not null,
  fortune_span text,
  lots_code text,
  event_id text,
  civil_year integer,
  civil_month integer,
  civil_day integer,
  civil_hour integer,
  civil_minute integer,
  hour_name text,
  ju_label text,
  location_json text not null default '{}',
  chart_json text not null default '{}',
  scan_json text not null default '{}',
  pending_json text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id serial primary key,
  session_id text not null,
  user_id text not null,
  role text not null,
  content text not null,
  kind text not null default 'chat',
  created_at timestamptz not null default now()
);

create index if not exists divination_sessions_user_id_idx on divination_sessions (user_id, created_at desc);
create index if not exists messages_session_id_idx on messages (session_id, id);
create index if not exists messages_user_id_idx on messages (user_id);
