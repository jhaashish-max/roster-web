# roster-manager credentials (copy to credentials.md — gitignored)
#
# Writes go through the Roster API with a service key. The Supabase anon key is READ-ONLY.
# Environment variables with the same names override these values.

ROSTER_API_URL     = https://roster-api.jha-ashish.workers.dev
ROSTER_SERVICE_KEY = <ask the roster owner>
SUPABASE_URL       = https://ioupmkzhoqndbbkltevc.supabase.co
SUPABASE_ANON_KEY  = <anon key — read only>
# Optional, owner only (bypasses RLS; never distribute):
# SUPABASE_SERVICE_ROLE_KEY = <service role key>
