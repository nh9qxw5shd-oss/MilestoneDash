// Predicted times, RAG and the work status line.
//
// Predictions are derived, never stored: the main line runs from the plan's start time, each step
// adding its expected duration in task_number order; a branch line starts from its origin step's
// predicted time. With no start time there are no predictions.

import { displayNumber, trackableIds, type PlanShape } from "./branches.ts";
import type { Task } from "./types.ts";

export type Rag = "green" | "amber" | "red";

const MIN = 60_000;
const mins = (t: Task) => Math.max(0, Number(t.expected_minutes ?? 0) || 0);

export function predictTimes(tasks: Task[], shape: PlanShape, startIso: string | null): Map<string, string> {
  const out = new Map<string, string>();
  const start = startIso ? new Date(startIso).getTime() : NaN;
  if (!Number.isFinite(start)) return out;

  let cursor = start;
  for (const t of tasks.filter((x) => !shape.meta.has(x.id)).sort((a, b) => a.task_number - b.task_number)) {
    cursor += mins(t) * MIN;
    out.set(t.id, new Date(cursor).toISOString());
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const g of shape.groups.values()) {
    const from = out.get(g.originTaskId);
    let c = from ? new Date(from).getTime() : start;
    for (const id of g.ordered) {
      const t = byId.get(id);
      if (!t) continue;
      c += mins(t) * MIN;
      out.set(id, new Date(c).toISOString());
    }
  }
  return out;
}

/** Whole minutes from b to a (positive when a is later). */
export function minutesBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(aIso).getTime() - new Date(bIso).getTime()) / MIN);
}

/** Completed: variance against prediction. Open: now against prediction. Up to 10 minutes is amber. */
export function ragFor(task: Task, predicted: string | undefined, now: Date): Rag | null {
  if (!predicted) return null;
  const v = task.completed_at ? minutesBetween(task.completed_at, predicted) : minutesBetween(now.toISOString(), predicted);
  if (v <= 0) return "green";
  if (v <= 10) return "amber";
  return "red";
}

export interface Pill {
  text: string;
  rag: Rag;
}

/** Completed against predicted: early / on time / late. */
export function variancePill(v: number): Pill {
  if (v === 0) return { text: "On time", rag: "green" };
  if (v < 0) return { text: `${Math.abs(v)}m early`, rag: "green" };
  return { text: `${v}m late`, rag: v <= 10 ? "amber" : "red" };
}

/** Open task: delta = now − predicted (positive means overdue). */
export function duePill(delta: number): Pill {
  if (delta <= -1) return { text: `Due in ${Math.abs(delta)}m`, rag: "green" };
  if (delta === 0) return { text: "Due now", rag: "amber" };
  return { text: `${delta}m overdue`, rag: delta <= 10 ? "amber" : "red" };
}

export interface Progress {
  done: number;
  total: number;
  pct: number;
}

export function progress(tasks: Task[], shape: PlanShape, active: Set<string>): Progress {
  const track = trackableIds(tasks, shape, active);
  const done = tasks.filter((t) => track.has(t.id) && !!t.completed_at).length;
  const total = track.size;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** The step in hand: the lowest-numbered trackable task not done and not N/A. */
export function currentTaskId(tasks: Task[], shape: PlanShape, active: Set<string>): string | null {
  const track = trackableIds(tasks, shape, active);
  const pending = tasks.filter((t) => track.has(t.id) && !t.completed_at && !t.is_na).sort((a, b) => a.task_number - b.task_number);
  return pending[0]?.id ?? null;
}

export interface WorkStatus {
  text: string;
  rag: Rag | null;
  detail: string;
  /** Minutes behind (positive) or ahead (negative) at the last checkpoint. */
  minutes: number | null;
}

/** Ahead / behind at the last completed trackable step that has a prediction. */
export function workStatus(
  tasks: Task[],
  shape: PlanShape,
  active: Set<string>,
  predicted: Map<string, string>,
  fmt: (iso: string) => string,
): WorkStatus {
  const track = trackableIds(tasks, shape, active);
  const done = tasks.filter((t) => track.has(t.id) && t.completed_at && predicted.has(t.id)).sort((a, b) => a.task_number - b.task_number);
  const last = done[done.length - 1];
  if (!last) return { text: "No checkpoints yet", rag: null, detail: "Awaiting the first completed milestone.", minutes: null };
  const diff = minutesBetween(last.completed_at!, predicted.get(last.id)!);
  const detail = `Last checkpoint: ${displayNumber(last, shape)} completed ${fmt(last.completed_at!)}`;
  if (diff === 0) return { text: "On target", rag: "green", detail, minutes: 0 };
  if (diff < 0) return { text: `${Math.abs(diff)} min ahead`, rag: "green", detail, minutes: diff };
  return { text: `${diff} min behind`, rag: diff <= 10 ? "amber" : "red", detail, minutes: diff };
}

export const RAG_COLOR: Record<Rag, string> = { green: "var(--good)", amber: "var(--moderate)", red: "var(--poor)" };
