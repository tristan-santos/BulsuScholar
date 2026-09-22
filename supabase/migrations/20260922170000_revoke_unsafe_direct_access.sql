-- All private portal data must be accessed through authorized backend workflows.
-- Keep service_role access; never restore blanket anon/authenticated CRUD grants.
revoke all privileges on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

drop policy if exists "BulsuScholar storage read" on storage.objects;
drop policy if exists "BulsuScholar storage upload" on storage.objects;
drop policy if exists "BulsuScholar storage update" on storage.objects;
drop policy if exists "BulsuScholar storage delete" on storage.objects;

-- Storage bucket visibility is changed with scripts/make-storage-private.mjs.
