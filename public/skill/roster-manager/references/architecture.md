# Roster system — architecture (LIVE, after the September 2026 audit)

## Layers

1. **Supabase Postgres** (`ioupmkzhoqndbbkltevc.supabase.co`, ap-south-1) — single source of truth.
2. **Roster API** — Cloudflare Worker `roster-api.jha-ashish.workers.dev` (Hono). Verifies Google-login
   JWTs, enforces the `admins` list on every write, normalizes statuses, keeps the audit log, and is the
   only component holding the Supabase service-role key. Source: `roster-api-cloudflare/` (GitHub `jhaashish-max/roster-api`).
3. **roster-web** — React 19 + Vite on GitHub Pages (`jhaashish-max/roster-web`). Talks ONLY to the API.
4. **Automations** that read Supabase directly with the anon key: Google Sheets sync (Apps Script),
   Freshdesk auto-enable job (Apps Script, RPC `get_roster_with_emails` every 10 min), a leave bot that
   PATCHes today's cell. Legacy n8n + Gemini generation flow is superseded by the API's `/api/roster/generate`.

## Access model (RLS)

| Table | anon / authenticated | service_role (API) |
|---|---|---|
| roster | SELECT; UPDATE only rows within ±2 days of today | all |
| teams | SELECT | all |
| roster_member_emails | SELECT | all |
| shift_configurations, admins, roster_leave_requests, roster_audit_log | none | all |
| RPC `get_roster_with_emails(date)` | EXECUTE (SECURITY DEFINER) | EXECUTE |
| RPC `move_team_member(...)` | none | EXECUTE |

## Tables

### roster (hot path)
```sql
id serial PK, date date NOT NULL, name text NOT NULL, status text NOT NULL,
team text NOT NULL REFERENCES teams(name) ON UPDATE CASCADE ON DELETE RESTRICT,
month int, year int, created_at timestamptz, updated_at timestamptz (trigger),
UNIQUE (date, name, team)
```
Indexes: (team,date), (year,month), (date), (name).

### teams
```sql
id uuid PK, name text UNIQUE, members text[] NOT NULL, custom_prompt text,
archived boolean NOT NULL DEFAULT false, created_at, updated_at (trigger)
```

### roster_member_emails
`name UNIQUE, email UNIQUE, contact_number, freshdesk_agent_id, auto_enable_bucket, start_offset_mins, end_offset_mins`

### roster_audit_log
`at, actor (email | service), action (roster.update | roster.bulk_update | team.move_member | …), team, name, date, old_status, new_status, meta jsonb`

### roster_leave_requests, admins, shift_configurations — unchanged shapes (see API contract).

## Status → colour (frontend `lib/status.js`, identical copy in the worker)
`normalizeStatus()` maps any spelling to a canonical value and a kind:
shift/oncall (time ranges; period by start hour), wo, pl, sl, ul, wl, wfh, oh, holiday, available, exit, na, empty, other.
Exit/NA/empty are excluded from headcount; shift/oncall/wfh/available count as present.

## Generation
`POST /api/roster/generate` (admin or service key) streams progress, calls Gemini server-side with the team's
`custom_prompt` (or the default) + previous-month tail + holidays, validates every entry against `members`
and the month, then replaces the month and audits it. The skill can also generate itself (it IS the engine)
and write via `bulk-insert`.
