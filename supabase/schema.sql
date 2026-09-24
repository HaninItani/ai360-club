-- Run in the Supabase SQL editor. The application accesses these tables only through verified server endpoints.
create extension if not exists pgcrypto;
create table if not exists groups (id uuid primary key default gen_random_uuid(), name text not null unique, grade_level text not null check (grade_level in ('grades12','grades35')), created_at timestamptz not null default now());
create table if not exists students (id uuid primary key default gen_random_uuid(), name text not null, code_hash text not null unique, group_id uuid not null references groups(id), active boolean not null default true, created_at timestamptz not null default now());
create table if not exists conversations (id uuid primary key default gen_random_uuid(), owner_role text not null check(owner_role in ('admin','student')), owner_id uuid not null, title text not null default 'New chat', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references conversations(id) on delete cascade, role text not null check(role in ('user','assistant')), content text not null, image_url text, created_at timestamptz not null default now());
create index if not exists conversations_owner on conversations(owner_role,owner_id,updated_at desc);
create index if not exists messages_conversation on messages(conversation_id,created_at);
create table if not exists classroom (id integer primary key default 1 check(id=1), title text not null default 'Welcome to AI360', prompt text not null default '', updated_at timestamptz not null default now());
insert into groups(name,grade_level) values ('Grades 1–2','grades12'),('Grades 3–5','grades35') on conflict(name) do nothing;
insert into classroom(id) values (1) on conflict(id) do nothing;
alter table groups enable row level security;
alter table students enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table classroom enable row level security;
-- No client policies: service-role endpoints check identity and ownership before any read/write.
insert into storage.buckets(id,name,public) values ('ai360-images','ai360-images',false) on conflict(id) do nothing;
