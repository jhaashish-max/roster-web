#!/usr/bin/env python3
"""
roster_api.py — CLI for the LIVE Roster system (v2).

Two transports:
  * api  — the Cloudflare worker (https://roster-api.jha-ashish.workers.dev) using a service key
           header. All WRITES go this way: the worker validates, normalizes statuses, checks the
           team exists, writes the audit log. Needs ROSTER_SERVICE_KEY.
  * db   — Supabase PostgREST directly. READS work with the anon key. Writes need
           SUPABASE_SERVICE_ROLE_KEY (the anon key is read-only since the 2026-09 lockdown).

Default is `--via auto`: reads prefer the API when a service key is configured (falls back to db),
writes use the API when ROSTER_SERVICE_KEY is set, else the db transport with the service-role key.

Config resolution: environment variables override references/credentials.md (KEY = value lines).
  ROSTER_API_URL, ROSTER_SERVICE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import calendar
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CRED_PATH = os.path.join(SCRIPT_DIR, "..", "references", "credentials.md")
DEFAULT_API_URL = "https://roster-api.jha-ashish.workers.dev"


# --------------------------------------------------------------------------- #
# TLS (corporate proxy) + config
# --------------------------------------------------------------------------- #
def _build_ssl_ctx():
    for corp in (os.path.join(SCRIPT_DIR, "..", "assets", "zscaler-root.crt"), os.environ.get("NODE_EXTRA_CA_CERTS")):
        if corp and os.path.exists(corp):
            try:
                ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                ctx.check_hostname = True
                ctx.verify_mode = ssl.CERT_REQUIRED
                ctx.load_verify_locations(cafile=corp)
                return ctx
            except Exception:
                continue
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL_CTX = _build_ssl_ctx()


def load_credentials():
    creds = {}
    if os.path.exists(CRED_PATH):
        with open(CRED_PATH) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                creds[k.strip()] = v.strip().strip('"').strip("'")
    for key in ("ROSTER_API_URL", "ROSTER_SERVICE_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        if os.environ.get(key):
            creds[key] = os.environ[key]
    return creds


CREDS = load_credentials()
API_URL = (CREDS.get("ROSTER_API_URL") or DEFAULT_API_URL).rstrip("/")
SERVICE_KEY = CREDS.get("ROSTER_SERVICE_KEY", "")
SUPABASE_URL = (CREDS.get("SUPABASE_URL") or "").rstrip("/")
ANON_KEY = CREDS.get("SUPABASE_ANON_KEY", "")
SERVICE_ROLE_KEY = CREDS.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _fail(msg, **extra):
    out = {"error": msg}
    out.update(extra)
    print(json.dumps(out, indent=2))
    sys.exit(1)


def _http(method, url, headers=None, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "Mozilla/5.0 (compatible; roster-manager-skill/2.0)")  # Cloudflare blocks Python-urllib (1010)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=timeout) as res:
            raw = res.read().decode() or "null"
            try:
                return res.status, json.loads(raw)
            except json.JSONDecodeError:
                return res.status, {"raw": raw}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"raw": raw}
    except urllib.error.URLError as e:
        _fail(f"Connection error: {e.reason}")


# --------------------------------------------------------------------------- #
# Transports
# --------------------------------------------------------------------------- #
def api(method, path, params=None, body=None):
    if not SERVICE_KEY:
        _fail("ROSTER_SERVICE_KEY not configured (references/credentials.md) — required for the api transport.")
    qs = ("?" + urllib.parse.urlencode(params, doseq=True)) if params else ""
    status, data = _http(method, f"{API_URL}{path}{qs}", {"x-service-key": SERVICE_KEY}, body)
    if status >= 400:
        _fail(f"API {status} {method} {path}: {data.get('error') if isinstance(data, dict) else data}", details=data)
    return data


def api_available():
    if not SERVICE_KEY:
        return False
    try:
        status, data = _http("GET", f"{API_URL}/api/health", timeout=15)
        return status == 200 and isinstance(data, dict) and data.get("ok") is True
    except SystemExit:
        return False


def db(method, table, params=None, body=None, prefer=None, write=False):
    if not SUPABASE_URL:
        _fail("SUPABASE_URL not configured (references/credentials.md).")
    key = SERVICE_ROLE_KEY if (write or not ANON_KEY) else ANON_KEY
    if write and not SERVICE_ROLE_KEY:
        _fail("Writes need the API transport (ROSTER_SERVICE_KEY) or SUPABASE_SERVICE_ROLE_KEY; the anon key is read-only.")
    if not key:
        _fail("No Supabase key configured.")
    qs = ("?" + urllib.parse.urlencode(params, doseq=True)) if params else ""
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if prefer:
        headers["Prefer"] = prefer
    status, data = _http(method, f"{SUPABASE_URL}/rest/v1/{table}{qs}", headers, body)
    if status >= 400:
        _fail(f"DB {status} {method} {table}: {data}")
    return data


def db_all(table, params):
    """Paginate a PostgREST read (1000 rows/page)."""
    rows, offset = [], 0
    while True:
        p = dict(params)
        p.update({"limit": 1000, "offset": offset})
        batch = db("GET", table, p)
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        offset += 1000


def month_range(year, month):
    last = calendar.monthrange(int(year), int(month))[1]
    mm = f"{int(month):02d}"
    return f"{int(year)}-{mm}-01", f"{int(year)}-{mm}-{last}", last


def choose(via, is_write):
    if via == "api":
        return "api"
    if via == "db":
        return "db"
    if is_write:
        return "api" if SERVICE_KEY else "db"
    return "api" if api_available() else "db"


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #
def cmd_health(args):
    status, data = _http("GET", f"{API_URL}/api/health", timeout=15)
    print(json.dumps({"api_url": API_URL, "status": status, "health": data,
                      "service_key_configured": bool(SERVICE_KEY),
                      "db_read_key": "service_role" if SERVICE_ROLE_KEY else ("anon" if ANON_KEY else None)}, indent=2))


def cmd_teams(args):
    if choose(args.via, False) == "api":
        rows = api("GET", "/api/teams/list", {"include_archived": "1"} if args.all else None)
    else:
        params = {"select": "id,name,members,archived", "order": "name"}
        if not args.all:
            params["archived"] = "eq.false"
        rows = db("GET", "teams", params)
    out = [{"name": t["name"], "archived": t.get("archived", False), "member_count": len(t.get("members") or []),
            "members": t.get("members") or []} for t in rows]
    print(json.dumps(out, indent=2))


def cmd_team(args):
    if choose(args.via, False) == "api":
        rows = [t for t in api("GET", "/api/teams/list", {"include_archived": "1"}) if t["name"] == args.name]
    else:
        rows = db("GET", "teams", {"select": "id,name,members,custom_prompt,archived", "name": f"eq.{args.name}", "limit": 1})
    if not rows:
        _fail(f"Team not found: {args.name}")
    print(json.dumps(rows[0], indent=2))


def cmd_members(args):
    if choose(args.via, False) == "api":
        rows = api("GET", "/api/teams/emails")
        rows = [{k: r.get(k) for k in ("name", "email", "contact_number")} for r in rows]
    else:
        rows = db_all("roster_member_emails", {"select": "name,email,contact_number", "order": "name"})
    print(json.dumps(rows, indent=2))


def _fetch(args, team):
    start, end, _ = month_range(args.year, args.month)
    if choose(args.via, False) == "api":
        if team:
            rows = api("GET", "/api/roster/fetch", {"year": args.year, "month": args.month, "team": team})
        else:
            grouped = api("GET", "/api/roster/fetch-all", {"year": args.year, "month": args.month})
            rows = [r for rs in grouped.values() for r in rs]
        return [{"date": r["Date"], "name": r["Name"], "status": r["Status"], "team": r["Team"]} for r in rows]
    params = {"select": "date,name,status,team", "order": "date,name", "date": [f"gte.{start}", f"lte.{end}"]}
    if team:
        params["team"] = f"eq.{team}"
    return db_all("roster", params)


def cmd_fetch(args):
    print(json.dumps(_fetch(args, args.team), indent=2))


def cmd_fetch_all(args):
    grouped = {}
    for r in _fetch(args, None):
        grouped.setdefault(r["team"], []).append(r)
    print(json.dumps(grouped, indent=2))


def cmd_exists(args):
    rows = _fetch(args, args.team)
    print(json.dumps({"exists": len(rows) > 0, "rows": len(rows)}, indent=2))


def _normalize_entries(entries):
    out = []
    for e in entries:
        date, name, team, status = e.get("date"), e.get("name"), e.get("team"), e.get("status")
        if not all([date, name, team]) or status is None:
            continue
        y, m, _ = date.split("-")
        out.append({"date": date, "name": str(name).strip(), "team": team, "status": str(status).strip(),
                    "month": int(m), "year": int(y)})
    return out


def cmd_update_entry(args):
    entry = {"date": args.date, "name": args.name, "team": args.team, "status": args.status}
    if choose(args.via, True) == "api":
        print(json.dumps(api("POST", "/api/roster/update", body=entry), indent=2))
        return
    rows = _normalize_entries([entry])
    if rows[0]["status"] in ("", "-"):
        db("DELETE", "roster", {"date": f"eq.{args.date}", "name": f"eq.{args.name}", "team": f"eq.{args.team}"},
           prefer="return=minimal", write=True)
        print(json.dumps({"success": True, "deleted": True}, indent=2))
        return
    data = db("POST", "roster", body=rows, prefer="resolution=merge-duplicates,return=representation", write=True)
    print(json.dumps({"success": True, "upserted": data}, indent=2))


def cmd_delete_cell(args):
    if choose(args.via, True) == "api":
        print(json.dumps(api("DELETE", "/api/roster/cell", {"date": args.date, "name": args.name, "team": args.team}), indent=2))
        return
    db("DELETE", "roster", {"date": f"eq.{args.date}", "name": f"eq.{args.name}", "team": f"eq.{args.team}"},
       prefer="return=minimal", write=True)
    print(json.dumps({"success": True}, indent=2))


def cmd_bulk_insert(args):
    with open(args.file) as f:
        payload = json.load(f)
    entries = payload.get("entries", payload)
    if not isinstance(entries, list):
        _fail("bulk-insert file must be a JSON array or an object with an 'entries' array.")
    rows = _normalize_entries(entries)
    if not rows:
        _fail("No valid entries (need date, name, team, status).")
    if choose(args.via, True) == "api":
        print(json.dumps(api("POST", "/api/roster/bulk-update", body={"entries": rows}), indent=2))
        return
    for i in range(0, len(rows), 500):
        db("POST", "roster", body=rows[i:i + 500], prefer="resolution=merge-duplicates,return=minimal", write=True)
    print(json.dumps({"success": True, "count": len(rows)}, indent=2))


def cmd_delete_month(args):
    if choose(args.via, True) == "api":
        print(json.dumps(api("DELETE", "/api/roster/delete", {"year": args.year, "month": args.month, "team": args.team}), indent=2))
        return
    start, end, _ = month_range(args.year, args.month)
    db("DELETE", "roster", {"team": f"eq.{args.team}", "date": [f"gte.{start}", f"lte.{end}"]}, prefer="return=minimal", write=True)
    print(json.dumps({"success": True, "deleted": f"{args.team} {args.month}/{args.year}"}, indent=2))


def cmd_move_member(args):
    if choose(args.via, True) == "api":
        print(json.dumps(api("POST", "/api/teams/move-member", body={
            "name": args.name, "from_team": args.from_team, "to_team": args.to_team, "effective_date": args.effective}), indent=2))
        return
    data = db("POST", "rpc/move_team_member", body={"p_name": args.name, "p_from_team": args.from_team,
                                                     "p_to_team": args.to_team, "p_effective": args.effective,
                                                     "p_actor": "skill"}, write=True)
    print(json.dumps({"success": True, "result": data}, indent=2))


def _team_by_name(name):
    rows = db("GET", "teams", {"select": "id,name,members,custom_prompt", "name": f"eq.{name}", "limit": 1})
    if not rows:
        _fail(f"Team not found: {name}")
    return rows[0]


def cmd_add_member(args):
    if choose(args.via, True) == "api":
        team = next((t for t in api("GET", "/api/teams/list") if t["name"] == args.team), None)
        if not team:
            _fail(f"Team not found: {args.team}")
        body = {"team_id": team["id"], "name": args.name}
        if args.email:
            body["email"] = args.email
        print(json.dumps(api("POST", "/api/teams/add-member", body=body), indent=2))
        return
    team = _team_by_name(args.team)
    if args.name in team["members"]:
        _fail(f"{args.name} is already in {args.team}")
    db("PATCH", "teams", {"id": f"eq.{team['id']}"}, {"members": team["members"] + [args.name]}, prefer="return=minimal", write=True)
    if args.email:
        db("POST", "roster_member_emails", body=[{"name": args.name, "email": args.email.lower()}],
           prefer="resolution=merge-duplicates,return=minimal", write=True)
    print(json.dumps({"success": True, "team": args.team, "added": args.name}, indent=2))


def cmd_remove_member(args):
    if choose(args.via, True) == "api":
        team = next((t for t in api("GET", "/api/teams/list") if t["name"] == args.team), None)
        if not team:
            _fail(f"Team not found: {args.team}")
        body = {"team_id": team["id"], "name": args.name}
        if args.exit_from:
            body["mark_exit_from"] = args.exit_from
        print(json.dumps(api("POST", "/api/teams/remove-member", body=body), indent=2))
        return
    team = _team_by_name(args.team)
    if args.name not in team["members"]:
        _fail(f"{args.name} is not in {args.team}")
    db("PATCH", "teams", {"id": f"eq.{team['id']}"}, {"members": [m for m in team["members"] if m != args.name]},
       prefer="return=minimal", write=True)
    print(json.dumps({"success": True, "team": args.team, "removed": args.name}, indent=2))


def cmd_audit(args):
    if choose(args.via, False) == "api":
        params = {"limit": args.limit}
        if args.team:
            params["team"] = args.team
        if args.name:
            params["name"] = args.name
        print(json.dumps(api("GET", "/api/audit", params), indent=2))
        return
    params = {"select": "*", "order": "at.desc", "limit": args.limit}
    if args.team:
        params["team"] = f"eq.{args.team}"
    if args.name:
        params["name"] = f"eq.{args.name}"
    print(json.dumps(db("GET", "roster_audit_log", params, write=True), indent=2))


# --------------------------------------------------------------------------- #
def main():
    p = argparse.ArgumentParser(description="Roster CLI (v2: API-first, audited writes)")
    p.add_argument("--via", choices=["auto", "api", "db"], default="auto", help="transport (default auto)")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("health", help="Check the API and which keys are configured")
    sp = sub.add_parser("teams", help="List teams + member counts")
    sp.add_argument("--all", action="store_true", help="include archived teams")
    sp = sub.add_parser("team", help="One team: members + custom_prompt")
    sp.add_argument("name")
    sub.add_parser("members", help="List roster_member_emails (name→email)")

    for name in ("fetch", "exists", "delete-month"):
        sp = sub.add_parser(name)
        sp.add_argument("--team", required=True)
        sp.add_argument("--month", type=int, required=True)
        sp.add_argument("--year", type=int, required=True)

    sp = sub.add_parser("fetch-all", help="All teams' roster for a month, grouped")
    sp.add_argument("--month", type=int, required=True)
    sp.add_argument("--year", type=int, required=True)

    sp = sub.add_parser("update-entry", help="Set one cell (status '-' or '' deletes it)")
    for a in ("--date", "--name", "--team", "--status"):
        sp.add_argument(a, required=True)

    sp = sub.add_parser("delete-cell", help="Delete one cell")
    for a in ("--date", "--name", "--team"):
        sp.add_argument(a, required=True)

    sp = sub.add_parser("bulk-insert", help="Upsert many cells from a JSON file")
    sp.add_argument("--file", required=True)

    sp = sub.add_parser("move-member", help="Move a person to another team from a date (atomic)")
    sp.add_argument("--name", required=True)
    sp.add_argument("--from-team", dest="from_team", required=True)
    sp.add_argument("--to-team", dest="to_team", required=True)
    sp.add_argument("--effective", required=True, help="YYYY-MM-DD; rows on/after this date move")

    sp = sub.add_parser("add-member", help="Add a person to a team")
    sp.add_argument("--team", required=True)
    sp.add_argument("--name", required=True)
    sp.add_argument("--email")

    sp = sub.add_parser("remove-member", help="Remove a person from a team")
    sp.add_argument("--team", required=True)
    sp.add_argument("--name", required=True)
    sp.add_argument("--exit-from", dest="exit_from", help="YYYY-MM-DD; mark their future cells as Exit")

    sp = sub.add_parser("audit", help="Recent audit log entries")
    sp.add_argument("--limit", type=int, default=50)
    sp.add_argument("--team")
    sp.add_argument("--name")

    args = p.parse_args()
    {
        "health": cmd_health, "teams": cmd_teams, "team": cmd_team, "members": cmd_members,
        "fetch": cmd_fetch, "fetch-all": cmd_fetch_all, "exists": cmd_exists,
        "update-entry": cmd_update_entry, "delete-cell": cmd_delete_cell, "bulk-insert": cmd_bulk_insert,
        "delete-month": cmd_delete_month, "move-member": cmd_move_member, "add-member": cmd_add_member,
        "remove-member": cmd_remove_member, "audit": cmd_audit,
    }[args.command](args)


if __name__ == "__main__":
    main()
