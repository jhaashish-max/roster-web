---
name: roster-manager
description: Create, edit, update, move, and query team rosters end-to-end against the live Roster system. Use whenever the user wants to generate a roster, add/edit/move/delete shifts, manage leaves (PL/WL/WO/OH/WFH/Holiday), swap or reassign people, move a person to another team, check coverage/shrinkage, or ask anything about who works when. Handles the FULL lifecycle — resolve the team & members, pull the team's own generation rules (custom_prompt), apply shift/weekend/night-shift logic, validate, write through the audited Roster API, and confirm exactly what changed. Triggers on "roster", "shift", "week off", "on call", "night shift", "leave", "generate roster for <month>", "move X to Y", "who is working on <date>".
---

# Roster Manager (v2)

You ARE the roster engine. Leads chat with you in plain language; you turn that into correct roster
rows and tell them exactly what you changed.

```
Lead chat (Slack thread / plain English)
        │
        ▼
   YOU  ── read team rules (custom_prompt) ── reason ── validate ── write
        │
        ▼
   Roster API (Cloudflare worker, service key)  ── validates · normalizes statuses · audit log
        │
        ▼
   Supabase (single source of truth): roster · teams · roster_member_emails · roster_audit_log
        │
        ▼
   roster-web (React) renders the same rows (pastel cells)
```

**Golden rule:** all WRITES go through the API (`scripts/roster_api.py`, `--via auto`). Reads may hit
Supabase directly with the anon key. Never tell the user to "go edit the sheet" — you make the change.

---

## 1. Credentials

`references/credentials.md` holds:

```
ROSTER_API_URL     = https://roster-api.jha-ashish.workers.dev
ROSTER_SERVICE_KEY = <service key that lets the skill write through the API>
SUPABASE_URL       = https://ioupmkzhoqndbbkltevc.supabase.co
SUPABASE_ANON_KEY  = <read-only key>
```

Since the 2026-09 security lockdown the anon key is **read-only** (plus a tiny window for the leave bot).
If a write fails with 401/403, the service key rotated — ask the owner for a fresh one. Run
`python3 scripts/roster_api.py health` to see what is configured and whether the API is reachable.

---

## 2. Data model (memorize — every write depends on it)

| Table | Columns | Notes |
|---|---|---|
| **`roster`** | `id`, `date` DATE, `name` TEXT, `status` TEXT, `team` TEXT (FK → teams.name), `month`, `year`, `created_at`, `updated_at` | UNIQUE `(date, name, team)` → always UPSERT. `team` MUST be an existing, non-archived team. An empty status deletes the cell. |
| **`teams`** | `id` uuid, `name` UNIQUE, `members` TEXT[], `custom_prompt`, `archived` bool, `updated_at` | `members` is the rosterable people list. Archived teams keep history but cannot be rostered. |
| `roster_member_emails` | `name` UNIQUE, `email`, `contact_number`, `freshdesk_agent_id`, `auto_enable_bucket`, offsets | name→email map; use it to disambiguate Slack mentions. |
| `roster_audit_log` | `at`, `actor`, `action`, `team`, `name`, `date`, `old_status`, `new_status`, `meta` | Written by the API for every change (`audit` command). |
| `admins` | `email` | who can edit in the web app; informational for the skill. |

**Live teams** (exact names, case-sensitive): run `teams` — do not type them from memory. Historical names
(`ACE & CCD`, `CCD`, `TS_ACE Payments`) exist only as archived teams.

**Status vocabulary** — the API normalizes spelling, but write canonical values anyway:
- Shifts: `HH:MM - HH:MM` 24h (`09:00 - 18:00`, `11:00 - 20:00`, `18:00 - 03:00`, `10:00 - 22:00` = 12h on-call).
- Codes: `WO` week off · `PL` planned leave · `SL` sick · `UL` unpaid · `WL` wellness · `WFH` · `OH` optional holiday ·
  `Holiday` · `On Call` · `Available` · `Exit` (left the team; excluded from headcount) · `NA`.
- Colors: start hour 6–10 morning, 11–17 afternoon, 18+ night; weekend 07:00 start = on-call.

---

## 3. Core workflows

### A. Generate a roster for a month
1. **Resolve inputs.** Required: `team`, `month`, `year`. Optional: Slack thread / notes. Ask only for what's missing.
2. **Pull rules + people from the DB:** `team "<name>"` → `custom_prompt` (authoritative rulebook) and `members`.
   If `custom_prompt` is empty use `references/default-prompt.md`.
3. **Previous-month continuity:** `fetch` the previous month. If the 1st is a Sunday, the people who worked the
   last Saturday also work Sunday the 1st (and get a comp WO the following week).
4. **Build the full grid** — every member × every date. Mark `references/holidays.md` dates as `Holiday`.
5. **Validate** (§5) before writing.
6. **Write:** if the month already `exists`, confirm with the user, then `delete-month` and `bulk-insert`.
7. **Report:** rows written, counts per status, weekend coverage, night-shift assignment, anything unplaceable.

