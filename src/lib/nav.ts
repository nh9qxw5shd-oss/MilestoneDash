// Navigation model shared by the app shell and the command palette.

import { Archive, LayoutTemplate, ListChecks, LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Plans",
    items: [
      { href: "/", label: "Board", icon: ListChecks, desc: "Open incident plans: milestones, predictions, branches and progress" },
      { href: "/templates", label: "Templates", icon: LayoutTemplate, desc: "Reusable frameworks (MT ids) to start an incident from" },
      { href: "/memory", label: "Memory", icon: Archive, desc: "Closed plans, read-only; clone one to reuse it" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
