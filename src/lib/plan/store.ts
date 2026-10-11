"use client";

// State shared by the shell (sidebar list of open incidents), the command palette and the pages,
// plus the actions the palette and sidebar can ask the board to run.

import { useEffect, useSyncExternalStore } from "react";
import { listPlans } from "./data.ts";
import type { Plan } from "./types.ts";

export interface HubState {
  open: Plan[];
  /** The plan on the board (any status), for the palette. */
  current: Plan | null;
  loaded: boolean;
  error: string | null;
}

let state: HubState = { open: [], current: null, loaded: false, error: null };
const listeners = new Set<() => void>();

export function setHub(patch: Partial<HubState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const get = () => state;

export function useHub(): HubState {
  return useSyncExternalStore(subscribe, get, get);
}

export async function refreshOpenPlans(): Promise<Plan[]> {
  try {
    const open = await listPlans("open");
    setHub({ open, loaded: true, error: null });
    return open;
  } catch (e) {
    setHub({ loaded: true, error: (e as Error).message });
    return state.open;
  }
}

/** Keeps the open-incident list fresh for every page (30 s, as the board polls). */
export function useOpenPlansPolling(): void {
  useEffect(() => {
    void refreshOpenPlans();
    const id = setInterval(() => void refreshOpenPlans(), 30_000);
    return () => clearInterval(id);
  }, []);
}

// ---------------------------------------------------------------- actions

export type PlanAction = "new-plan" | "new-incident" | "new-template" | "publish" | "share" | "refresh" | "close" | "add-task";
const ACTION_EVENT = "milestone:action";

export function requestAction(a: PlanAction): void {
  window.dispatchEvent(new CustomEvent<PlanAction>(ACTION_EVENT, { detail: a }));
}

export function useActionListener(handler: (a: PlanAction) => void, deps: unknown[]): void {
  useEffect(() => {
    const on = (e: Event) => handler((e as CustomEvent<PlanAction>).detail);
    window.addEventListener(ACTION_EVENT, on);
    return () => window.removeEventListener(ACTION_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ----------------------------------------------------------------- viewer

// Kept as the raw id (not JSON) under the original page's key so both versions count once.
const VIEWER_KEY = "milestonedash_viewer_id";

export function viewerId(): string {
  try {
    let v = localStorage.getItem(VIEWER_KEY);
    if (!v) {
      v = crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now();
      localStorage.setItem(VIEWER_KEY, v);
    }
    return v;
  } catch {
    return String(Math.random()).slice(2) + Date.now();
  }
}

// ------------------------------------------------------ collapsed branches

// Per plan, as the original page stored it: a JSON array of group keys.
export const collapsedKey = (planId: string) => `milestone_collapsed_${planId}`;
