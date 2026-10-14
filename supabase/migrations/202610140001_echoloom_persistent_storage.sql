create table if not exists public.echoloom_activity (
  chain_id integer not null check (chain_id = 10143),
  hub_address text not null check (hub_address ~ '^0x[0-9a-f]{40}$'),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  block_number bigint not null check (block_number >= 0),
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  event_type text not null check (event_type in (
    'LoomCreated','LoomUpdated','LoomDeactivated','PostCreated','AttentionStaked','StakeWithdrawn',
    'TipDispatched','RewardFunded','RewardClaimed','CreatorWithdrawal','CuratorWithdrawal',
    'ProtocolFeeWithdrawn','ConfigurationUpdated','PauseUpdated','OwnershipTransferred'
  )),
  wallet_address text check (wallet_address is null or wallet_address ~ '^0x[0-9a-f]{40}$'),
  loom_id text check (loom_id is null or loom_id ~ '^\d{1,78}$'),
  post_id text check (post_id is null or post_id ~ '^\d{1,78}$'),
  amount_wei text check (amount_wei is null or amount_wei ~ '^\d{1,78}$'),
  allocation smallint check (allocation is null or allocation between 0 and 2),
  args jsonb not null default '{}'::jsonb,
  confirmed boolean not null check (confirmed = true),
  observed_at timestamptz not null default now(),
  primary key (chain_id, hub_address, transaction_hash, log_index)
);
create index if not exists echoloom_activity_wallet_page on public.echoloom_activity (chain_id, hub_address, wallet_address, block_number desc, log_index desc);
create index if not exists echoloom_activity_loom_page on public.echoloom_activity (chain_id, hub_address, loom_id, block_number desc, log_index desc);
create index if not exists echoloom_activity_recent_page on public.echoloom_activity (chain_id, hub_address, block_number desc, log_index desc);

create table if not exists public.echoloom_indexer_state (
  chain_id integer not null check (chain_id = 10143),
  hub_address text not null check (hub_address ~ '^0x[0-9a-f]{40}$'),
  block_number bigint not null check (block_number >= 0),
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
  polled_at timestamptz not null,
  primary key (chain_id, hub_address)
);

alter table public.echoloom_activity enable row level security;
alter table public.echoloom_indexer_state enable row level security;
revoke all on public.echoloom_activity, public.echoloom_indexer_state from anon, authenticated;
grant all on public.echoloom_activity, public.echoloom_indexer_state to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('echoloom-content', 'echoloom-content', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif','text/plain','text/markdown','application/json'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
