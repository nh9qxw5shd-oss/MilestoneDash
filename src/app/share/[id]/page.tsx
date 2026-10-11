import type { Metadata } from "next";
import LiveView from "@/components/plan/LiveView";

export const metadata: Metadata = { title: "Live view" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveView planId={id} />;
}
