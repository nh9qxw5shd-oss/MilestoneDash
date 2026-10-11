// Supabase reads and writes. Every write here is one the original page made, with the same shape.

import { sb } from "@/lib/supabase";
import { groupKey } from "./branches.ts";
import type { BranchState, Edge, Plan, PlanSettings, PlanStatus, Subtask, Task } from "./types.ts";
import { EMPTY_SETTINGS } from "./types.ts";

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

// ----------------------------------------------------------------- plans

export async function listPlans(status: PlanStatus): Promise<Plan[]> {
  const q = sb().from("plans").select("*").eq("status", status);
  const res =
    status === "closed"
      ? await q.order("closed_at", { ascending: false }).limit(100)
      : await q.order("created_at", { ascending: false }).limit(200);
  return check(res, "Loading plans") ?? [];
}

export async function getPlan(id: string): Promise<Plan | null> {
  return check(await sb().from("plans").select("*").eq("id", id).maybeSingle(), "Loading plan");
}

export async function createPlan(title: string, description: string, status: "open" | "template"): Promise<Plan> {
  return check(await sb().from("plans").insert({ title, description, status }).select("*").single(), "Creating plan");
}

export async function closePlan(id: string): Promise<void> {
  check(await sb().from("plans").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", id), "Closing plan");
}

export async function templateTitles(): Promise<string[]> {
  const rows = check(await sb().from("plans").select("title").eq("status", "template"), "Loading templates") ?? [];
  return (rows as { title: string }[]).map((r) => r.title);
}

/** Templates are the only plans that are ever deleted: subtasks, edges and tasks first. */
export async function deleteTemplate(id: string): Promise<void> {
  const rows = check(await sb().from("tasks").select("id").eq("plan_id", id), "Reading template") ?? [];
  const ids = (rows as { id: string }[]).map((t) => t.id);
  if (ids.length) check(await sb().from("subtasks").delete().in("task_id", ids), "Deleting subtasks");
  check(await sb().from("edges").delete().eq("plan_id", id), "Deleting links");
  check(await sb().from("tasks").delete().eq("plan_id", id), "Deleting tasks");
  check(await sb().from("plans").delete().eq("id", id).eq("status", "template"), "Deleting template");
}

/** A fresh open plan with the source's tasks, subtasks and links (completions and N/A reset). */
export async function clonePlan(sourceId: string, title: string, description: string): Promise<Plan> {
  const plan = await createPlan(title, description, "open");
  const src = (check(await sb().from("tasks").select("*").eq("plan_id", sourceId).order("task_number", { ascending: true }), "Reading tasks") ?? []) as Task[];
  const map = new Map<string, string>();
  for (const t of src) {
    const row = check(
      await sb()
        .from("tasks")
        .insert({
          plan_id: plan.id,
          task_number: t.task_number,
          title: t.title,
          expected_minutes: t.expected_minutes ?? null,
          branch_group_id: t.branch_group_id || null,
          branch_seq: t.branch_seq ?? null,
          predicted_time: null,
          completed_at: null,
          is_na: false,
          position_x: t.position_x,
          position_y: t.position_y,
        })
        .select("id")
        .single(),
      "Copying task",
    ) as { id: string };
    map.set(t.id, row.id);
  }
  if (src.length) {
    const subs = (check(await sb().from("subtasks").select("*").in("task_id", src.map((t) => t.id)).order("created_at", { ascending: true }), "Reading subtasks") ?? []) as Subtask[];
    const rows = subs.filter((s) => map.has(s.task_id)).map((s) => ({ task_id: map.get(s.task_id)!, sub_letter: s.sub_letter, title: s.title, completed_at: null }));
    if (rows.length) check(await sb().from("subtasks").insert(rows), "Copying subtasks");
  }
  const edges = (check(await sb().from("edges").select("*").eq("plan_id", sourceId).order("created_at", { ascending: true }), "Reading links") ?? []) as Edge[];
  const erows = edges
    .filter((e) => map.has(e.from_task_id) && map.has(e.to_task_id))
    .map((e) => ({ plan_id: plan.id, from_task_id: map.get(e.from_task_id)!, to_task_id: map.get(e.to_task_id)!, label: e.label || "" }));
  if (erows.length) check(await sb().from("edges").insert(erows), "Copying links");
  return plan;
}

// ------------------------------------------------------------- plan data

export interface PlanData {
  plan: Plan;
  tasks: Task[];
  subtasks: Map<string, Subtask[]>;
  edges: Edge[];
  settings: PlanSettings;
  active: Set<string>;
}

export async function loadPlanData(plan: Plan): Promise<PlanData> {
  const [tRes, eRes, bRes, sRes] = await Promise.all([
    sb().from("tasks").select("*").eq("plan_id", plan.id).order("task_number", { ascending: true }),
    sb().from("edges").select("*").eq("plan_id", plan.id).order("created_at", { ascending: true }),
    sb().from("plan_branch_states").select("origin_task_id,label,is_active").eq("plan_id", plan.id).eq("is_active", true),
    plan.status === "template" ? Promise.resolve({ data: null, error: null }) : sb().from("plan_settings").select("*").eq("plan_id", plan.id).maybeSingle(),
  ]);
  const tasks = (check(tRes, "Loading tasks") ?? []) as Task[];
  const subtasks = new Map<string, Subtask[]>();
  if (tasks.length) {
    const sRows = (check(await sb().from("subtasks").select("*").in("task_id", tasks.map((t) => t.id)).order("created_at", { ascending: true }), "Loading subtasks") ?? []) as Subtask[];
    for (const s of sRows) subtasks.set(s.task_id, [...(subtasks.get(s.task_id) ?? []), s]);
  }
  const active = new Set(((bRes.data ?? []) as BranchState[]).map((r) => groupKey(r.origin_task_id, r.label)));
  return {
    plan,
    tasks,
    subtasks,
    edges: (eRes.data ?? []) as Edge[],
    settings: { ...EMPTY_SETTINGS(plan.id), ...((sRes.data as Partial<PlanSettings> | null) ?? {}) },
    active,
  };
}

export async function saveSettings(s: PlanSettings): Promise<void> {
  const clean = (v: string | null) => (v ?? "").trim() || null;
  check(
    await sb()
      .from("plan_settings")
      .upsert(
        {
          plan_id: s.plan_id,
          tpic_name: clean(s.tpic_name),
          tpic_phone: clean(s.tpic_phone),
          mmic_name: clean(s.mmic_name),
          mmic_phone: clean(s.mmic_phone),
          fms_ref: clean(s.fms_ref),
          ccil_ref: clean(s.ccil_ref),
          tda_ref: clean(s.tda_ref),
          start_time: s.start_time,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "plan_id" },
      ),
    "Saving settings",
  );
}

// ------------------------------------------------------------------ tasks

export async function addTask(planId: string, taskNumber: number, title: string, pos?: { x: number; y: number }): Promise<Task> {
  const row: Record<string, unknown> = { plan_id: planId, task_number: taskNumber, title };
  if (pos) Object.assign(row, { position_x: Math.round(pos.x), position_y: Math.round(pos.y) });
  return check(await sb().from("tasks").insert(row).select("*").single(), "Adding task");
}

export async function addEdge(planId: string, from: string, to: string, label: string): Promise<void> {
  check(await sb().from("edges").insert({ plan_id: planId, from_task_id: from, to_task_id: to, label }), "Linking task");
}

export async function updateTask(id: string, patch: Partial<Pick<Task, "title" | "task_number" | "expected_minutes" | "completed_at">>): Promise<void> {
  check(await sb().from("tasks").update(patch).eq("id", id), "Updating task");
}

export async function setNa(ids: string[], isNa: boolean): Promise<void> {
  if (ids.length) check(await sb().from("tasks").update({ is_na: isNa }).in("id", ids), "Updating the main line");
}

export async function deleteTasks(ids: string[]): Promise<void> {
  for (const id of ids) check(await sb().from("edges").delete().or(`from_task_id.eq.${id},to_task_id.eq.${id}`), "Deleting links");
  for (const id of ids) check(await sb().from("tasks").delete().eq("id", id), "Deleting task");
}

export async function setBranchState(planId: string, originTaskId: string, label: string, isActive: boolean): Promise<void> {
  check(
    await sb()
      .from("plan_branch_states")
      .upsert({ plan_id: planId, origin_task_id: originTaskId, label, is_active: isActive, updated_at: new Date().toISOString() }, { onConflict: "plan_id,origin_task_id,label" }),
    "Saving branch state",
  );
}

// --------------------------------------------------------------- subtasks

export async function addSubtask(taskId: string, letter: string, title: string): Promise<void> {
  check(await sb().from("subtasks").insert({ task_id: taskId, sub_letter: letter, title }), "Adding subtask");
}

export async function completeSubtask(id: string): Promise<void> {
  check(await sb().from("subtasks").update({ completed_at: new Date().toISOString() }).eq("id", id), "Completing subtask");
}

export async function deleteSubtask(id: string): Promise<void> {
  check(await sb().from("subtasks").delete().eq("id", id), "Deleting subtask");
}

// ---------------------------------------------------------------- viewers

/** Presence heartbeat: a viewer counts for two minutes after their last ping. */
export const VIEWER_TTL_MS = 120_000;
export const VIEWER_PING_MS = 30_000;

export async function touchViewer(planId: string, viewerId: string): Promise<void> {
  await sb().from("plan_viewers").upsert({ plan_id: planId, viewer_id: viewerId, last_seen: new Date().toISOString() }, { onConflict: "plan_id,viewer_id" });
}

export async function countViewers(planId: string): Promise<number | null> {
  const since = new Date(Date.now() - VIEWER_TTL_MS).toISOString();
  const { data, error } = await sb().from("plan_viewers").select("viewer_id").eq("plan_id", planId).gte("last_seen", since);
  if (error) return null;
  return new Set((data ?? []).map((r: { viewer_id: string }) => r.viewer_id)).size;
}
