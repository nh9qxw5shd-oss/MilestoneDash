import type { Metadata } from "next";
import Memory from "@/components/plan/Memory";

export const metadata: Metadata = { title: "Memory" };

export default function Page() {
  return <Memory />;
}
