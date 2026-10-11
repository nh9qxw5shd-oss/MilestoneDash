# Milestone Plans

Incident recovery milestone plans for the desk. Each open incident has a main line of milestones
with expected durations; predicted times run from the plan's start time, and every step is rated
green / amber / red against them (up to 10 minutes late is amber). Contingency branches hang off a
main-line step ("if fail", "fallback"), numbered B&lt;step&gt;-&lt;n&gt;; activating one marks the later
main-line steps N/A and brings the branch into progress. Also: subtasks (1a, 1b …), the FMS / CCIL /
TDA refs and TPIC / MMIC contacts, a live viewer count, Publish (the plan as text for WhatsApp,
Teams or email), a read-only live view link, templates (MT ids) to start incidents from, and Memory
(closed plans, read-only, cloneable).

Rebuilt in October 2026 on the Autumn Hub house style (Next.js App Router, TypeScript, Tailwind
v4, the shared kit). Same tables and columns as the original single-page dashboard, so plans and
share links carry over.

## Run

```
npm install
npm run dev        # http://localhost:3000/milestones
npm run lint && npm run type-check && npm test && npm run build
```

Supabase (Mini Project Hub) defaults are built in; `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` override them.

## Addresses

- `https://milestone.derbycontrol.co.uk/milestones` — the board (`?plan=<id>` for a given plan,
  including templates and closed plans). `/templates` and `/memory` sit alongside.
- `https://milestone.derbycontrol.co.uk/milestones/share/<id>` — the read-only live view. Links
  copied from the original page (`/?share=<id>`) redirect here; the bare hostname and
  `/index.html` redirect to the board.
- `https://overseer.derbycontrol.co.uk/milestones` — the same app inside the Derby Control hub.
  Share links copied there point at the standalone hostname.

## Data

`plans` (status `open` / `template` / `closed`), `tasks` (`task_number`; branch tasks are numbered
9000+ so they sort after the main line), `subtasks`, `edges` (a labelled edge from a main-line
task starts a branch), `plan_settings`, `plan_branch_states` (activated branches) and
`plan_viewers` (presence heartbeat, two-minute window). Predicted times are derived, never stored.
Logic is pure and tested under `src/lib/plan/`.

## Changes from the original page

- A branch's predicted times start from its origin step (they previously ran on after the end of
  the main line). With no start time set there are no predictions (previously "now" was used, so
  predictions drifted).
- Deleting a branch's first step removes the whole branch; deleting a later branch step removes
  only that step (previously any branch step took the whole branch).
- Publish uses B-numbers and counts progress as the board does (main line plus activated branches).
- Plans refresh every 30 seconds, so several people can work the same plan.
