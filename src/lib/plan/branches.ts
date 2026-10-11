// The plan's shape: which tasks form the main line and which hang off it as contingency branches.
//
// A branch exists only where a main-line task links to another task through a LABELLED edge
// ("if fail", "fallback"). Unlabelled edges continue a line; where none is stored the main line
// falls back to task_number order, skipping tasks that are entered by a labelled edge. Branch
// tasks are numbered B<origin step>-<seq> and, until their line is activated, do not count
// towards progress.

import type { Edge, Task } from "./types.ts";

export interface BranchGroup {
  key: string;
  originTaskId: string;
  originTaskNumber: number;
  label: string;
  taskIds: Set<string>;
  /** Branch task ids in display order (task_number). */
  ordered: string[];
}

export interface BranchMeta {
  groupKey: string;
  originTaskNumber: number;
  label: string;
  seq: number;
}

export interface PlanShape {
  main: Set<string>;
  groups: Map<string, BranchGroup>;
  byOrigin: Map<string, string[]>;
  meta: Map<string, BranchMeta>;
}

const lbl = (e: Edge) => (e.label || "").trim();
const byNumber = (a: Task, b: Task) => a.task_number - b.task_number;

export function groupKey(originTaskId: string, label: string): string {
  return `${originTaskId}::${(label || "").trim()}`;
}

/** Stored edges plus the implied sequential main line where nothing links consecutive tasks. */
export function effectiveEdges(tasks: Task[], edges: Edge[]): Edge[] {
  const sorted = tasks.slice().sort(byNumber);
  const has = new Set(edges.map((e) => `${e.from_task_id}|${e.to_task_id}`));
  const incomingLabelled = new Set(edges.filter((e) => lbl(e)).map((e) => e.to_task_id));
  const defaults: Edge[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!has.has(`${a.id}|${b.id}`) && !incomingLabelled.has(a.id) && !incomingLabelled.has(b.id)) {
      defaults.push({ from_task_id: a.id, to_task_id: b.id, label: "" });
    }
  }
  return edges.concat(defaults);
}

/** Walk from the lowest-numbered task, preferring unlabelled edges, else the next unbranched number. */
export function mainLine(tasks: Task[], edges: Edge[]): Set<string> {
  const main = new Set<string>();
  const sorted = tasks.slice().sort(byNumber);
  if (!sorted.length) return main;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const idx = new Map(sorted.map((t, i) => [t.id, i]));
  const outgoing = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!outgoing.has(e.from_task_id)) outgoing.set(e.from_task_id, []);
    outgoing.get(e.from_task_id)!.push(e);
  }
  const incomingLabelled = new Set(edges.filter((e) => lbl(e)).map((e) => e.to_task_id));

  let cur: Task | undefined = sorted[0];
  while (cur && !main.has(cur.id)) {
    main.add(cur.id);
    const unlabelled = (outgoing.get(cur.id) || []).filter((e) => !lbl(e) && byId.has(e.to_task_id));
    if (unlabelled.length) {
      unlabelled.sort((a, b) => byId.get(a.to_task_id)!.task_number - byId.get(b.to_task_id)!.task_number);
      cur = byId.get(unlabelled[0].to_task_id);
      continue;
    }
    let j = (idx.get(cur.id) ?? sorted.length) + 1;
    while (j < sorted.length && incomingLabelled.has(sorted[j].id)) j++;
    cur = sorted[j];
  }
  return main;
}

