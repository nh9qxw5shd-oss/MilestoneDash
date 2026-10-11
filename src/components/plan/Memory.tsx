"use client";

// Memory: closed plans, read-only, grouped by the month they closed (latest month open). View opens
// the plan on the board in read-only mode; Clone starts a fresh open plan from it; Save as
// template keeps a plan that worked well as a reusable framework.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronDown, Copy, Eye, LayoutTemplate, Search } from "lucide-react";
import { Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { useDialog, useToast } from "@/components/uiFeedback";
import { clonePlan, listPlans } from "@/lib/plan/data";
import { fmtDT } from "@/lib/plan/format";
import { refreshOpenPlans } from "@/lib/plan/store";
import type { Plan } from "@/lib/plan/types";
import { useSaveAsTemplate } from "./useSaveAsTemplate";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export default function Memory() {
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();
  const toTemplate = useSaveAsTemplate();
  const [rows, setRows] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    listPlans("closed")
      .then((r) => setRows(r))
      .catch((e: Error) => {
        setError(e.message);
        setRows([]);
      });
  }, []);

  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const out: { key: string; label: string; plans: Plan[] }[] = [];
    for (const p of rows ?? []) {
      if (needle && !p.title.toLowerCase().includes(needle) && !(p.description ?? "").toLowerCase().includes(needle)) continue;
      const d = p.closed_at ? new Date(p.closed_at) : null;
      const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "undated";
      const label = d ? MONTH.format(d) : "No close date";
      const g = out.find((x) => x.key === key);
      if (g) g.plans.push(p);
      else out.push({ key, label, plans: [p] });
    }
    return out;
  }, [rows, needle]);

  async function clone(p: Plan) {
    const title = await dialog.prompt({ title: "Clone plan", label: "New plan title", initial: "Cloned plan", required: true, confirmLabel: "Clone" });
    if (!title?.trim()) return;
    try {
      const plan = await clonePlan(p.id, title.trim(), p.description || "");
      await refreshOpenPlans();
      toast.success("Plan cloned");
      router.push(`/?plan=${plan.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Plans" title="Memory" subtitle="Closed plans, read-only. Clone one to reuse it now, or save a good one as a template for later." />
      <div className="relative mb-4 max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className="input !pl-9" placeholder="Search titles and descriptions…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search closed plans" />
      </div>
      {rows === null ? (
        <PageSkeleton kind="table" />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={Archive} title={needle ? "Nothing matches" : "No closed plans"} hint={error ?? (needle ? "Try another word." : "Closed incidents appear here.")} />
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g, i) => {
            // Latest month open by default; a search opens every group that matches.
            const open = toggled[g.key] ?? (needle ? true : i === 0);
            return (
              <Card key={g.key} padded={false}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  aria-expanded={open}
                  onClick={() => setToggled({ ...toggled, [g.key]: !open })}
                >
                  <ChevronDown size={16} className={`text-faint transition-transform ${open ? "" : "-rotate-90"}`} />
                  <span className="flex-1 text-sm font-bold">{g.label}</span>
                  <span className="text-xs text-dim">
                    {g.plans.length} plan{g.plans.length === 1 ? "" : "s"}
                  </span>
                </button>
                {open && (
                  <ul className="divide-y divide-[var(--border)] border-t border-edge">
                    {g.plans.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <Link href={`/?plan=${p.id}`} className="min-w-0 flex-1 basis-48">
                          <span className="block truncate text-sm font-semibold hover:text-accent">{p.title}</span>
                          <span className="block truncate text-xs text-faint">
                            Closed {fmtDT(p.closed_at)}
                            {p.description ? ` · ${p.description}` : ""}
                          </span>
                        </Link>
                        <span className="flex flex-wrap gap-1.5">
                          <Link className="btn btn-ghost btn-sm" href={`/?plan=${p.id}`}>
                            <Eye size={14} /> View
                          </Link>
                          <button className="btn btn-sm" onClick={() => clone(p)}>
                            <Copy size={14} /> Clone
                          </button>
                          <button className="btn btn-sm" onClick={() => toTemplate(p)} title="Keep this plan as a reusable template">
                            <LayoutTemplate size={14} /> Save as template
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
