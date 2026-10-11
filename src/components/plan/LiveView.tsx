"use client";

// Read-only live view (/share/<plan>): the link Share copies. No navigation and no edits; it
// re-reads the plan every 45 seconds and re-renders every minute so due and overdue stay honest.

import { useEffect, useMemo, useState } from "react";
import { GitBranch, Moon, Sun } from "lucide-react";
import { Badge, Chips, Spinner } from "@/components/ui";
import { useCountUp, useNow } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { displayNumber, planShape } from "@/lib/plan/branches";
import { fmtDT, fmtTime } from "@/lib/plan/format";
import { currentTaskId, duePill, minutesBetween, predictTimes, progress, RAG_COLOR, variancePill, workStatus } from "@/lib/plan/timing";
import type { Task } from "@/lib/plan/types";
import { usePlanData, useViewers } from "@/lib/plan/usePlan";

type Filter = "open" | "done";

function Mark() {
  return (
    <svg width={22} height={22} viewBox="0 0 32 32" aria-hidden>
      <path fill="#F26522" d="M7 3h2v26H7zM10 4h15l-3.5 5L25 14H10z" />
      <circle cx="8" cy="27" r="3" fill="#F26522" />
    </svg>
  );
}

function ThemeButton() {
  const { theme, toggle } = useTheme();
  const light = theme === "light";
  return (
    <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label={light ? "Switch to dark theme" : "Switch to light theme"}>
      {light ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}

function Ring({ pct }: { pct: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  const n = useCountUp(pct, 900);
  const C = 2 * Math.PI * 52;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg-sunken)" strokeWidth="10" />
        <circle className="ring-fg" cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - shown / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tnum">{n}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">complete</span>
      </div>
    </div>
  );
}

export default function LiveView({ planId }: { planId: string }) {
  const load = usePlanData(planId, 45_000);
  const now = useNow(60_000);
  const [filter, setFilter] = useState<Filter | "">("");
  const data = load.data;
  const viewers = useViewers(planId, !!data && data.plan.status !== "template");

  const derived = useMemo(() => {
    if (!data) return null;
    const shape = planShape(data.tasks, data.edges);
    const tpl = data.plan.status === "template";
    const predicted = tpl ? new Map<string, string>() : predictTimes(data.tasks, shape, data.settings.start_time);
    return { shape, predicted, tpl };
  }, [data]);

  useEffect(() => {
    if (data) document.title = `${data.plan.title} · Live view`;
  }, [data]);

  const frame = (body: React.ReactNode) => (
    <div className="min-h-screen">
      <header className="topbar glass flex items-center gap-2 px-4">
        <Mark />
        <span className="text-sm font-extrabold">Milestone Plans</span>
        <span className="text-xs text-faint">· live view</span>
        <span className="flex-1" />
        <ThemeButton />
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{body}</main>
    </div>
  );

  if (load.missing) return frame(<p className="py-16 text-center text-sm text-dim">This plan could not be found. The link may be out of date, or the plan was removed.</p>);
  if (!data || !derived) {
    if (load.error) return frame(<p className="py-16 text-center text-sm text-dim">Could not load this view. Check your connection and refresh the page.</p>);
    return frame(
      <div className="flex flex-col items-center gap-3 py-16 text-sm text-dim">
        <Spinner /> Loading live view…
      </div>,
    );
  }

  const { plan, tasks, subtasks, settings: s, active } = data;
  const { shape, predicted, tpl } = derived;
  const closed = plan.status === "closed";
  const prog = progress(tasks, shape, active);
  const current = tpl || closed ? null : currentTaskId(tasks, shape, active);
  const ws = workStatus(tasks, shape, active, predicted, fmtDT);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = [
    ...tasks.filter((t) => !shape.meta.has(t.id)).sort((a, b) => a.task_number - b.task_number).map((t) => ({ t, head: null as string | null })),
    ...[...shape.groups.values()]
      .sort((a, b) => a.originTaskNumber - b.originTaskNumber)
      .flatMap((g) => g.ordered.map((id, i) => ({ t: byId.get(id)!, head: i === 0 ? g.key : null }))),
  ].filter((x) => x.t);
  const visible = (t: Task) => (filter === "done" ? !!t.completed_at : filter === "open" ? !t.completed_at && !t.is_na : true);

  const cards: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] = [
    { label: "Status", value: closed ? "Closed" : tpl ? "Template" : "In progress", sub: s.start_time ? `Started ${fmtDT(s.start_time)}` : "Start time not set" },
    { label: "Work status", value: <span style={{ color: ws.rag ? RAG_COLOR[ws.rag] : undefined }}>{ws.text}</span>, sub: ws.detail },
    { label: "Milestones", value: `${prog.done} / ${prog.total} complete`, sub: `${Math.max(0, prog.total - prog.done)} remaining` },
    { label: "Viewers", value: viewers ?? "—", sub: "watching now" },
  ];
  if (s.fms_ref || s.ccil_ref || s.tda_ref)
    cards.push({
      label: "References",
      value: (
        <span className="block font-mono text-sm leading-6">
          {s.fms_ref && <span className="block">FMS {s.fms_ref}</span>}
          {s.ccil_ref && <span className="block">CCIL {s.ccil_ref}</span>}
          {s.tda_ref && <span className="block">TDA {s.tda_ref}</span>}
        </span>
      ),
    });
  if (s.tpic_name || s.tpic_phone || s.mmic_name || s.mmic_phone)
    cards.push({
      label: "Command",
      value: (
        <span className="block text-sm leading-6">
          {(s.tpic_name || s.tpic_phone) && <span className="block">TPIC: {[s.tpic_name, s.tpic_phone].filter(Boolean).join(" ")}</span>}
          {(s.mmic_name || s.mmic_phone) && <span className="block">MMIC: {[s.mmic_name, s.mmic_phone].filter(Boolean).join(" ")}</span>}
        </span>
      ),
    });

  return frame(
    <>
      <section className="card fade-up mb-4 flex flex-wrap items-center gap-6 p-5">
        <div className="min-w-0 flex-1 basis-64">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-dim">
            <span className={`live-dot ${closed ? "final" : ""}`} />
            {closed ? "Final · plan closed" : `Live · updated ${load.updatedAt ? load.updatedAt.toLocaleTimeString("en-GB") : "--:--"}`}
          </span>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{plan.title || "Milestone plan"}</h1>
          {plan.description && <p className="mt-1 text-sm text-dim">{plan.description}</p>}
          <div className="mt-3">{closed ? <Badge>Closed</Badge> : tpl ? <Badge color="var(--verypoor)">Template</Badge> : <Badge color="var(--good)">In progress</Badge>}</div>
        </div>
        <div className="flex items-center gap-4">
          <Ring pct={prog.pct} />
          <div className="text-sm text-dim">
            <b className="text-ink">{prog.done}</b> of <b className="text-ink">{prog.total}</b>
            <br />
            milestones done
          </div>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c, i) => (
          <div key={c.label} className="card fade-up px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="lbl mb-0">{c.label}</div>
            <div className="mt-1 text-base font-bold">{c.value}</div>
            {c.sub && <div className="mt-0.5 text-xs text-dim">{c.sub}</div>}
          </div>
        ))}
      </div>

      <section className="card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Milestones</h2>
          <Chips<Filter>
            allLabel="All"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Remaining" },
              { value: "done", label: "Completed" },
            ]}
          />
        </div>
        <ol className="tl space-y-3">
          {ordered.length === 0 && <li className="text-sm text-dim">No milestones yet.</li>}
          {ordered.map(({ t, head }) => {
            const g = head ? shape.groups.get(head) : null;
            const heading = g && (
              <li key={`h-${g.key}`} className="tl-head">
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-semibold text-dim">
                  <GitBranch size={13} className="text-[var(--verypoor)]" /> Branch from step {g.originTaskNumber}: {g.label}
                  {!tpl && <Badge color={active.has(g.key) ? "var(--moderate)" : "var(--text-dim)"}>{active.has(g.key) ? "Active" : "Standby"}</Badge>}
                </div>
              </li>
            );
            if (!visible(t)) return heading;
            const done = !!t.completed_at;
            const na = t.is_na;
            const isCur = t.id === current;
            const pred = predicted.get(t.id);
            const meta = shape.meta.get(t.id);
            const subs = subtasks.get(t.id) ?? [];
            const num = displayNumber(t, shape);
            const variance = done && pred ? variancePill(minutesBetween(t.completed_at!, pred)) : null;
            const due = !done && isCur && pred ? duePill(minutesBetween(now.toISOString(), pred)) : null;
            return [
              heading,
              <li key={t.id} className={`${done ? "tl-done" : ""} ${isCur ? "tl-current" : ""} ${na ? "tl-na" : ""}`}>
                <span className="tl-marker">{done ? "✓" : na ? "–" : num}</span>
                <div className="rounded-lg border border-edge bg-sunken px-3 py-2.5" style={!tpl && isCur ? { borderColor: "var(--accent)" } : undefined}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-faint">{num}</span>
                    <span className="text-sm font-semibold">{t.title}</span>
                    {meta && <Badge color="var(--verypoor)">{meta.label}</Badge>}
                    {na && <Badge>N/A</Badge>}
                    {isCur && <Badge color="var(--accent)">In progress</Badge>}
                  </div>
                  {!tpl && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-dim">
                      {done ? (
                        <>
                          Completed {fmtDT(t.completed_at)}
                          {variance && <Badge color={RAG_COLOR[variance.rag]}>{variance.text}</Badge>}
                        </>
                      ) : na ? (
                        "Not applicable on the current line"
                      ) : pred ? (
                        <>
                          Predicted {fmtDT(pred)}
                          {due && <Badge color={RAG_COLOR[due.rag]}>{due.text}</Badge>}
                        </>
                      ) : (
                        "Predicted — not set"
                      )}
                    </div>
                  )}
                  {subs.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-dim">
                        {subs.length} subtask{subs.length === 1 ? "" : "s"} · {subs.filter((x) => x.completed_at).length} done
                      </summary>
                      <ul className="mt-1.5 space-y-1">
                        {subs.map((x) => (
                          <li key={x.id} className="flex items-center gap-2">
                            <span className={x.completed_at ? "text-[var(--good)]" : "text-faint"}>{x.completed_at ? "✓" : "○"}</span>
                            <span className="flex-1">
                              {num}
                              {x.sub_letter} · {x.title}
                            </span>
                            {!tpl && x.completed_at && <span className="text-faint">{fmtTime(x.completed_at)}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </li>,
            ];
          })}
        </ol>
      </section>
      <p className="mt-4 text-center text-xs text-faint">Read-only live view · refreshes automatically · Milestone Plans · Derby Control</p>
    </>,
  );
}
