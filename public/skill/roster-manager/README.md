# Roster Manager — Claude skill (v2)

Chat with Claude to create, edit, move and query your team's roster. Claude reads your team's own
rules, builds the schedule, validates it, and writes it through the audited Roster API — no n8n,
no manual sheet editing, every change logged.

## What you can say

- "Generate the **October** roster for **TS - Mission** — here are the leave requests: …"
- "Move **Ayush** to **night shift** next week."
- "Give **Sanjayan** **PL** on the 14th and 15th."
- "**Move Preeti to TS - Payments** from the 1st of next month."
- "**Who's on call** this Sunday?" · "What's the **shrinkage** for **TS - PSE Support** in September?"
- "Show me **what changed** in TS - POS this week." (audit log)

Claude confirms before wiping, regenerating or moving anyone, and always tells you exactly what it changed.

## Setup (one time)

1. Install **Claude Code**.
2. Put the `roster-manager` folder under your project's `.claude/skills/`.
3. Make sure `references/credentials.md` exists (ask the roster owner for the service key if it is missing).
4. `python3 .claude/skills/roster-manager/scripts/roster_api.py health` should print `"ok": true`.

Python 3 only, nothing else to install.

## Files

| Path | What |
|---|---|
| `SKILL.md` | The skill instructions Claude follows. |
| `scripts/roster_api.py` | CLI: reads from Supabase, writes through the Roster API. |
| `references/credentials.md` | API URL + service key + read-only Supabase key (gitignored). |
| `references/architecture.md` | Tables, access model, how the app and automations read data. |
| `references/holidays.md` | Company holidays. |
| `references/default-prompt.md` | Default generation rulebook. |
| `assets/zscaler-root.crt` | Corp proxy cert (needed on the office network). |

## Troubleshooting

- **"certificate verify failed"** — corp network; the bundled cert should handle it, else set `NODE_EXTRA_CA_CERTS`.
- **"Team not found"** — team names are exact (`TS - Mission`, not `TS-Mission`). Run `… teams` to list them.
- **401/403 on a write** — the service key rotated or is missing from `credentials.md`.
- **Wrong roster written?** Ask Claude to check `audit` and to delete & regenerate the month.
