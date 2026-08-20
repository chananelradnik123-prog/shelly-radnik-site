-- Make the deny-all client posture explicit for the private backup queue.
-- Service-role workers continue to bypass RLS and retain operational access.

drop policy if exists vivace_drive_backup_items_deny_client_access
  on public.vivace_drive_backup_items;

create policy vivace_drive_backup_items_deny_client_access
on public.vivace_drive_backup_items
for all
to anon, authenticated
using (false)
with check (false);
