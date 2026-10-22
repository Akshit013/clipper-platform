-- Instagram account management and account-to-clip linking.
-- Monetary amounts/rates in this project are interpreted as INR (₹).

create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  handle text not null check (handle ~ '^[a-zA-Z0-9._]{1,30}$'),
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists instagram_accounts_user_handle_unique
  on public.instagram_accounts (user_id, lower(handle));
create index if not exists instagram_accounts_user_active_idx
  on public.instagram_accounts (user_id, is_active, created_at desc);

alter table public.clips
  add column if not exists instagram_account_id uuid
  references public.instagram_accounts(id) on delete set null;
create index if not exists clips_instagram_account_id_idx
  on public.clips(instagram_account_id);

alter table public.instagram_accounts enable row level security;
revoke all on public.instagram_accounts from anon;
grant select, insert, update on public.instagram_accounts to authenticated;

drop policy if exists "instagram accounts owner or admin read" on public.instagram_accounts;
create policy "instagram accounts owner or admin read"
  on public.instagram_accounts for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and p.role = 'admin'
    )
  );

drop policy if exists "users add their own instagram accounts" on public.instagram_accounts;
create policy "users add their own instagram accounts"
  on public.instagram_accounts for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update their own instagram accounts" on public.instagram_accounts;
create policy "users update their own instagram accounts"
  on public.instagram_accounts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Prevent a clipper from associating a clip with an account owned by someone else.
create or replace function public.check_clip_instagram_account_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.instagram_account_id is not null and not exists (
    select 1
    from public.instagram_accounts a
    where a.id = new.instagram_account_id
      and a.user_id = new.user_id
  ) then
    raise exception 'Instagram account must belong to the submitting clipper';
  end if;
  return new;
end;
$$;

drop trigger if exists clips_verify_instagram_account_owner on public.clips;
create trigger clips_verify_instagram_account_owner
before insert or update of instagram_account_id, user_id on public.clips
for each row execute function public.check_clip_instagram_account_owner();

comment on table public.instagram_accounts is 'Instagram handles a clipper has added to organize their reel submissions. Handles are self-reported unless verified through official Instagram OAuth.';
comment on column public.clips.instagram_account_id is 'Optional account selected by the clipper for this Reel submission; nullable for historical clips.';
