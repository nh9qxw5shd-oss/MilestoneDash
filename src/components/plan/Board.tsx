"use client";

// The board: one plan at a time (an open incident, a template being edited, or a closed plan read
// only). Incidents carry the start time, refs and command structure, predicted times, RAG and
// progress; templates are the framework only.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Archive, Copy, GitBranch, LayoutTemplate, Link2, ListChecks, Plus, RefreshCw, Users, XCircle } from "lucide-react";
import { Badge, Card, EmptyState, Field, PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { useDialog, useToast } from "@/components/uiFeedback";
import { useLocalStorage, useNow } from "@/lib/hooks";
import { mainAfterOrigin, nextSubLetter, nextTaskNumber, planShape, reorderMain } from "@/lib/plan/branches";
import * as db from "@/lib/plan/data";
import type { PlanData } from "@/lib/plan/data";
import { fmtDT, fromLocalInput, publishText, templateId, templateName, toLocalInput } from "@/lib/plan/format";
import { collapsedKey, refreshOpenPlans, requestAction, setHub, useActionListener, useHub } from "@/lib/plan/store";
import { currentTaskId, predictTimes, progress, RAG_COLOR, workStatus } from "@/lib/plan/timing";
import type { PlanSettings, Subtask, Task } from "@/lib/plan/types";
import { usePlanData, useViewers } from "@/lib/plan/usePlan";
import { BranchHeader, TaskRow, type Mode, type TaskHandlers } from "./TaskRow";
import TaskEditDrawer from "./TaskEditDrawer";

const NO_KEYS: string[] = [];
const STANDALONE = "https://milestone.derbycontrol.co.uk";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Live view link: on the hub it points at the standalone site so it can go to anyone. */
export function shareUrl(planId: string): string {
  const origin = typeof window !== "undefined" && !/overseer\./.test(window.location.hostname) ? window.location.origin : STANDALONE;
  return `${origin}${BASE}/share/${planId}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export default function Board() {
  const params = useSearchParams();
  const hub = useHub();
  const asked = params.get("plan");
  const planId = asked || hub.open[0]?.id || null;
  const load = usePlanData(planId);

  useEffect(() => {
    setHub({ current: load.data?.plan ?? null });
  }, [load.data]);

  if (!planId) {
    if (!hub.loaded) return <PageSkeleton kind="cards" />;
    return (
      <>
        <PageHeader eyebrow="Incident" title="Milestone plans" subtitle="No incident plans are open." />
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No open plans"
            hint={hub.error ? `Could not reach the database: ${hub.error}` : "Start an incident from scratch or from a template."}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn btn-primary" onClick={() => requestAction("new-incident")}>
                  <Plus size={15} /> New incident
                </button>
                <Link className="btn" href="/templates">
                  <LayoutTemplate size={15} /> Templates
                </Link>
              </div>
            }
          />
        </Card>
      </>
    );
  }
  if (load.missing)
    return (
      <Card>
        <EmptyState title="Plan not found" hint="The link may be out of date, or the plan was removed." action={<Link className="btn" href="/">Back to the board</Link>} />
      </Card>
    );
  if (!load.data) {
    if (load.error) return <Card><EmptyState title="Could not load this plan" hint={load.error} action={<button className="btn" onClick={() => void load.reload()}>Try again</button>} /></Card>;
    return <PageSkeleton kind="cards" />;
  }
  return <PlanView data={load.data} reload={load.reload} />;
}

// ------------------------------------------------------------------ view

function PlanView({ data, reload }: { data: PlanData; reload: () => Promise<void> }) {
  const { plan, tasks, subtasks, edges, settings, active } = data;
  const router = useRouter();
  const hub = useHub();
  const toast = useToast();
  const dialog = useDialog();
  const now = useNow(30_000);
  const mode: Mode = plan.status === "template" ? "template" : plan.status === "closed" ? "closed" : "incident";
  const tpl = mode === "template";

  const shape = useMemo(() => planShape(tasks, edges), [tasks, edges]);
  const predicted = useMemo(() => (tpl ? new Map<string, string>() : predictTimes(tasks, shape, settings.start_time)), [tpl, tasks, shape, settings.start_time]);
  const prog = progress(tasks, shape, active);
  const current = mode === "incident" ? currentTaskId(tasks, shape, active) : null;
  const ws = workStatus(tasks, shape, active, predicted, fmtDT);
  const viewers = useViewers(plan.id, mode === "incident");
  const [collapsedArr, setCollapsed] = useLocalStorage<string[]>(collapsedKey(plan.id), NO_KEYS);
  const collapsed = new Set(collapsedArr);
  const [editing, setEditing] = useState<Task | null>(null);

  const ordered = tasks.slice().sort((a, b) => a.task_number - b.task_number);
  const mainTasks = ordered.filter((t) => !shape.meta.has(t.id));
  const groups = [...shape.groups.values()].sort((a, b) => a.originTaskNumber - b.originTaskNumber || a.label.localeCompare(b.label));
  const byId = new Map(tasks.map((t) => [t.id, t]));

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
    await reload();
  }

  // ------------------------------------------------------------- actions

  async function addTask() {
    const title = await dialog.prompt({ title: "Add task", label: "Task title / description", required: true, confirmLabel: "Add task" });
    if (!title?.trim()) return;
    await run(() => db.addTask(plan.id, nextTaskNumber(tasks, shape, false), title.trim()));
  }

  async function addLinked(from: Task, label: string) {
    const title = await dialog.prompt({
      title: label ? `New step on branch “${label}”` : "Add next step",
      label: "Task title",
      required: true,
      confirmLabel: "Add",
    });
    if (!title?.trim()) return;
    let created: Task | null = null;
    await run(async () => {
      created = await db.addTask(plan.id, nextTaskNumber(tasks, shape, !!label), title.trim(), {
        x: (from.position_x || 120) + 320,
        y: (from.position_y || 70) + (label ? 80 : 0),
      });
      await db.addEdge(plan.id, from.id, created.id, label);
    });
    const id = (created as Task | null)?.id;
    if (id) requestAnimationFrame(() => document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function closeIncident() {
    const ok = await dialog.confirm({
      title: "Close this incident?",
      body: "The plan is locked and moves to Memory, where it can be viewed or cloned.",
      confirmLabel: "Close incident",
      danger: true,
    });
    if (!ok) return;
    try {
      await db.closePlan(plan.id);
      toast.success("Incident closed");
      const open = await refreshOpenPlans();
      router.push(open[0] ? `/?plan=${open[0].id}` : "/");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function publish() {
    const ok = await copyText(publishText(plan, settings, tasks, shape, active, predicted, new Date()));
    if (ok) toast.success("Update copied to the clipboard");
    else toast.error("Could not reach the clipboard");
  }

  async function share() {
    const ok = await copyText(shareUrl(plan.id));
    if (ok) toast.success("Live view link copied");
    else toast.error("Could not reach the clipboard");
  }

  async function useAsIncident() {
    const title = await dialog.prompt({ title: "Use template as incident", label: "Incident title", initial: templateName(plan.title), required: true, confirmLabel: "Create incident" });
    if (!title?.trim()) return;
    try {
      const p = await db.clonePlan(plan.id, title.trim(), "");
      await refreshOpenPlans();
      toast.success("Incident created from template");
      router.push(`/?plan=${p.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function clone() {
    const title = await dialog.prompt({ title: "Clone plan", label: "New plan title", initial: "Cloned plan", required: true, confirmLabel: "Clone" });
    if (!title?.trim()) return;
    try {
      const p = await db.clonePlan(plan.id, title.trim(), plan.description || "");
      await refreshOpenPlans();
      toast.success("Plan cloned");
      router.push(`/?plan=${p.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useActionListener(
    (a) => {
      if (a === "refresh") void reload().then(() => toast.info("Refreshed"));
      if (a === "add-task" && mode !== "closed") void addTask();
      if (mode !== "incident") return;
      if (a === "publish") void publish();
      if (a === "share") void share();
      if (a === "close") void closeIncident();
    },
    [plan.id, mode, tasks, edges, settings, predicted],
  );

  const handlers: TaskHandlers = {
    complete: async (t) => {
      let value = toLocalInput(new Date().toISOString());
      const ok = await dialog.confirm({
        title: `Complete ${t.title}`,
        body: (
          <Field label="Completion time" hint="Edit it if you were late pressing the button.">
            <input className="input" type="datetime-local" defaultValue={value} onChange={(e) => (value = e.target.value)} />
          </Field>
        ),
        confirmLabel: "Confirm done",
      });
      if (!ok) return;
      await run(() => db.updateTask(t.id, { completed_at: fromLocalInput(value) ?? new Date().toISOString() }));
    },
    undo: async (t) => {
      const ok = await dialog.confirm({ title: "Return to incomplete?", body: `${t.title} loses its completion time.`, confirmLabel: "Undo completion" });
      if (ok) await run(() => db.updateTask(t.id, { completed_at: null }));
    },
    setDuration: async (t, v) => {
      if (v === "__custom__") {
        const raw = await dialog.prompt({ title: "Custom duration", label: "Expected duration in minutes", placeholder: "e.g. 75", initial: t.expected_minutes != null ? String(t.expected_minutes) : "", required: true });
        if (raw == null) return;
        const m = Math.max(0, parseInt(raw.trim(), 10) || 0);
        await run(() => db.updateTask(t.id, { expected_minutes: m }));
        return;
      }
      await run(() => db.updateTask(t.id, { expected_minutes: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) }));
    },
    edit: (t) => setEditing(t),
    addNext: (t) => void addLinked(t, shape.meta.get(t.id)?.label ?? ""),
    addBranch: async (t) => {
      const label = await dialog.prompt({ title: "Add branch", label: "Branch label", placeholder: "e.g. if fail, fallback", required: true, confirmLabel: "Next" });
      if (!label?.trim()) return;
      await addLinked(t, label.trim());
    },
    addSubtask: async (t) => {
      const letter = nextSubLetter((subtasks.get(t.id) ?? []).map((s) => s.sub_letter));
      if (!letter) return toast.error("All 26 subtask letters are in use on this task");
      const title = await dialog.prompt({ title: `Add subtask ${letter}`, label: "Subtask title", required: true, confirmLabel: "Add subtask" });
      if (!title?.trim()) return;
      await run(() => db.addSubtask(t.id, letter, title.trim()));
    },
    completeSubtask: (s: Subtask) => void run(() => db.completeSubtask(s.id)),
    deleteSubtask: async (s: Subtask) => {
      const ok = await dialog.confirm({ title: "Delete subtask?", body: `${s.title} is removed from the template.`, confirmLabel: "Delete", danger: true });
      if (ok) await run(() => db.deleteSubtask(s.id));
    },
  };

  async function activate(key: string) {
    const g = shape.groups.get(key);
    if (!g) return;
    await run(async () => {
      await db.setBranchState(plan.id, g.originTaskId, g.label, true);
      await db.setNa(mainAfterOrigin(tasks, shape, g).filter((t) => !t.is_na).map((t) => t.id), true);
      setCollapsed(collapsedArr.filter((k) => k !== key));
    }, `Branch “${g.label}” active`);
  }

  async function deactivate(key: string) {
    const g = shape.groups.get(key);
    if (!g) return;
    const ok = await dialog.confirm({ title: `Deactivate branch “${g.label}”?`, body: "The main line after this step is restored.", confirmLabel: "Deactivate" });
    if (!ok) return;
    await run(async () => {
      await db.setBranchState(plan.id, g.originTaskId, g.label, false);
      await db.setNa(mainAfterOrigin(tasks, shape, g).filter((t) => t.is_na).map((t) => t.id), false);
    }, "Main line restored");
  }

  const toggle = (key: string) => setCollapsed(collapsed.has(key) ? collapsedArr.filter((k) => k !== key) : [...collapsedArr, key]);

  const row = (t: Task) => {
    const origin = shape.byOrigin.get(t.id);
    return (
      <TaskRow
        key={t.id}
        task={t}
        mode={mode}
        shape={shape}
        predicted={predicted.get(t.id)}
        subtasks={subtasks.get(t.id) ?? []}
        isCurrent={t.id === current}
        now={now}
        originActive={origin ? origin.some((k) => active.has(k)) : undefined}
        on={handlers}
      />
    );
  };

  // ------------------------------------------------------------- render

  const tplId = templateId(plan.title) || "MT??";
  const barColor = ws.minutes == null || ws.minutes <= 0 ? "var(--good)" : ws.minutes <= 10 ? "var(--moderate)" : "var(--poor)";

  return (
    <>
      {mode === "incident" && hub.open.length > 1 && (
        <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Open incidents">
          {hub.open.map((p) => (
            <Link key={p.id} href={`/?plan=${p.id}`} className="chip shrink-0" aria-pressed={p.id === plan.id}>
              {p.title}
            </Link>
          ))}
        </nav>
      )}

      <PageHeader
        eyebrow={mode === "incident" ? "Incident" : mode === "template" ? "Template · framework only" : "Memory · read only"}
        back={mode === "closed" ? { href: "/memory", label: "Memory" } : mode === "template" ? { href: "/templates", label: "Templates" } : undefined}
        title={
          tpl ? (
            <>
              <span className="rounded-md bg-sunken px-2 py-0.5 font-mono text-lg text-accent">{tplId}</span>
              {templateName(plan.title)}
            </>
          ) : (
            plan.title
          )
        }
        badge={mode === "closed" ? <Badge>Closed {fmtDT(plan.closed_at)}</Badge> : undefined}
        subtitle={tpl ? "Tasks, subtasks, durations and branches. No timings, completions or refs." : plan.description || undefined}
        actions={
          <>
            <button className="btn btn-ghost btn-icon" onClick={() => void reload().then(() => toast.info("Refreshed"))} aria-label="Refresh" title="Refresh">
              <RefreshCw size={16} />
            </button>
            {mode === "incident" && (
              <>
                <button className="btn" onClick={publish} title="Copy the plan as text for WhatsApp, Teams or email">
                  <Copy size={15} /> Publish
                </button>
                <button className="btn" onClick={share} title="Copy the read-only live view link">
                  <Link2 size={15} /> Share
                </button>
                <button className="btn btn-danger" onClick={closeIncident}>
                  <XCircle size={15} /> Close
                </button>
              </>
            )}
            {mode === "template" && (
              <button className="btn btn-primary" onClick={useAsIncident}>
                <Plus size={15} /> Use as incident
              </button>
            )}
            {mode === "closed" && (
              <button className="btn btn-primary" onClick={clone}>
                <Archive size={15} /> Clone
              </button>
            )}
          </>
        }
      />

      {!tpl && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="card px-4 py-3">
            <div className="lbl mb-0">Progress</div>
            <div className="mt-1 text-2xl font-extrabold tracking-tight tnum">{prog.pct}%</div>
            <div className="prog-track mt-2" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="prog-fill" style={{ width: `${prog.pct}%`, background: barColor }} />
            </div>
            <div className="mt-1 text-xs text-dim">
              {prog.done} of {prog.total} milestones
            </div>
          </div>
          <Stat label="Work status" value={<span style={{ color: ws.rag ? RAG_COLOR[ws.rag] : undefined }} className="text-lg">{ws.text}</span>} sub={ws.detail} />
          <Stat label="Started" value={<span className="text-lg">{settings.start_time ? fmtDT(settings.start_time) : "Not set"}</span>} sub={settings.start_time ? "Predictions run from here" : mode === "closed" ? "No start time was recorded" : "Set it below for predictions"} />
          {mode === "incident" ? (
            <Stat label="Viewers" value={viewers ?? "—"} sub="watching now" icon={Users} />
          ) : (
            <Stat label="Branches" value={shape.groups.size} sub={`${active.size} activated`} icon={GitBranch} />
          )}
        </div>
      )}

      {!tpl && <DetailsCard key={JSON.stringify(settings)} settings={settings} readOnly={mode === "closed"} onSaved={reload} />}

      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-wide">
            Milestones <span className="font-normal text-faint">· {tasks.length} task{tasks.length === 1 ? "" : "s"}</span>
          </h2>
          {mode !== "closed" && (
            <button className="btn btn-primary btn-sm" onClick={addTask}>
              <Plus size={14} /> Add task
            </button>
          )}
        </div>
        {tasks.length === 0 ? (
          <Card>
            <EmptyState icon={ListChecks} title="No tasks yet" hint="Add the first milestone; use Next and Branch on a task to build the line and its contingencies." />
          </Card>
        ) : (
          <div className="space-y-2">
            {mainTasks.map(row)}
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.key);
              return (
                <div key={g.key} className="space-y-2">
                  <BranchHeader
                    group={g}
                    mode={mode}
                    active={active.has(g.key)}
                    collapsed={isCollapsed}
                    doneCount={g.ordered.filter((id) => byId.get(id)?.completed_at).length}
                    onToggle={() => toggle(g.key)}
                    onActivate={() => void activate(g.key)}
                    onDeactivate={() => void deactivate(g.key)}
                  />
                  {!isCollapsed && (
                    <div className="space-y-2 border-l-2 border-dashed border-[color-mix(in_srgb,var(--verypoor)_45%,transparent)] pl-3">
                      {g.ordered.map((id) => byId.get(id)).filter((t): t is Task => !!t).map(row)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <TaskEditDrawer
          key={editing.id}
          task={editing}
          tasks={tasks}
          shape={shape}
          onClose={() => setEditing(null)}
          onRename={async (title) => {
            await run(() => db.updateTask(editing.id, { title }), "Title saved");
            setEditing(null);
          }}
          onReorder={async (pos) => {
            await run(async () => {
              for (const u of reorderMain(tasks, shape, editing.id, pos)) await db.updateTask(u.id, { task_number: u.task_number });
            }, "Main line renumbered");
            setEditing(null);
          }}
          onDelete={async (ids) => {
            const ok = await dialog.confirm({ title: ids.length > 1 ? `Delete ${ids.length} tasks?` : "Delete this task?", body: "This cannot be undone.", confirmLabel: "Delete", danger: true });
            if (!ok) return;
            await run(() => db.deleteTasks(ids), ids.length > 1 ? "Branch deleted" : "Task deleted");
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------- details

function DetailsCard({ settings, readOnly, onSaved }: { settings: PlanSettings; readOnly: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [s, setS] = useState(settings);
  const [start, setStart] = useState(toLocalInput(settings.start_time));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof PlanSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setS({ ...s, [k]: e.target.value });
    setDirty(true);
  };
  const v = (k: keyof PlanSettings) => (s[k] as string | null) ?? "";

  async function save() {
    setBusy(true);
    try {
      await db.saveSettings({ ...s, start_time: start ? fromLocalInput(start) : null });
      toast.success("Incident details saved");
      setDirty(false);
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Incident details"
      subtitle="Start time drives every predicted time"
      action={
        !readOnly && (
          <span className="flex items-center gap-2">
            <span className="text-xs text-faint">{dirty ? "Unsaved changes" : "Saved"}</span>
            <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={save}>
              Save
            </button>
          </span>
        )
      }
    >
      <fieldset disabled={readOnly} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Start time" className="col-span-2 sm:col-span-1">
          <input
            className="input"
            type="datetime-local"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setDirty(true);
            }}
          />
        </Field>
        <Field label="FMS ref">
          <input className="input" value={v("fms_ref")} onChange={set("fms_ref")} placeholder="e.g. FMS123456" />
        </Field>
        <Field label="CCIL ref">
          <input className="input" value={v("ccil_ref")} onChange={set("ccil_ref")} placeholder="e.g. CCIL-0000" />
        </Field>
        <Field label="TDA ref">
          <input className="input" value={v("tda_ref")} onChange={set("tda_ref")} placeholder="e.g. TDA-0000" />
        </Field>
        <Field label="TPIC name">
          <input className="input" value={v("tpic_name")} onChange={set("tpic_name")} placeholder="Name" />
        </Field>
        <Field label="TPIC phone">
          <input className="input" type="tel" value={v("tpic_phone")} onChange={set("tpic_phone")} placeholder="Phone" />
        </Field>
        <Field label="MMIC name">
          <input className="input" value={v("mmic_name")} onChange={set("mmic_name")} placeholder="Name" />
        </Field>
        <Field label="MMIC phone">
          <input className="input" type="tel" value={v("mmic_phone")} onChange={set("mmic_phone")} placeholder="Phone" />
        </Field>
      </fieldset>
    </Card>
  );
}
