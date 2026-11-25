-- Satır İzi için Supabase tabloları (Emanet ve SEFER ile aynı projede, ayrı tablolar).
-- Supabase paneli → SQL Editor → New query → bu dosyanın tamamını yapıştırıp "Run".
-- Birden çok kez çalıştırılabilir; mevcut veriyi silmez.

-- 1) Her kullanıcının Satır İzi verisi tek satırda: kitaplar, alıntılar, notlar, silme kayıtları,
--    eşitlenen ayarlar ve (kullanıcı seçtiği için) Gemini API anahtarı.
--    Satır güvenliği (RLS): yalnızca sahibi okuyup yazabilir; anon anahtarla başkası erişemez.
create table if not exists public.satir_izi_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb  not null,
  updated_at bigint not null default 0
);
alter table public.satir_izi_state enable row level security;

drop policy if exists "satir_izi_state_sahibi" on public.satir_izi_state;
create policy "satir_izi_state_sahibi" on public.satir_izi_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
revoke all on public.satir_izi_state from anon;
grant select, insert, update, delete on public.satir_izi_state to authenticated;

-- 2) Otomatik günlük yedek: her günün son hâli (30 gün). API anahtarı yedeğe girmez.
create table if not exists public.satir_izi_backup (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  data       jsonb not null,
  meta       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.satir_izi_backup enable row level security;

drop policy if exists "satir_izi_backup_sahibi" on public.satir_izi_backup;
create policy "satir_izi_backup_sahibi" on public.satir_izi_backup
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
revoke all on public.satir_izi_backup from anon;
grant select, insert, update, delete on public.satir_izi_backup to authenticated;
