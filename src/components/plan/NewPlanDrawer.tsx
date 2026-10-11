"use client";

// New plan: an incident (live tracking with timings, refs and command structure) or a template
// (a reusable framework with an auto-assigned MT id). Opened from the sidebar, the palette or the
// pages through the shared action event.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutTemplate, Siren } from "lucide-react";
import { Drawer, Field } from "@/components/ui";
import { useToast } from "@/components/uiFeedback";
import { createPlan, templateTitles } from "@/lib/plan/data";
import { nextTemplateId } from "@/lib/plan/format";
import { refreshOpenPlans, useActionListener } from "@/lib/plan/store";

type Kind = "incident" | "template";

export default function NewPlanDrawer() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("incident");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [mtId, setMtId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function start(k: Kind) {
    setKind(k);
    setTitle("");
    setDesc("");
    setOpen(true);
    setMtId(null);
    void templateTitles()
      .then((t) => setMtId(nextTemplateId(t)))
      .catch(() => setMtId(null));
  }

  useActionListener(
    (a) => {
      if (a === "new-plan" || a === "new-incident") start("incident");
      if (a === "new-template") start("template");
    },
    [],
  );

  async function create() {
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      if (kind === "incident") {
        const plan = await createPlan(name, desc.trim(), "open");
        await refreshOpenPlans();
        toast.success("Incident plan created");
        router.push(`/?plan=${plan.id}`);
      } else {
        // Re-read the ids in case someone else created a template meanwhile.
        const id = nextTemplateId(await templateTitles());
        const plan = await createPlan(`${id} - ${name}`, "", "template");
        toast.success(`Template ${id} created`);
        router.push(`/?plan=${plan.id}`);
      }
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title="New plan"
      subtitle="Incidents track live; templates are frameworks to start incidents from"
      width="max-w-lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!title.trim() || busy} onClick={create}>
            {kind === "incident" ? "Create incident" : "Create template"}
          </button>
        </>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            { k: "incident" as const, icon: Siren, t: "Incident", s: "Start time, FMS / CCIL / TDA refs, TPIC and MMIC, predictions and completions." },
            { k: "template" as const, icon: LayoutTemplate, t: "Template", s: "Tasks, subtasks, durations and branches only. No timings or refs." },
          ]
        ).map((o) => (
          <button
            key={o.k}
            type="button"
            className="card card-link p-3 text-left"
            style={kind === o.k ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}
            aria-pressed={kind === o.k}
            onClick={() => setKind(o.k)}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <o.icon size={16} className={kind === o.k ? "text-accent" : "text-faint"} /> {o.t}
            </span>
            <span className="mt-1 block text-xs text-dim">{o.s}</span>
          </button>
        ))}
      </div>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        {kind === "incident" ? (
          <>
            <Field label="Incident / fault title" required>
              <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rough ride at platform 5" />
            </Field>
            <Field label="Brief description">
              <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short context" />
            </Field>
          </>
        ) : (
          <Field label="Template name" required hint={<>Template id is assigned automatically{mtId ? <>: <span className="font-mono font-semibold text-ink">{mtId}</span></> : null}.</>}>
            <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rough ride" />
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
