create table if not exists public.recipe_requests (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 4 and 240),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  legacy_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  category text not null check (category in ('Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Dessert')),
  cooking_time integer not null check (cooking_time between 1 and 1440),
  ingredients text[] not null check (cardinality(ingredients) between 2 and 100),
  steps text[] not null check (cardinality(steps) between 1 and 100),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  request_id uuid references public.recipe_requests(id) on delete set null,
  legacy_key text unique,
  created_at timestamptz not null default now()
);

alter table public.recipe_requests enable row level security;
alter table public.recipes enable row level security;

drop policy if exists "Signed-in members can read recipe requests" on public.recipe_requests;
create policy "Signed-in members can read recipe requests"
  on public.recipe_requests for select to authenticated
  using (true);

drop policy if exists "Members can create their own recipe requests" on public.recipe_requests;
create policy "Members can create their own recipe requests"
  on public.recipe_requests for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists "Members can delete their own recipe requests" on public.recipe_requests;
create policy "Members can delete their own recipe requests"
  on public.recipe_requests for delete to authenticated
  using (author_id = (select auth.uid()));

drop policy if exists "Signed-in members can read recipes" on public.recipes;
create policy "Signed-in members can read recipes"
  on public.recipes for select to authenticated
  using (true);

drop policy if exists "Members can create recipes as themselves" on public.recipes;
create policy "Members can create recipes as themselves"
  on public.recipes for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists "Members can edit their own recipes" on public.recipes;
create policy "Members can edit their own recipes"
  on public.recipes for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "Members can delete their own recipes" on public.recipes;
create policy "Members can delete their own recipes"
  on public.recipes for delete to authenticated
  using (author_id = (select auth.uid()));

grant select, insert, delete on public.recipe_requests to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
