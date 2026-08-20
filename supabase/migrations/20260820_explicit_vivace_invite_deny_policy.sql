-- Make the invitation registry's client denial explicit.
-- Edge Functions use the service role and bypass RLS; browser/database clients get no rows and cannot mutate invites.

drop policy if exists vivace_invites_deny_client_access
  on public.vivace_discovery_invites;

create policy vivace_invites_deny_client_access
on public.vivace_discovery_invites
for all
to anon, authenticated
using (false)
with check (false);
