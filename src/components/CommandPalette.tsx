"use client";

// Command palette (Ctrl/Cmd + K): pages, actions and every plan (open, templates, closed).

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, CornerDownLeft, Copy, LayoutTemplate, Link2, ListChecks, LucideIcon, Plus, RefreshCw, Search, Siren, XCircle } from "lucide-react";
import { useHotkey } from "@/lib/hooks";
import { NAV_ITEMS } from "@/lib/nav";
import { PlanAction, requestAction, useHub } from "@/lib/plan/store";
import { listPlans } from "@/lib/plan/data";
import { fmtDT, templateId, templateName } from "@/lib/plan/format";
import type { Plan } from "@/lib/plan/types";

const OPEN_EVENT = "milestone:palette";
export function openPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

interface Item {
  id: string;
  group: string;
  title: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

function score(item: Item, q: string): number {
  const hay = `${item.title} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  if (!q) return 1;
  const terms = q.split(/\s+/).filter(Boolean);
  let s = 0;
  for (const t of terms) {
    if (item.title.toLowerCase().startsWith(t)) s += 3;
    else if (item.title.toLowerCase().includes(t)) s += 2;
    else if (hay.includes(t)) s += 1;
    else return 0;
  }
  return s;
}

export function CommandPalette() {
  const router = useRouter();
  const { open: openList, current: cur } = useHub();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [others, setOthers] = useState<Plan[]>([]);

  function show() {
    setQ("");
    setCursor(0);
    setOpen(true);
    void Promise.all([listPlans("template"), listPlans("closed")])
      .then(([t, c]) => setOthers([...t, ...c]))
      .catch(() => undefined);
  }

  useHotkey("mod+k", () => (open ? setOpen(false) : show()), { inInputs: true });
  useHotkey("escape", () => setOpen(false), { inInputs: true });

  useEffect(() => {
    const on = () => show();
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);

  const items = useMemo<Item[]>(() => {
    const act = (id: PlanAction, title: string, icon: LucideIcon, hint: string, keywords: string): Item => ({ id: `a-${id}`, group: "Actions", title, hint, icon, keywords, run: () => requestAction(id) });
    const actions: Item[] = [
      act("new-incident", "New incident plan", Siren, "Live tracking with start time, refs and command structure", "new create incident plan"),
      act("new-template", "New template", LayoutTemplate, "A reusable framework with an MT id", "new create template"),
    ];
    if (cur && cur.status !== "closed") actions.push(act("add-task", "Add task", Plus, `To ${cur.title}`, "add new task milestone step"));
    if (cur && cur.status === "open") {
      actions.push(
        act("publish", "Publish update", Copy, "Copies the plan as text for WhatsApp, Teams or email", "publish copy text update"),
        act("share", "Copy live view link", Link2, "Read-only page that refreshes itself", "share link live view"),
        act("close", "Close incident", XCircle, "Locks the plan and moves it to Memory", "close end finish lock"),
      );
    }
    if (cur) actions.push(act("refresh", "Refresh", RefreshCw, "Reload this plan", "refresh reload"));
    const pages: Item[] = NAV_ITEMS.map((n) => ({ id: `p-${n.href}`, group: "Pages", title: n.label, hint: n.desc, icon: n.icon, run: () => router.push(n.href) }));
    const plan = (p: Plan, group: string, icon: LucideIcon, title: string, hint: string): Item => ({ id: `x-${p.id}`, group, title, hint, icon, keywords: p.description ?? "", run: () => router.push(`/?plan=${p.id}`) });
    const openPlans = openList.map((p) => plan(p, "Open incidents", ListChecks, p.title, p.created_at ? `Opened ${fmtDT(p.created_at)}` : "Open"));
    const tpl = others.filter((p) => p.status === "template").map((p) => plan(p, "Templates", LayoutTemplate, `${templateId(p.title) ?? "MT??"} ${templateName(p.title)}`, "Template"));
    const closed = others.filter((p) => p.status === "closed").map((p) => plan(p, "Memory", Archive, p.title, p.closed_at ? `Closed ${fmtDT(p.closed_at)}` : "Closed"));
    return [...actions, ...openPlans, ...pages, ...tpl, ...closed];
  }, [cur, openList, others, router]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(
    () =>
      (needle
        ? items
            .map((it) => ({ it, s: score(it, needle) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .map((x) => x.it)
        : items.filter((it) => it.group !== "Memory")
      ).slice(0, 18),
    [needle, items],
  );

  const resultsKey = `${needle}|${results.length}`;
  const [seenKey, setSeenKey] = useState(resultsKey);
  if (seenKey !== resultsKey) {
    setSeenKey(resultsKey);
    setCursor(0);
  }

  function go(item: Item) {
    setOpen(false);
    item.run();
  }

  if (!open) return null;

  const groups: { name: string; items: Item[] }[] = [];
  for (const it of results) {
    const g = groups.find((x) => x.name === it.group);
    if (g) g.items.push(it);
    else groups.push({ name: it.group, items: [it] });
  }
  let idx = -1;

  return (
    <div className="backdrop flex items-start justify-center px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal aria-label="Command palette" className="card scale-in w-full max-w-xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-edge px-3">
          <Search size={16} className="text-faint" />
          <input
            autoFocus
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            placeholder="Find a plan or template, add a task, publish…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (results[cursor]) go(results[cursor]);
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-dim">Nothing matches “{q}”.</p>}
          {groups.map((g) => (
            <div key={g.name} className="mb-1">
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">{g.name}</div>
              {g.items.map((it) => {
                idx += 1;
                const i = idx;
                const active = i === cursor;
                return (
                  <button
                    key={it.id}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${active ? "text-ink" : "text-dim hover:bg-hover hover:text-ink"}`}
                    style={active ? { background: "var(--accent-soft)" } : undefined}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(it)}
                  >
                    <it.icon size={16} className={active ? "text-accent" : "text-faint"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{it.title}</span>
                      {it.hint && <span className="block truncate text-xs text-faint">{it.hint}</span>}
                    </span>
                    {active ? <CornerDownLeft size={14} className="text-faint" /> : <ArrowRight size={14} className="opacity-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-edge px-3 py-2 text-[11px] text-faint">
          <span className="flex items-center gap-1">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">↵</kbd> open
          </span>
          <span className="ml-auto">Closed plans appear when you type</span>
        </div>
      </div>
    </div>
  );
}
