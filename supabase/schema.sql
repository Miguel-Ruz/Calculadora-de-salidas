-- Supabase schema for Divide
-- Ejecuta este archivo en el SQL Editor de Supabase

create extension if not exists "pgcrypto";

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists trip_people (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists trip_people_unique_name
  on trip_people (trip_id, lower(name));

create table if not exists outings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists outing_participants (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references outings(id) on delete cascade,
  person_id uuid not null references trip_people(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists outing_participants_unique
  on outing_participants (outing_id, person_id);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references outings(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payer_id uuid not null references trip_people(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table trips enable row level security;
alter table trip_people enable row level security;
alter table outings enable row level security;
alter table outing_participants enable row level security;
alter table expenses enable row level security;

create policy "Trips are owned by user" on trips
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Trip people by trip owner" on trip_people
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_people.trip_id
        and trips.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_people.trip_id
        and trips.user_id = auth.uid()
    )
  );

create policy "Outings by trip owner" on outings
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = outings.trip_id
        and trips.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = outings.trip_id
        and trips.user_id = auth.uid()
    )
  );

create policy "Outing participants by trip owner" on outing_participants
  for all
  using (
    exists (
      select 1
      from outings
      join trips on trips.id = outings.trip_id
      where outings.id = outing_participants.outing_id
        and trips.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from outings
      join trips on trips.id = outings.trip_id
      where outings.id = outing_participants.outing_id
        and trips.user_id = auth.uid()
    )
  );

create policy "Expenses by trip owner" on expenses
  for all
  using (
    exists (
      select 1
      from outings
      join trips on trips.id = outings.trip_id
      where outings.id = expenses.outing_id
        and trips.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from outings
      join trips on trips.id = outings.trip_id
      where outings.id = expenses.outing_id
        and trips.user_id = auth.uid()
    )
  );
