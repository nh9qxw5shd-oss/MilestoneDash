// Row shapes of the Mini Project Hub tables MilestoneDash owns (plans, tasks, subtasks, edges and
// the plan_* tables). Predicted times are never stored: they are derived from the plan's start time
// and each task's expected duration (see timing.ts).

export type PlanStatus = "open" | "template" | "closed";

export interface Plan {
  id: string;
  title: string;
  description: string | null;
  status: PlanStatus;
  created_at: string | null;
  closed_at: string | null;
}

export interface Task {
  id: string;
  plan_id: string;
  task_number: number;
  title: string;
  expected_minutes: number | null;
  completed_at: string | null;
  is_na: boolean;
  position_x: number | null;
  position_y: number | null;
  branch_group_id: string | null;
  branch_seq: number | null;
  created_at?: string | null;
}

export interface Subtask {
  id: string;
  task_id: string;
  sub_letter: string;
  title: string;
  completed_at: string | null;
  created_at?: string | null;
}

export interface Edge {
  id?: string;
  plan_id?: string;
  from_task_id: string;
  to_task_id: string;
  label: string | null;
  created_at?: string | null;
}

export interface PlanSettings {
  plan_id: string;
  start_time: string | null;
  tpic_name: string | null;
  tpic_phone: string | null;
  mmic_name: string | null;
  mmic_phone: string | null;
  fms_ref: string | null;
  ccil_ref: string | null;
  tda_ref: string | null;
}

export interface BranchState {
  origin_task_id: string;
  label: string;
  is_active: boolean;
}

export const EMPTY_SETTINGS = (planId: string): PlanSettings => ({
  plan_id: planId,
  start_time: null,
  tpic_name: null,
  tpic_phone: null,
  mmic_name: null,
  mmic_phone: null,
  fms_ref: null,
  ccil_ref: null,
  tda_ref: null,
});
