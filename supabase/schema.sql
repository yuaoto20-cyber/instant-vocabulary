create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text not null default '', sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.word_sets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade, name text not null, description text not null default '', sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid not null references public.word_sets(id) on delete cascade, order_index integer not null,
  english text not null, japanese text not null, note text not null default '', part_of_speech text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists folders_user_sort_idx on public.folders(user_id, sort_order, created_at);
create index if not exists word_sets_folder_sort_idx on public.word_sets(folder_id, sort_order, created_at);
create index if not exists cards_set_order_idx on public.cards(set_id, order_index);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create or replace trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create or replace trigger folders_updated_at before update on public.folders for each row execute function public.set_updated_at();
create or replace trigger word_sets_updated_at before update on public.word_sets for each row execute function public.set_updated_at();
create or replace trigger cards_updated_at before update on public.cards for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles(id) values(new.id) on conflict do nothing; return new; end; $$;
create or replace trigger auth_user_profile after insert on auth.users for each row execute function public.create_profile_for_user();

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.word_sets enable row level security;
alter table public.cards enable row level security;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own" on public.profiles for delete using (id = auth.uid());
create policy "folders_all_own" on public.folders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sets_all_own" on public.word_sets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cards_all_own" on public.cards for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.bulk_import_cards(p_set_id uuid, p_user_id uuid, p_creates jsonb, p_updates jsonb)
returns table(created_count integer, updated_count integer, total_count integer) language plpgsql as $$
declare create_count integer := 0; update_count integer := 0; item jsonb;
begin
  if p_user_id <> auth.uid() or not exists(select 1 from public.word_sets where id = p_set_id and user_id = auth.uid()) then raise exception 'not authorized'; end if;
  for item in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    update public.cards set english = item->>'english', japanese = item->>'japanese', note = coalesce(item->>'note',''), part_of_speech = coalesce(item->>'partOfSpeech','') where id = (item->>'id')::uuid and set_id = p_set_id and user_id = auth.uid(); update_count := update_count + 1;
  end loop;
  insert into public.cards(user_id,set_id,order_index,english,japanese,note,part_of_speech)
  select p_user_id,p_set_id,(select coalesce(max(order_index),0) from public.cards where set_id=p_set_id)+row_number() over (),value->>'english',value->>'japanese',coalesce(value->>'note',''),coalesce(value->>'partOfSpeech','') from jsonb_array_elements(coalesce(p_creates,'[]'::jsonb));
  get diagnostics create_count = row_count;
  return query select create_count, update_count, (select count(*)::integer from public.cards where set_id=p_set_id and user_id=auth.uid());
end; $$;
