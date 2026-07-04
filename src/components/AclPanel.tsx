"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { ArtifactRole } from "@/lib/artifact-acl";

const ROLES: { role: ArtifactRole; label: string; color: string }[] = [
  { role: "customer-support", label: "Customer Support", color: "bg-blue-50 text-blue-800" },
  { role: "engineer",         label: "Engineer",         color: "bg-amber-50 text-amber-800" },
  { role: "senior-engineer",  label: "Senior Engineer",  color: "bg-emerald-50 text-emerald-800" },
  { role: "security-auditor", label: "Security Auditor", color: "bg-purple-50 text-purple-800" },
];

type ArtifactSummary = {
  role: ArtifactRole;
  visible: number;
  redacted: number;
  total: number;
  latencyMs: number;
};

export function AclPanel() {
  const [summaries, setSummaries] = useState<ArtifactSummary[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchForRole(role: ArtifactRole): Promise<ArtifactSummary | null> {
    try {
      const res = await fetch(`/api/trace/artifacts?role=${role}`);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        visible: number;
        redacted: number;
        total: number;
        latencyMs: number;
      };
      return { role, ...data };
    } catch {
      return null;
    }
  }

  async function refresh() {
    setLoading(true);
    const results = await Promise.all(ROLES.map((r) => fetchForRole(r.role)));
    setSummaries(results.filter((r): r is ArtifactSummary => r !== null));
    setLoading(false);
  }

  // Auto-refresh every 5 seconds when the component is mounted
  useEffect(() => {
    const run = () => { void refresh(); };
    run();
    const interval = setInterval(run, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (summaries.length === 0 && !loading) {
    return null;
  }

  return (
    <section className="rounded-[22px] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="text-emerald-700" size={18} aria-hidden="true" />
          <h2 className="font-semibold">Permission-aware memory</h2>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
          ACL enforced
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-500">
        Artifact access enforced at retrieval - no LLM in the permission path. Derived artifacts inherit source ACL.
      </p>
      <div className="mt-4 grid gap-2">
        {ROLES.map(({ role, label, color }) => {
          const s = summaries.find((x) => x.role === role);
          return (
            <div
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2 text-xs"
              key={role}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={12} aria-hidden="true" className="text-stone-400 shrink-0" />
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>
                  {label}
                </span>
              </div>
              {s ? (
                <div className="flex items-center gap-2 text-right">
                  <span className="font-semibold text-emerald-700">{s.visible} visible</span>
                  {s.redacted > 0 && (
                    <span className="text-red-600">{s.redacted} redacted</span>
                  )}
                  <span className="text-stone-400">{s.latencyMs}ms</span>
                </div>
              ) : (
                <span className="text-stone-400">-</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
