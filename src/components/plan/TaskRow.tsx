"use client";

// One milestone on the board, and the heading that opens each contingency branch.

import { Check, CornerDownRight, GitBranch, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { displayNumber, type BranchGroup, type PlanShape } from "@/lib/plan/branches";
import { DURATION_STEPS, fmtDT, fmtDuration, fmtTime } from "@/lib/plan/format";
import { duePill, minutesBetween, RAG_COLOR, ragFor, variancePill, type Pill } from "@/lib/plan/timing";
import type { Subtask, Task } from "@/lib/plan/types";

export type Mode = "incident" | "template" | "closed";

export interface TaskHandlers {
  complete: (t: Task) => void;
  undo: (t: Task) => void;
  setDuration: (t: Task, value: string) => void;
  edit: (t: Task) => void;
  addNext: (t: Task) => void;
  addBranch: (t: Task) => void;
  addSubtask: (t: Task) => void;
  completeSubtask: (s: Subtask) => void;
  deleteSubtask: (s: Subtask) => void;
}

function PillBadge({ pill }: { pill: Pill }) {
  return <Badge color={RAG_COLOR[pill.rag]}>{pill.text}</Badge>;
}

function DurationSelect({ task, disabled, onChange }: { task: Task; disabled: boolean; onChange: (v: string) => void }) {
  const cur = task.expected_minutes;
  const inGrid = cur != null && cur % 10 === 0 && cur >= 0 && cur <= 720;
  return (
    <select
      className="input !h-8 !w-auto !py-0 text-xs"
      value={cur == null ? "" : String(cur)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Expected duration"
      title="Expected duration: drives the predicted times"
    >
      <option value="">Duration —</option>
      {cur != null && !inGrid && <option value={String(cur)}>{cur} mins (custom)</option>}
      {DURATION_STEPS.map((m) => (
        <option key={m} value={String(m)}>
          {fmtDuration(m)}
        </option>
      ))}
      <option value="__custom__">Custom…</option>
    </select>
  );
}

export function TaskRow({
  task,
  mode,
  shape,
  predicted,
  subtasks,
  isCurrent,
  now,
  originActive,
  on,
}: {
  task: Task;
  mode: Mode;
  shape: PlanShape;
  predicted?: string;
  subtasks: Subtask[];
  isCurrent: boolean;
  now: Date;
  /** For a branch origin: whether any of its branches is active (undefined when it has none). */
  originActive?: boolean;
  on: TaskHandlers;
}) {
  const tpl = mode === "template";
  const closed = mode === "closed";
  const done = !!task.completed_at;
  const na = !tpl && task.is_na;
  const rag = tpl || na ? null : ragFor(task, predicted, now);
  const meta = shape.meta.get(task.id);
  const num = displayNumber(task, shape);

  let timing: React.ReactNode = null;
  if (!tpl) {
    if (done) {
      timing = (
        <>
          Completed {fmtDT(task.completed_at)} {predicted && <PillBadge pill={variancePill(minutesBetween(task.completed_at!, predicted))} />}
        </>
      );
    } else if (na) {
      timing = "Not applicable: a branch line has replaced this step";
    } else if (predicted) {
      timing = (
        <>
          Predicted {fmtDT(predicted)} <PillBadge pill={duePill(minutesBetween(now.toISOString(), predicted))} />
        </>
      );
    } else {
      timing = closed ? "Not completed" : "Predicted — set a start time and durations";
    }
  }

  return (
    <article
      id={`task-${task.id}`}
      className={`card task-row ${isCurrent ? "is-current" : ""} ${na ? "is-na" : ""} ${done && !tpl ? "is-done" : ""}`}
      style={{ borderLeftColor: rag ? RAG_COLOR[rag] : undefined }}
    >
      <div className="flex gap-3 p-3 sm:p-4">
        <div className="task-num" title={meta ? `Branch “${meta.label}” from step ${meta.originTaskNumber}` : `Step ${num}`}>
          {done && !tpl ? <Check size={15} /> : num}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 break-words text-sm font-semibold">{task.title}</h3>
            {done && !tpl && <span className="font-mono text-[11px] text-faint">{num}</span>}
            {isCurrent && <Badge color="var(--accent)">In progress</Badge>}
            {na && <Badge>N/A</Badge>}
            {originActive !== undefined &&
              (tpl ? <Badge color="var(--verypoor)">Branch point</Badge> : <Badge color={originActive ? "var(--moderate)" : "var(--verypoor)"}>{originActive ? "Contingency: active" : "Contingency: ready"}</Badge>)}
          </div>
          {timing && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">{timing}</div>}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {!tpl &&
              !closed &&
              (done ? (
                <button className="btn btn-ghost btn-sm" onClick={() => on.undo(task)} title="Return this task to incomplete">
                  <Undo2 size={14} /> Done {fmtTime(task.completed_at)} · undo
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={na} onClick={() => on.complete(task)}>
                  <Check size={14} /> Complete
                </button>
              ))}
            <DurationSelect task={task} disabled={closed || (!tpl && (done || na))} onChange={(v) => on.setDuration(task, v)} />
            {!closed && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => on.addNext(task)} title={meta ? `Add the next step on branch “${meta.label}”` : "Add the next step after this one"}>
                  <CornerDownRight size={14} /> Next
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => on.addBranch(task)} title="Add a contingency branch from this step">
                  <GitBranch size={14} /> Branch
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => on.addSubtask(task)}>
                  <Plus size={14} /> Subtask
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => on.edit(task)} aria-label="Edit task" title="Edit, reorder or delete">
                  <Pencil size={14} />
                </button>
              </>
            )}
          </div>

          {subtasks.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-edge bg-sunken">
              {subtasks.map((s) => {
                const sDone = !!s.completed_at;
                return (
                  <li key={s.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <span className="w-12 shrink-0 font-mono text-xs font-semibold text-faint">
                      {num}
                      {s.sub_letter}
                    </span>
                    <span className={`min-w-0 flex-1 break-words ${sDone && !tpl ? "text-dim line-through decoration-[var(--text-faint)]" : ""}`}>{s.title}</span>
                    {tpl ? (
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => on.deleteSubtask(s)} aria-label={`Delete subtask ${s.sub_letter}`} title="Delete subtask">
                        <Trash2 size={14} />
                      </button>
                    ) : sDone ? (
                      <span className="shrink-0 text-xs text-[var(--good)]" title={fmtDT(s.completed_at)}>
                        ✓ {fmtTime(s.completed_at)}
                      </span>
                    ) : closed ? (
                      <span className="shrink-0 text-xs text-faint">Open</span>
                    ) : (
                      <button className="btn btn-ghost btn-sm shrink-0" onClick={() => on.completeSubtask(s)}>
                        Complete
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

export function BranchHeader({
  group,
  mode,
  active,
  collapsed,
  doneCount,
  onToggle,
  onActivate,
  onDeactivate,
}: {
  group: BranchGroup;
  mode: Mode;
  active: boolean;
  collapsed: boolean;
  doneCount: number;
  onToggle: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const n = group.taskIds.size;
  return (
    <div className="branch-head flex flex-wrap items-center gap-2 px-1 pt-3">
      <GitBranch size={15} className="text-[var(--verypoor)]" />
      <span className="text-sm font-semibold">
        Branch from step {group.originTaskNumber}: <span className="text-[var(--verypoor)]">{group.label}</span>
      </span>
      {mode !== "template" && <Badge color={active ? "var(--moderate)" : "var(--text-dim)"}>{active ? "Active" : "Standby"}</Badge>}
      <span className="text-xs text-faint">
        {n} step{n === 1 ? "" : "s"}
        {mode !== "template" && doneCount ? ` · ${doneCount} done` : ""}
      </span>
      <span className="flex-1" />
      <button className="btn btn-ghost btn-sm" onClick={onToggle} aria-expanded={!collapsed}>
        {collapsed ? "Show" : "Hide"}
      </button>
      {mode === "incident" &&
        (active ? (
          <button className="btn btn-ghost btn-sm" onClick={onDeactivate} title="Restore the main line">
            Deactivate
          </button>
        ) : (
          <button className="btn btn-sm" onClick={onActivate} title="Switch to this line: later main-line steps become N/A">
            Activate line
          </button>
        ))}
    </div>
  );
}
