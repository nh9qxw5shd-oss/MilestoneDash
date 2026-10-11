"use client";

// Edit a task: rename it, move it along the main line (renumbering 1..N), or delete it. Deleting
// the first step of a branch removes the whole branch.

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Drawer, Field } from "@/components/ui";
import { displayNumber, tasksToDelete, type PlanShape } from "@/lib/plan/branches";
import type { Task } from "@/lib/plan/types";

export default function TaskEditDrawer({
  task,
  tasks,
  shape,
  onClose,
  onRename,
  onReorder,
  onDelete,
}: {
  task: Task;
  tasks: Task[];
  shape: PlanShape;
  onClose: () => void;
  onRename: (title: string) => Promise<void>;
  onReorder: (pos: number) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const isBranch = shape.meta.has(task.id);
  const main = tasks.filter((t) => !shape.meta.has(t.id)).sort((a, b) => a.task_number - b.task_number);
  const currentPos = main.findIndex((t) => t.id === task.id) + 1;
  const [pos, setPos] = useState(currentPos || 1);
  const [busy, setBusy] = useState(false);
  const del = tasksToDelete(task.id, shape);

  async function wrap(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={`Edit ${displayNumber(task, shape)}`} subtitle={task.title} width="max-w-lg">
      <div className="space-y-6">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && title.trim() !== task.title) void wrap(() => onRename(title.trim()));
          }}
        >
          <Field label="Task title" hint="Keeps its number, history and branch state.">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <button className="btn btn-primary btn-sm" disabled={busy || !title.trim() || title.trim() === task.title}>
            Save title
          </button>
        </form>

        <div className="space-y-2">
          <Field label="Position on the main line" hint={isBranch ? "Branch steps keep their order; reorder main-line steps only." : "Main-line steps are renumbered 1..N with no gaps."}>
            <select className="input" value={pos} disabled={isBranch} onChange={(e) => setPos(Number(e.target.value))}>
              {main.map((t, i) => (
                <option key={t.id} value={i + 1}>
                  {i + 1}. {t.title.slice(0, 90)}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn btn-sm" disabled={busy || isBranch || pos === currentPos} onClick={() => void wrap(() => onReorder(pos))}>
            Move to position {pos}
          </button>
        </div>

        <div className="rounded-lg border border-edge p-3">
          <div className="text-sm font-semibold">Delete task</div>
          <p className="mt-1 text-xs text-dim">
            Removes the task and its subtasks permanently.
            {del.length > 1 && ` This is the first step of a branch, so the whole branch (${del.length} tasks) goes with it.`}
          </p>
          <button className="btn btn-danger btn-sm mt-2" disabled={busy} onClick={() => void wrap(() => onDelete(del))}>
            <Trash2 size={14} /> Delete {del.length > 1 ? `${del.length} tasks` : "task"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
