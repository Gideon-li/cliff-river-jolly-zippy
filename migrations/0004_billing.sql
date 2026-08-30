-- Wallet, plans, payments, usage.

alter table profiles add column if not exists plan text not null default 'payg';
alter table profiles add column if not exists plan_until timestamptz;
alter table profiles add column if not exists credits integer not null default 3;
alter table profiles add column if not exists lifetime_free boolean not null default false;

create table if not exists payments (
  id text primary key,
  user_id text not null,
  channel text not null,
  sku text not null,
  amount_fen integer not null,
  credits integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists payments_user_id_idx on payments (user_id, created_at desc);

create table if not exists usage_ledger (
  id serial primary key,
  user_id text not null,
  session_id text,
  kind text not null default 'cast',
  credits integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists usage_ledger_user_id_idx on usage_ledger (user_id, created_at desc);
