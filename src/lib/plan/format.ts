// Dates as the control room reads them (UK, 24 hour), template ids, durations and the Publish text.

import { displayNumber, type PlanShape } from "./branches.ts";
import { progress } from "./timing.ts";
import type { Plan, PlanSettings, Task } from "./types.ts";

const DT = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

export function fmtDT(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DT.format(d);
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (local time) → ISO; parsed by hand so Safari agrees. */
export function fromLocalInput(value: string): string | null {
  const [date, time] = String(value || "").split("T");
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

export function fmtDuration(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m < 60) return `${m} mins`;
  return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`;
}

/** Duration choices: 0 to 12 hours in 10-minute steps. */
export const DURATION_STEPS: number[] = Array.from({ length: 73 }, (_, i) => i * 10);

// ------------------------------------------------------------- templates

export function templateId(title: string | null | undefined): string | null {
  const m = String(title || "").match(/^(MT\d+)\b/i);
  return m ? m[1].toUpperCase() : null;
}

export function templateName(title: string | null | undefined): string {
  const m = String(title || "").match(/^MT\d+\s*-\s*(.*)$/i);
  return m ? m[1].trim() : String(title || "");
}

/** MT01, MT02 … one past the highest in use. */
export function nextTemplateId(titles: string[]): string {
  let max = 0;
  for (const t of titles) {
    const m = String(t || "").match(/^MT(\d+)\b/i);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return "MT" + String(max + 1).padStart(2, "0");
}

// --------------------------------------------------------------- publish

/** The plain-text update copied by Publish (for WhatsApp / Teams / email). */
export function publishText(
  plan: Plan,
  settings: PlanSettings | null,
  tasks: Task[],
  shape: PlanShape,
  active: Set<string>,
  predicted: Map<string, string>,
  now: Date,
): string {
  const s = settings;
  const lines: string[] = [`📋 ${plan.title || "Milestone Plan"}`];
  if (plan.description) lines.push(plan.description);
  lines.push(`Published: ${fmtDT(now.toISOString()).replace(",", "")}`, "");
  if (s?.fms_ref || s?.ccil_ref || s?.tda_ref) lines.push(`Refs: FMS ${s.fms_ref || "-"} | CCIL ${s.ccil_ref || "-"} | TDA ${s.tda_ref || "-"}`);
  if (s?.tpic_name || s?.tpic_phone) lines.push(`TPIC: ${s.tpic_name || "-"} ${s.tpic_phone || ""}`.trim());
  if (s?.mmic_name || s?.mmic_phone) lines.push(`MMIC: ${s.mmic_name || "-"} ${s.mmic_phone || ""}`.trim());
  lines.push("");
  const sorted = tasks.slice().sort((a, b) => a.task_number - b.task_number);
  const p = progress(tasks, shape, active);
  lines.push(`Progress: ${p.done}/${p.total} (${p.pct}%)`, "Milestones:");
  for (const t of sorted) {
    const pred = predicted.get(t.id);
    let line = `${displayNumber(t, shape)}. ${(t.title || "(untitled)").trim()} (Pred: ${pred ? fmtDT(pred).replace(",", "") : "—"})`;
    if (t.completed_at) line += ` ✔ Done ${fmtDT(t.completed_at).replace(",", "")}`;
    if (t.is_na) line += " [N/A]";
    const m = shape.meta.get(t.id);
    if (m) line += ` [Branch: ${m.label}]`;
    lines.push(line);
  }
  return lines.join("\n");
}
