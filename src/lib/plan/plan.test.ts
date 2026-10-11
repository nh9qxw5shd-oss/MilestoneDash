import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayNumber, groupKey, mainAfterOrigin, nextSubLetter, nextTaskNumber, planShape, reorderMain, tasksToDelete, trackableIds } from "./branches.ts";
import { currentTaskId, duePill, predictTimes, progress, ragFor, variancePill, workStatus } from "./timing.ts";
import { fromLocalInput, nextTemplateId, publishText, templateId, templateName, toLocalInput } from "./format.ts";
import type { Edge, Plan, Task } from "./types.ts";

const task = (id: string, n: number, extra: Partial<Task> = {}): Task => ({
  id,
  plan_id: "p",
  task_number: n,
  title: `Task ${id}`,
  expected_minutes: 30,
  completed_at: null,
  is_na: false,
  position_x: 0,
  position_y: 0,
  branch_group_id: null,
  branch_seq: null,
  ...extra,
});

// Main line 1 → 2 → 3; "if fail" branch from step 2: b1 → b2 (as Add branch / Add next create them).
const tasks = [task("t1", 1), task("t2", 2), task("t3", 3), task("b1", 9004), task("b2", 9005)];
const edges: Edge[] = [
  { from_task_id: "t2", to_task_id: "b1", label: "if fail" },
  { from_task_id: "b1", to_task_id: "b2", label: "if fail" },
];

describe("plan shape", () => {
  const shape = planShape(tasks, edges);
  it("keeps the main line and finds the labelled branch", () => {
    assert.deepEqual([...shape.main], ["t1", "t2", "t3"]);
    const g = shape.groups.get(groupKey("t2", "if fail"))!;
    assert.deepEqual(g.ordered, ["b1", "b2"]);
    assert.equal(displayNumber(tasks[3], shape), "B2-1");
    assert.equal(displayNumber(tasks[4], shape), "B2-2");
    assert.equal(displayNumber(tasks[2], shape), "3");
  });
  it("counts only the main line until a branch is activated", () => {
    assert.deepEqual([...trackableIds(tasks, shape, new Set())].sort(), ["t1", "t2", "t3"]);
    const key = groupKey("t2", "if fail");
    const naTasks = tasks.map((t) => (t.id === "t3" ? { ...t, is_na: true } : t));
    assert.deepEqual([...trackableIds(naTasks, shape, new Set([key]))].sort(), ["b1", "b2", "t1", "t2"]);
    assert.deepEqual(mainAfterOrigin(tasks, shape, shape.groups.get(key)!).map((t) => t.id), ["t3"]);
  });
  it("numbers new tasks: main line continues, branches go to 9000+", () => {
    assert.equal(nextTaskNumber(tasks, shape, false), 4);
    assert.equal(nextTaskNumber(tasks, shape, true), 9000 + 9006);
    assert.equal(nextTaskNumber([], planShape([], []), false), 1);
  });
  it("deletes a whole branch from its entry task, a single task otherwise", () => {
    assert.deepEqual(tasksToDelete("b1", shape).sort(), ["b1", "b2"]);
    assert.deepEqual(tasksToDelete("b2", shape), ["b2"]);
    assert.deepEqual(tasksToDelete("t3", shape), ["t3"]);
  });
  it("renumbers the main line on reorder", () => {
    assert.deepEqual(reorderMain(tasks, shape, "t3", 1), [
      { id: "t3", task_number: 1 },
      { id: "t1", task_number: 2 },
      { id: "t2", task_number: 3 },
    ]);
    assert.deepEqual(reorderMain(tasks, shape, "b1", 1), []);
  });
  it("hands out subtask letters in order", () => {
    assert.equal(nextSubLetter([]), "a");
    assert.equal(nextSubLetter(["a", "B"]), "c");
    assert.equal(nextSubLetter([..."abcdefghijklmnopqrstuvwxyz"]), null);
  });
});

describe("timing", () => {
  const shape = planShape(tasks, edges);
  const start = "2026-10-11T10:00:00.000Z";
  const pred = predictTimes(tasks, shape, start);
  it("chains the main line from the start time and branches from their origin", () => {
    assert.equal(pred.get("t1"), "2026-10-11T10:30:00.000Z");
    assert.equal(pred.get("t3"), "2026-10-11T11:30:00.000Z");
    assert.equal(pred.get("b1"), "2026-10-11T11:30:00.000Z");
    assert.equal(pred.get("b2"), "2026-10-11T12:00:00.000Z");
    assert.equal(predictTimes(tasks, shape, null).size, 0);
  });
  it("rates tasks green / amber / red with ten minutes of amber", () => {
    const now = new Date("2026-10-11T10:35:00.000Z");
    assert.equal(ragFor(tasks[0], pred.get("t1"), now), "amber");
    assert.equal(ragFor(tasks[1], pred.get("t2"), now), "green");
    assert.equal(ragFor({ ...tasks[0], completed_at: "2026-10-11T10:45:00.000Z" }, pred.get("t1"), now), "red");
    assert.deepEqual(variancePill(-4), { text: "4m early", rag: "green" });
    assert.deepEqual(variancePill(11), { text: "11m late", rag: "red" });
    assert.deepEqual(duePill(-5), { text: "Due in 5m", rag: "green" });
    assert.deepEqual(duePill(0), { text: "Due now", rag: "amber" });
  });
  it("reports progress, the current step and the last checkpoint", () => {
    const done = tasks.map((t) => (t.id === "t1" ? { ...t, completed_at: "2026-10-11T10:42:00.000Z" } : t));
    assert.deepEqual(progress(done, shape, new Set()), { done: 1, total: 3, pct: 33 });
    assert.equal(currentTaskId(done, shape, new Set()), "t2");
    const ws = workStatus(done, shape, new Set(), pred, () => "x");
    assert.equal(ws.text, "12 min behind");
    assert.equal(ws.rag, "red");
    assert.equal(workStatus(tasks, shape, new Set(), pred, () => "x").rag, null);
  });
});

describe("format", () => {
  it("reads template ids and names", () => {
    assert.equal(templateId("mt03 - Rough ride"), "MT03");
    assert.equal(templateName("MT03 - Rough ride"), "Rough ride");
    assert.equal(templateName("Plain"), "Plain");
    assert.equal(nextTemplateId(["MT01 - a", "MT07 - b", "x"]), "MT08");
    assert.equal(nextTemplateId([]), "MT01");
  });
  it("round-trips datetime-local values", () => {
    const iso = fromLocalInput("2026-10-11T09:05")!;
    assert.equal(toLocalInput(iso), "2026-10-11T09:05");
    assert.equal(fromLocalInput("nonsense"), null);
  });
  it("builds the publish text with branch numbers", () => {
    const shape = planShape(tasks, edges);
    const plan: Plan = { id: "p", title: "Points failure", description: null, status: "open", created_at: null, closed_at: null };
    const txt = publishText(plan, null, tasks, shape, new Set(), new Map(), new Date());
    assert.match(txt, /^📋 Points failure/);
    assert.match(txt, /Progress: 0\/3 \(0%\)/);
    assert.match(txt, /B2-1\. Task b1 \(Pred: —\) \[Branch: if fail\]/);
  });
});
