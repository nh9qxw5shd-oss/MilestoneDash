# Milestone Plans (MilestoneDash)

Next.js App Router, TypeScript strict, Tailwind v4, Supabase ("Mini Project Hub", anon key).
Incident milestone plans; see README.md for what it does.

## Working here
- Checks before any push: `npm run lint`, `npm run type-check`, `npm test` (`node --test`, so
  relative imports inside `src/lib` carry the `.ts` suffix), `npm run build`.
- Rules live in `src/lib/plan/` and are tested: main line and branches (`branches.ts`), predicted
  times, RAG and progress (`timing.ts`), template ids and the Publish text (`format.ts`).
  Predicted times are never written; `tasks.predicted_time` stays null.
- Keep the stored shapes: branch tasks take `task_number` 9000 + (highest + 1); a branch is a
  labelled edge from a main-line task; `plan_branch_states` is keyed on plan, origin task and label.
- Browser storage keeps the original keys: `milestonedash_viewer_id` (raw string) and
  `milestone_collapsed_<plan id>` (JSON array of group keys). Keep new keys prefixed `milestone_`.
- Mounted on the Derby Control hub (PotatOS) at `overseer.derbycontrol.co.uk/milestones`, which
  proxies `/milestones/*` here. `basePath` is `/milestones` (`next.config.ts`) on the standalone
  hostname too; the root, `/index.html` and `/?share=<id>` redirect there.
  `public/storage-bridge.html` is byte-identical across systems; change all or none. Vercel
  framework comes from `vercel.json`.
- Overseer is the only way in (27 Oct): the Vercel project has no domain and is reached only through
  `overseer.derbycontrol.co.uk/milestones` (PotatOS docs/09 §4.6). The last redirect in `next.config` sends a page
  load without Overseer's `x-overseer-hop` marker to the same address on Overseer. Absolute links
  this system hands out use `https://overseer.derbycontrol.co.uk/milestones/…`. Do not add a domain.

## Design language
Autumn Hub house style (`nh9qxw5shd-oss/autumn-hub`, `web/src/`): the stylesheet, `ui.tsx` and
`uiFeedback.tsx` are copied by hand; keep them in step. Network Rail orange brand mark. Mobile
width 390 px with no horizontal scroll.

Writing and commits: no model names or identifiers in code, README, commit messages or PR text.
