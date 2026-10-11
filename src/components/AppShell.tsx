"use client";

// Application shell (Autumn Hub kit): grouped sidebar with a sliding active indicator and the open
// incident plans, a top bar with search, the open-plan count, the London clock and the theme
// toggle. The read-only live view (/share/<plan>) renders without the shell.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ReactNode, Suspense, useLayoutEffect, useRef, useState } from "react";
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Sun, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useHydrated, useLocalStorage, useNow } from "@/lib/hooks";
import { NAV } from "@/lib/nav";
import { requestAction, useHub, useOpenPlansPolling } from "@/lib/plan/store";
import { fmtDT } from "@/lib/plan/format";
import { StatusDot } from "@/components/ui";
import { CommandPalette, openPalette } from "@/components/CommandPalette";
import NewPlanDrawer from "@/components/plan/NewPlanDrawer";

// Milestone flag in Network Rail orange (same mark as the favicon, src/app/icon.svg).
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path fill="#F26522" d="M7 3h2v26H7zM10 4h15l-3.5 5L25 14H10z" />
      <circle cx="8" cy="27" r="3" fill="#F26522" />
    </svg>
  );
}

// ---------------------------------------------------------------- sidebar

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const params = useSearchParams();
  const current = path === "/" ? (params.get("plan") ?? "") : "";
  const { open } = useHub();
  const shown = current || (path === "/" ? (open[0]?.id ?? "") : "");
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const ind = indicatorRef.current;
    if (!list || !ind) return;
    const active = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      ind.style.opacity = "0";
      return;
    }
    const lr = list.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    ind.style.opacity = "1";
    ind.style.transform = `translateY(${ar.top - lr.top + 6}px)`;
    ind.style.height = `${ar.height - 12}px`;
  }, [path, shown, open.length]);

  const onOpenPlan = open.some((p) => p.id === shown);

  return (
    <div ref={listRef} className="relative">
      <span ref={indicatorRef} className="nav-indicator" style={{ top: 0, opacity: 0 }} />
      {NAV.map((g) => (
        <div key={g.label}>
          <div className="nav-group-label">{g.label}</div>
          {g.items.map((it) => (
            <Link key={it.href} href={it.href} className="nav-item" aria-current={path === it.href && !onOpenPlan ? "page" : undefined} title={it.desc} onClick={onNavigate}>
              <it.icon size={17} strokeWidth={2.1} />
              <span className="nav-label">{it.label}</span>
            </Link>
          ))}
        </div>
      ))}
      <div className="nav-group-label">Open incidents</div>
      {open.map((p) => (
        <Link
          key={p.id}
          href={`/?plan=${p.id}`}
          className="nav-item"
          aria-current={p.id === shown ? "page" : undefined}
          title={`${p.title}${p.created_at ? ` · opened ${fmtDT(p.created_at)}` : ""}`}
          onClick={onNavigate}
        >
          <StatusDot color="var(--moderate)" pulse={p.id === shown} />
          <span className="nav-label truncate">{p.title}</span>
        </Link>
      ))}
      {open.length === 0 && <p className="nav-label px-5 py-1 text-xs text-faint">None open</p>}
      <button
        className="nav-item w-[calc(100%-1rem)] text-dim"
        onClick={() => {
          requestAction("new-plan");
          onNavigate?.();
        }}
      >
        <Plus size={17} />
        <span className="nav-label">New plan</span>
      </button>
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className="sidebar hidden lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-4 py-4">
        <BrandMark />
        <span className="nav-label leading-tight">
          <span className="block text-[15px] font-extrabold tracking-tight">Milestone Plans</span>
          <span className="block text-[11px] font-semibold text-faint">Incident recovery tracker</span>
        </span>
      </Link>
      <div className="flex-1 overflow-y-auto pb-4">
        <Suspense>
          <SidebarNav />
        </Suspense>
      </div>
      <div className="border-t border-edge p-2">
        <button className="nav-item w-[calc(100%-1rem)] text-faint" onClick={onToggle} title={collapsed ? "Expand navigation" : "Collapse navigation"}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span className="nav-label text-xs">Collapse</span>
        </button>
      </div>
    </aside>
  );
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="backdrop lg:hidden" onMouseDown={onClose}>
      <div className="sheet flex h-full w-72 max-w-[85vw] flex-col border-r border-edge bg-sunken" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4">
          <span className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-[15px] font-extrabold">Milestone Plans</span>
          </span>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          <Suspense>
            <SidebarNav onNavigate={onClose} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- topbar

function OpenCount() {
  const { open, loaded, error } = useHub();
  if (!loaded) return null;
  const color = error ? "var(--poor)" : open.length ? "var(--moderate)" : "var(--good)";
  return (
    <span className="chip !cursor-default" title={error ?? "Open incident plans"}>
      <span className="dot" style={{ color }} />
      {error ? "Offline" : `${open.length} open`}
    </span>
  );
}

function Clock() {
  const now = useNow(15000);
  const hydrated = useHydrated();
  if (!hydrated) return null;
  const hhmm = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const day = now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "Europe/London" });
  return (
    <span className="hidden items-baseline gap-1.5 text-sm md:inline-flex" title="Europe/London">
      <span className="font-mono text-base font-semibold tabular-nums">{hhmm}</span>
      <span className="text-xs text-dim">{day}</span>
    </span>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const light = theme === "light";
  return (
    <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label={light ? "Switch to dark theme" : "Switch to light theme"} title={light ? "Switch to dark theme" : "Switch to light theme"}>
      <span key={theme} className="pop inline-flex">
        {light ? <Moon size={17} /> : <Sun size={17} />}
      </span>
    </button>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="topbar glass flex items-center gap-2 px-3 sm:px-4">
      <button className="btn btn-ghost btn-icon lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu size={18} />
      </button>
      <Link href="/" className="flex items-center gap-2 lg:hidden">
        <BrandMark size={22} />
        <span className="text-sm font-extrabold">Milestones</span>
      </Link>
      <button className="btn btn-ghost ml-1 hidden min-w-[220px] justify-start gap-2 border border-edge bg-sunken text-dim sm:flex" onClick={() => openPalette()} title="Search plans and actions">
        <Search size={15} />
        <span className="flex-1 text-left text-xs font-medium">Search or jump to…</span>
        <span className="flex gap-0.5">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>
      <button className="btn btn-ghost btn-icon sm:hidden" onClick={() => openPalette()} aria-label="Search">
        <Search size={18} />
      </button>
      <div className="flex-1" />
      <OpenCount />
      <Clock />
      <ThemeToggle />
    </header>
  );
}

// ------------------------------------------------------------------ shell

function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useLocalStorage("milestone_nav_collapsed", false);
  const [menuOpen, setMenuOpen] = useState(false);
  useOpenPlansPolling();
  return (
    <div className="app-shell" data-collapsed={collapsed ? "true" : "false"}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <main className="content flex-1">{children}</main>
        <footer className="content !py-4 text-xs text-faint">Milestone Plans · Derby Control · Predictions run from the plan start time and each step&apos;s expected duration</footer>
      </div>
      <CommandPalette />
      <NewPlanDrawer />
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/share/")) return <>{children}</>;
  return <Shell>{children}</Shell>;
}
