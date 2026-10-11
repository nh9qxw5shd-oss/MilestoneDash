"use client";

// Templates: reusable frameworks with an MT id. Edit opens the template on the board; "Use as
// incident" copies its tasks, subtasks, durations and branches into a new open plan.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutTemplate, Pencil, Plus, Search, Siren, Trash2 } from "lucide-react";
import { Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { useDialog, useToast } from "@/components/uiFeedback";
import { clonePlan, deleteTemplate, listPlans } from "@/lib/plan/data";
import { fmtDT, templateId, templateName } from "@/lib/plan/format";
import { refreshOpenPlans, requestAction } from "@/lib/plan/store";
import type { Plan } from "@/lib/plan/types";

export default function Templates() {
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);

  useEffect(() => {
    listPlans("template")
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setRows((r) => r ?? []);
      });
  }, [tick]);

  async function use(p: Plan) {
    const title = await dialog.prompt({ title: "Use template as incident", label: "Incident title", initial: templateName(p.title), required: true, confirmLabel: "Create incident" });
    if (!title?.trim()) return;
    try {
      const plan = await clonePlan(p.id, title.trim(), "");
      await refreshOpenPlans();
      toast.success("Incident created from template");
      router.push(`/?plan=${plan.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(p: Plan) {
    const ok = await dialog.confirm({
      title: `Delete ${p.title}?`,
      body: "Its tasks, subtasks and links are removed. Incidents already started from it are not affected. This cannot be undone.",
      confirmLabel: "Delete template",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteTemplate(p.id);
      toast.success("Template deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
    load();
  }

  const needle = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((p) => !needle || p.title.toLowerCase().includes(needle));

  return (
    <>
      <PageHeader
        eyebrow="Plans"
        title="Templates"
        subtitle="Pre-built frameworks (tasks, subtasks, durations, branches) to start an incident from."
        actions={
          <button className="btn btn-primary" onClick={() => requestAction("new-template")}>
            <Plus size={15} /> New template
          </button>
        }
      />
      <div className="relative mb-4 max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className="input !pl-9" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" />
      </div>
      {rows === null ? (
        <PageSkeleton kind="table" />
      ) : (
        <Card padded={false} title={`${shown.length} template${shown.length === 1 ? "" : "s"}`} subtitle={error ?? undefined}>
          {shown.length === 0 ? (
            <EmptyState icon={LayoutTemplate} title={needle ? "No templates match" : "No templates yet"} hint={needle ? undefined : "Create one with New template."} />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {shown.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="rounded-md bg-sunken px-2 py-0.5 font-mono text-xs font-bold text-accent">{templateId(p.title) ?? "MT??"}</span>
                  <Link href={`/?plan=${p.id}`} className="min-w-0 flex-1 basis-40">
                    <span className="block truncate text-sm font-semibold hover:text-accent">{templateName(p.title)}</span>
                    <span className="block text-xs text-faint">Created {fmtDT(p.created_at)}</span>
                  </Link>
                  <span className="flex flex-wrap gap-1.5">
                    <Link className="btn btn-ghost btn-sm" href={`/?plan=${p.id}`}>
                      <Pencil size={14} /> Edit
                    </Link>
                    <button className="btn btn-sm" onClick={() => use(p)}>
                      <Siren size={14} /> Use as incident
                    </button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(p)} aria-label={`Delete ${p.title}`} title="Delete template">
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
