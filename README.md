# Roster web

React 19 + Vite front-end for the team roster. Deployed to GitHub Pages at
`https://jhaashish-max.github.io/roster-web/` by the workflow in `.github/workflows/deploy.yml`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173/roster-web/
npm run lint
npm test
npm run build
```

`VITE_API_BASE_URL` (see `.env.example`) points at the Cloudflare worker API. The app probes
`GET /api/health` on start and feature-detects the API version, so it works against the v1 worker
(legacy routes only) and the v2 worker (cell delete, move member, SSE generation, audit).

## Layout

```
src/app          App (auth gate) · AuthenticatedApp (shell, navigation, modals)
src/pages        Overview · RosterPage · ReportsPage · RequestsPage · ApprovalsPage · AutoBucketPage · TeamSettingsPage
src/components   UI building blocks (RosterGrid, CellEditor, Modal, dialogs, toast, …)
src/hooks        useFeatures · useMe · useTeams · useRoster · useLocalStorage · useToast
src/lib          api (typed client) · status (shared vocabulary) · headcount · members · dates · prompt
src/styles       tokens (pastel palette, light + dark) · base · layout · components · roster · reports · forms
```

`src/lib/status.js` is a byte-identical copy of `docs/shared/status.js` in the repository root; the worker
uses the same file so every status is normalised the same way on both sides.
