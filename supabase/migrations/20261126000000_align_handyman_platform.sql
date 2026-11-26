create extension if not exists pgcrypto;

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  slogan text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  accent_color text not null default '#0f5c5c',
  footer text not null default '',
  bank_details text not null default '',
  logo_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id)
);

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_name text not null,
  provider_name text,
  policy_reference text not null,
  expiry_date date not null,
  coverage_limit numeric(14,2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_reference text not null,
  document_type text not null check (document_type in ('QUOTE', 'INVOICE', 'QA', 'LEGAL')),
  storage_path text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, document_reference)
);

alter table public.business_profiles enable row level security;
alter table public.insurance_policies enable row level security;
alter table public.generated_documents enable row level security;

drop policy if exists "Users manage their business profile" on public.business_profiles;
create policy "Users manage their business profile"
  on public.business_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their insurance policies" on public.insurance_policies;
create policy "Users manage their insurance policies"
  on public.insurance_policies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their generated documents" on public.generated_documents;
create policy "Users manage their generated documents"
  on public.generated_documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('branding', 'branding', false),
       ('generated-pdfs', 'generated-pdfs', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users read their branding assets" on storage.objects;
create policy "Users read their branding assets"
  on storage.objects for select
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload their branding assets" on storage.objects;
create policy "Users upload their branding assets"
  on storage.objects for insert
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their branding assets" on storage.objects;
create policy "Users update their branding assets"
  on storage.objects for update
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their branding assets" on storage.objects;
create policy "Users delete their branding assets"
  on storage.objects for delete
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users read their generated PDFs" on storage.objects;
create policy "Users read their generated PDFs"
  on storage.objects for select
  using (bucket_id = 'generated-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload their generated PDFs" on storage.objects;
create policy "Users upload their generated PDFs"
  on storage.objects for insert
  with check (bucket_id = 'generated-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their generated PDFs" on storage.objects;
create policy "Users update their generated PDFs"
  on storage.objects for update
  using (bucket_id = 'generated-pdfs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'generated-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their generated PDFs" on storage.objects;
create policy "Users delete their generated PDFs"
  on storage.objects for delete
  using (bucket_id = 'generated-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
