"use client";

// "Save as template": copies a plan (normally a closed one from Memory that worked well) into a
// new template with the next MT id. Tasks, subtasks, durations and branches carry across;
// completions, timings and refs do not. The source plan is left as it is.

import { useRouter } from "next/navigation";
import { useDialog, useToast } from "@/components/uiFeedback";
import { saveAsTemplate } from "@/lib/plan/data";
import { templateName } from "@/lib/plan/format";
import type { Plan } from "@/lib/plan/types";

export function useSaveAsTemplate(): (p: Plan) => Promise<void> {
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  return async (p) => {
    const name = await dialog.prompt({
      title: "Save as template",
      body: "Tasks, subtasks, durations and branches are copied into a new template with the next MT id. Completions, timings and refs are not. This plan is unchanged.",
      label: "Template name",
      initial: templateName(p.title),
      required: true,
      confirmLabel: "Save as template",
    });
    if (!name?.trim()) return;
    try {
      const t = await saveAsTemplate(p.id, name);
      toast.success(`Saved as ${t.title.split(" - ")[0]}`);
      router.push(`/?plan=${t.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
}
