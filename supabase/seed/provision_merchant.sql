-- Run by a trusted operator in the Supabase SQL editor. Replace every placeholder; never commit real data.
-- Verify the coordinates on site: stand at a safe public entrance and read them from a trusted map.
with m as (
  insert into public.merchants (name, slug, description, contact_email)
  values ('REPLACE: Business name', 'replace-business-slug', 'REPLACE: one-line description', 'owner@example.com')
  returning id
), mem as (
  insert into public.merchant_memberships (merchant_id, user_id, role)
  select m.id, 'REPLACE-AUTH-USER-UUID'::uuid, 'owner' from m
  returning merchant_id
)
insert into public.merchant_locations (merchant_id, name, address, location, geofence_radius_m)
select mem.merchant_id, 'Main entrance', 'REPLACE: verified street address',
       extensions.st_setsrid(extensions.st_makepoint(0.0 /* REPLACE longitude */, 0.0 /* REPLACE latitude */), 4326)::extensions.geography,
       60
from mem;
