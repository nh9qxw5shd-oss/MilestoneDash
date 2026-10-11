"use client";

// Loading a plan with everything hanging off it, refreshed every 30 seconds so several people can
// work the same plan, and the presence heartbeat behind the viewer count.

import { useCallback, useEffect, useRef, useState } from "react";
import { countViewers, getPlan, loadPlanData, touchViewer, VIEWER_PING_MS, type PlanData } from "./data.ts";
import { viewerId } from "./store.ts";

export interface PlanLoad {
  data: PlanData | null;
  /** The plan id was looked up and does not exist. */
  missing: boolean;
  error: string | null;
  updatedAt: Date | null;
  reload: () => Promise<void>;
}

export function usePlanData(planId: string | null, refreshMs = 30_000): PlanLoad {
  const [state, setState] = useState<Omit<PlanLoad, "reload"> & { id: string | null }>({ id: null, data: null, missing: false, error: null, updatedAt: null });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!planId) return;
    const mine = ++seq.current;
    try {
      const plan = await getPlan(planId);
      const data = plan ? await loadPlanData(plan) : null;
      if (mine !== seq.current) return;
      setState({ id: planId, data, missing: !plan, error: null, updatedAt: new Date() });
    } catch (e) {
      if (mine !== seq.current) return;
      setState((s) => ({ ...s, id: planId, error: (e as Error).message }));
    }
  }, [planId]);

  useEffect(() => {
    if (!planId) return;
    void reload();
    const id = setInterval(() => void reload(), refreshMs);
    return () => clearInterval(id);
  }, [planId, reload, refreshMs]);

  const current = state.id === planId;
  return {
    data: current ? state.data : null,
    missing: current && state.missing,
    error: current ? state.error : null,
    updatedAt: current ? state.updatedAt : null,
    reload,
  };
}

/** Pings plan_viewers every 30 s while the plan is on screen; returns who is watching (null when unknown). */
export function useViewers(planId: string | null, enabled: boolean): number | null {
  const [count, setCount] = useState<{ id: string; n: number | null } | null>(null);
  useEffect(() => {
    if (!planId || !enabled) return;
    let live = true;
    const tick = async () => {
      try {
        await touchViewer(planId, viewerId());
      } catch {
        /* presence is best effort */
      }
      const n = await countViewers(planId);
      if (live) setCount({ id: planId, n });
    };
    void tick();
    const id = setInterval(() => void tick(), VIEWER_PING_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [planId, enabled]);
  return count && count.id === planId ? count.n : null;
}