export function planShape(tasks: Task[], edges: Edge[]): PlanShape {
  const all = effectiveEdges(tasks, edges);
  const main = mainLine(tasks, all);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const outgoing = new Map<string, Edge[]>();
  for (const e of all) {
    if (!outgoing.has(e.from_task_id)) outgoing.set(e.from_task_id, []);
    outgoing.get(e.from_task_id)!.push(e);
  }

  const groups = new Map<string, BranchGroup>();
  const byOrigin = new Map<string, string[]>();
  const meta = new Map<string, BranchMeta>();

  for (const e of all) {
    if (!main.has(e.from_task_id) || !lbl(e)) continue;
    const origin = byId.get(e.from_task_id);
    if (!origin) continue;
    const label = lbl(e);
    const key = groupKey(e.from_task_id, label);

    // Everything reachable from the branch entry without re-joining the main line.
    const taskIds = groups.get(key)?.taskIds ?? new Set<string>();
    const queue = [e.to_task_id];
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (main.has(id) || !byId.has(id)) continue;
      taskIds.add(id);
      for (const oe of outgoing.get(id) || []) if (!seen.has(oe.to_task_id)) queue.push(oe.to_task_id);
    }
    if (!taskIds.size && byId.has(e.to_task_id)) taskIds.add(e.to_task_id);

    const ordered = [...taskIds].sort((a, b) => (byId.get(a)?.task_number ?? 1e9) - (byId.get(b)?.task_number ?? 1e9));
    groups.set(key, { key, originTaskId: origin.id, originTaskNumber: origin.task_number, label, taskIds, ordered });
    const list = byOrigin.get(origin.id) ?? [];
    if (!list.includes(key)) list.push(key);
    byOrigin.set(origin.id, list);
    ordered.forEach((id, i) => meta.set(id, { groupKey: key, originTaskNumber: origin.task_number, label, seq: i + 1 }));
  }

  return { main, groups, byOrigin, meta };
}

export function displayNumber(task: Task, shape: PlanShape): string {
  const m = shape.meta.get(task.id);
  return m ? `B${m.originTaskNumber}-${m.seq}` : String(task.task_number);
}

/**
 * Tasks that count towards progress: the main line less N/A steps, plus every task of an
 * activated branch line. With no main line (an empty edge set on one task) all tasks count.
 */
export function trackableIds(tasks: Task[], shape: PlanShape, active: Set<string>): Set<string> {
  const main = shape.main.size ? shape.main : new Set(tasks.map((t) => t.id));
  const out = new Set(tasks.filter((t) => main.has(t.id) && !t.is_na).map((t) => t.id));
  for (const k of active) shape.groups.get(k)?.taskIds.forEach((id) => out.add(id));
  return out;
}

/** Main-line steps after a branch's origin: marked N/A when the branch is activated, restored after. */
export function mainAfterOrigin(tasks: Task[], shape: PlanShape, group: BranchGroup): Task[] {
  return tasks.filter((t) => shape.main.has(t.id) && t.task_number > group.originTaskNumber);
}

/** Next number for a new task: main line continues from its highest step; a branch task sorts after everything at 9000+. */
export function nextTaskNumber(tasks: Task[], shape: PlanShape, branch: boolean): number {
  if (branch) {
    const all = tasks.map((t) => t.task_number || 0);
    return 9000 + (all.length ? Math.max(...all) + 1 : 1);
  }
  const main = tasks.filter((t) => shape.main.has(t.id)).map((t) => t.task_number || 0);
  return main.length ? Math.max(...main) + 1 : 1;
}

/** Deleting the first task of a branch takes the whole branch with it. */
export function tasksToDelete(taskId: string, shape: PlanShape): string[] {
  const m = shape.meta.get(taskId);
  const g = m && m.seq === 1 ? shape.groups.get(m.groupKey) : undefined;
  return g ? [...g.taskIds] : [taskId];
}

/** New main-line numbering (1..N) after moving one main-line task to a new position. */
export function reorderMain(tasks: Task[], shape: PlanShape, taskId: string, newPos: number): { id: string; task_number: number }[] {
  const main = tasks.filter((t) => !shape.meta.has(t.id)).sort(byNumber);
  const from = main.findIndex((t) => t.id === taskId);
  if (from < 0 || newPos < 1 || newPos > main.length) return [];
  const moved = main.splice(from, 1)[0];
  main.splice(newPos - 1, 0, moved);
  return main.map((t, i) => ({ id: t.id, task_number: i + 1 })).filter((u, i) => main[i].task_number !== u.task_number);
}

/** Next free subtask letter (a–z), or null once the alphabet is used up. */
export function nextSubLetter(existing: string[]): string | null {
  const used = new Set(existing.map((s) => (s || "").toLowerCase()));
  for (const ch of "abcdefghijklmnopqrstuvwxyz") if (!used.has(ch)) return ch;
  return null;
}
