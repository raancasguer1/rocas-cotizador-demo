-- Borradores de contrato de prueba, separados de las cotizaciones reales.
create table if not exists public.rocas_contract_drafts (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null unique references public.rocas_quote_shares(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_number text not null check (char_length(quote_number) between 1 and 80),
  quote_revision integer not null check (quote_revision > 0),
  draft_data jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_data) = 'object'),
  status text not null default 'BORRADOR' check (status = 'BORRADOR'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rocas_contract_drafts_owner_idx
  on public.rocas_contract_drafts (user_id, updated_at desc);

alter table public.rocas_contract_drafts enable row level security;
drop policy if exists rocas_contract_drafts_owner_read on public.rocas_contract_drafts;
create policy rocas_contract_drafts_owner_read
  on public.rocas_contract_drafts
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.rocas_contract_drafts from anon;
grant select on public.rocas_contract_drafts to authenticated;
grant all on public.rocas_contract_drafts to service_role;