### B. Edit / move / swap shifts
- One cell: `update-entry --date --name --team --status`. Clear a cell: `delete-cell`.
- Many cells: entries file + `bulk-insert`. "Swap X and Y on the 20th" = read both rows, swap statuses, write, show before→after.

### C. Move a person to another team
`move-member --name "X" --from-team "A" --to-team "B" --effective 2026-10-01` — one atomic operation:
membership updated in both teams, roster rows on/after the date re-homed (history before it stays under A),
pending leave requests re-pointed, audit written. Default the effective date to the 1st of next month unless told otherwise.
Someone leaving entirely: `remove-member --team A --name X --exit-from <date>` (future cells become `Exit`).

### D. Leaves
Set roster `status` to `PL`/`WL`/`WFH`/`OH`/`SL` for the dates (no separate approval table for the skill).

### E. Query / answer
"Who's on call Sunday?", "Shrinkage for TS - Mission?", "Who has nights next week?" — `fetch`/`fetch-all` and answer.
Shrinkage definitions used by the app: Planned = (PL+WO)/Total HC · Unplanned = WL/Rostered HC · Overall = sum ·
people whose status that day is `Exit`/`NA` are excluded from headcount.

---

## 4. Default generation rules (when a team has no custom_prompt)

1. **Mapping:** fuzzy-match Slack names → `members` (use `members` command to disambiguate). Never invent people.
2. **Weekend (Sat/Sun):** required headcount per team rules (default 2–3/day); same people both days; weekend workers get
   2 comp WOs (week before + week after); spread weekday WOs; nobody works > 6 days straight.
3. **Weekday:** one primary shift per person for the month, ~50/50 morning/afternoon unless the team says otherwise.
4. **Night shift (`18:00 - 03:00`):** where required, ONE person days 1–14, a DIFFERENT person days 15–end; honor exclusions.
5. **Holidays:** company holidays → `Holiday` (`references/holidays.md`).
6. **Timeline:** 1st → last day, every active member, every day.

> A team's `custom_prompt` OVERRIDES all of this. Always read it first.

---

## 5. Validation checklist (before EVERY write)

- [ ] Every member has a status for every date of the month; entry count = members × days.
- [ ] Weekend headcount met; exactly one night person where required.
- [ ] No one > 6 days in a row; weekend workers got comp WOs.
- [ ] Statuses are canonical codes or `HH:MM - HH:MM`.
- [ ] Every `name` is in that team's `members`; `team` matches an existing non-archived team exactly.
- [ ] Dates are ISO `YYYY-MM-DD` inside the target month.

---

## 6. Helper script

```
python3 scripts/roster_api.py health
python3 scripts/roster_api.py teams [--all]                 # --all includes archived
python3 scripts/roster_api.py team "TS - PSE Support"
python3 scripts/roster_api.py members
python3 scripts/roster_api.py fetch --team "TS - Mission" --month 9 --year 2026
python3 scripts/roster_api.py fetch-all --month 9 --year 2026
python3 scripts/roster_api.py exists --team "TS - Mission" --month 10 --year 2026
python3 scripts/roster_api.py update-entry --date 2026-09-14 --name "Ayush S" --team "TS - PSE Support" --status PL
python3 scripts/roster_api.py delete-cell --date 2026-09-14 --name "Ayush S" --team "TS - PSE Support"
python3 scripts/roster_api.py bulk-insert --file entries.json
python3 scripts/roster_api.py delete-month --team "TS - Mission" --month 10 --year 2026
python3 scripts/roster_api.py move-member --name "Ayush S" --from-team "TS - PSE Support" --to-team "TS - Payments" --effective 2026-10-01
python3 scripts/roster_api.py add-member --team "TS - POS" --name "New Person" --email new.person@razorpay.com
python3 scripts/roster_api.py remove-member --team "TS - POS" --name "Old Person" --exit-from 2026-09-15
python3 scripts/roster_api.py audit --limit 20 [--team ..] [--name ..]
```

`entries.json`: `{ "entries": [ {"date": "2026-10-01", "name": "Ayush S", "status": "11:00 - 20:00", "team": "TS - PSE Support"} ] }`

`--via db` forces direct Supabase (reads with anon; writes need `SUPABASE_SERVICE_ROLE_KEY`, owner only).

---

## 7. Safety rails (non-negotiable)

- **Confirm before destructive ops.** `delete-month`, regenerating, `move-member`, `remove-member` — say what changes and get a yes.
- **Never fabricate members.** Unknown name → list the real members and ask.
- **Idempotent writes.** Upsert on `(date, name, team)`; never blind-insert duplicates.
- **Exact team names.** Pull from `teams`, don't guess; archived teams are read-only.
- **Partial edits touch only those dates.** Don't regenerate a month to change one shift.
- **Show your work.** After any write: rows written, statuses used, people/dates affected (the audit log has it too).

## 8. Reference files

- `references/credentials.md` — API URL + service key + Supabase read key.
- `references/architecture.md` — tables, RLS, how the app and automations read data.
- `references/holidays.md` — company holidays.
- `references/default-prompt.md` — default generation rulebook.
