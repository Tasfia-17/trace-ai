import {
  Bot,
  Camera,
  CheckCircle2,
  CircleDashed,
  Code2,
  FileSearch,
  GitPullRequest,
  Loader2,
  MonitorSmartphone,
} from "lucide-react";
import type { AgentIcon, AgentResult, AgentStatus } from "@/lib/demo-agents";

const iconByName: Record<AgentIcon, typeof Bot> = {
  bot: Bot,
  camera: Camera,
  "file-search": FileSearch,
  monitor: MonitorSmartphone,
  code: Code2,
  "git-pull-request": GitPullRequest,
};

const statusCopy: Record<AgentStatus, string> = {
  idle: "Idle",
  running: "Running",
  complete: "Complete",
  blocked: "Blocked",
};

const statusClassName: Record<AgentStatus, string> = {
  idle: "bg-stone-100 text-stone-600",
  running: "bg-amber-50 text-amber-800",
  complete: "bg-emerald-50 text-emerald-800",
  blocked: "bg-red-50 text-red-800",
};

const sourceCopy: Record<NonNullable<AgentResult["source"]>, string> = {
  cerebras: "Cerebras",
  gemini:   "Gemini",
  openai:   "OpenAI",
  venice:   "Venice.ai TEE 🔒",
};

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === "running") {
    return <Loader2 className="animate-spin" size={14} aria-hidden="true" />;
  }

  if (status === "complete") {
    return <CheckCircle2 size={14} aria-hidden="true" />;
  }

  return <CircleDashed size={14} aria-hidden="true" />;
}

export function AgentCard({ agent }: { agent: AgentResult }) {
  const Icon = iconByName[agent.icon];
  const isComplete = agent.status === "complete";

  return (
    <article
      className="min-h-[234px] rounded-[22px] border border-stone-200 bg-white p-4 shadow-sm transition"
      data-agent-id={agent.id}
      data-agent-status={agent.status}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-stone-950 text-white">
            <Icon size={18} aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold tracking-tight">{agent.name}</h3>
            <p className="mt-1 text-xs font-medium text-stone-500">{agent.role}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold ${statusClassName[agent.status]}`}
          >
            <StatusIcon status={agent.status} />
            {statusCopy[agent.status]}
          </span>
          {agent.source ? (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
              {sourceCopy[agent.source]}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-2xl bg-stone-950 p-3 font-mono text-xs leading-5 text-stone-100">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
            Live output
          </div>
          {(agent.liveOutput?.length ? agent.liveOutput : ["queued"]).map((line) => (
            <div className="flex gap-2" key={line}>
              <span className="text-emerald-300">{">"}</span>
              <span>{line}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Finding
          </p>
          <p
            className={`mt-2 text-sm leading-6 ${
              isComplete ? "text-stone-700" : "text-stone-400"
            }`}
          >
            {isComplete ? agent.finding : "Waiting for upstream evidence."}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-3 py-2 text-sm">
          <span className="text-stone-500">Latency</span>
          <span className={isComplete ? "font-semibold text-emerald-700" : "text-stone-400"}>
            {isComplete ? `${agent.latencyMs} ms` : "--"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {(isComplete ? agent.evidence : ["queued"]).map((item) => (
            <span
              className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>

        {isComplete && agent.confidence ? (
          <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-3 py-2 text-sm">
            <span className="text-stone-500">Confidence</span>
            <span className="font-semibold text-stone-700">
              {Math.round(agent.confidence * 100)}%
            </span>
          </div>
        ) : null}

        {agent.error ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            {agent.error}
          </p>
        ) : null}
      </div>
    </article>
  );
}
