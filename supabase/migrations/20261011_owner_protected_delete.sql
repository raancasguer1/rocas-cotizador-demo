-- ROCAS: eliminación protegida y recuperable de enlaces y mensajes.
-- No borra presupuestos ni destruye filas: solo oculta y cierra el acceso.
alter table public.rocas_quote_shares
  add column if not exists deleted_at timestamptz;
alter table public.rocas_quote_messages
  add column if not exists deleted_at timestamptz;

create index if not exists rocas_quote_shares_visible_owner_idx
  on public.rocas_quote_shares (user_id, created_at desc)
  where deleted_at is null;
create index if not exists rocas_quote_messages_visible_thread_idx
  on public.rocas_quote_messages (share_id, created_at asc)
  where deleted_at is null;
