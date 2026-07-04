import Link from "next/link";
import {
  ArrowRight,
  Bot,
} from "lucide-react";
import { AgentSwarm } from "@/components/AgentSwarm";
import { MobileReproPanel } from "@/components/MobileReproPanel";
import { AclPanel } from "@/components/AclPanel";
import { ScenarioSwitcher } from "@/components/ScenarioSwitcher";

export default function Home() {
  return (
    <main className="h-screen overflow-hidden bg-[#f4f2ea] text-stone-950">
      <section className="grid h-full w-full gap-4 px-4 py-4 lg:grid-cols-[minmax(280px,340px)_minmax(430px,520px)_minmax(0,1fr)] xl:grid-cols-[minmax(300px,360px)_minmax(460px,540px)_minmax(0,1fr)] xl:px-6">
        <aside className="grid min-h-0 content-start gap-4 overflow-y-auto pr-1">
          <header className="rounded-[22px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Trace
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                  Customer bug to verified patch.
                </h1>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-950 text-white">
                <Bot size={22} aria-hidden="true" />
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-stone-600">
              A multi-provider support-to-engineering workflow: triage, sandbox
              repro, privacy-preserving visual analysis, constrained patching,
              and verified GitHub PR - autonomously.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">OpenAI GPT-4o</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800">Venice.ai TEE 🔒</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-800">Cerebras speed</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">Playwright</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">GitHub</span>
              <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-800">BasedAI ACL 🔐</span>
            </div>
            <Link
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
              href="/checkout"
            >
              Open checkout
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </header>

          <ScenarioSwitcher />

          <AclPanel />
        </aside>

        <MobileReproPanel />

        <section className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pr-1">
          <AgentSwarm />
        </section>
      </section>
    </main>
  );
}
