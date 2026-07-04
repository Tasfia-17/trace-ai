"use client";

import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  ChevronDown,
  Circle,
  Code2,
  FileCode2,
  FileText,
  GitPullRequest,
  LoaderCircle,
  MonitorSmartphone,
  Play,
  RotateCcw,
  Terminal,
  Timer,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TraceProvider } from "@/lib/trace-agent-runtime";
import { workflowStepDefinitions } from "@/lib/workflow-definition";
import type {
  WorkflowArtifact,
  WorkflowEvent,
  WorkflowSource,
  WorkflowStepDefinition,
  WorkflowStepId,
  WorkflowStepResult,
  WorkflowStepStatus,
} from "@/lib/workflow-contract";

type RunState = "idle" | "running" | "complete" | "failed";

type StepView = WorkflowStepDefinition & {
  status: WorkflowStepStatus;
  source?: WorkflowSource;
  latencyMs?: number;
  summary?: string;
  confidence?: number;
  error?: string;
  logs: string[];
};

type StreamLine = {
  id: number;
  stepId?: WorkflowStepId;
  message: string;
};

const stepIcon = {
  reset: RotateCcw,
  triage: Bot,
  vision: Camera,
  log: FileText,
  repro: MonitorSmartphone,
  "bug-report": GitPullRequest,
  code: Code2,
  "patch-plan": FileCode2,
  "patch-verify": Wrench,
  "repo-pr": GitPullRequest,
  maintainer: Bot,
} satisfies Record<WorkflowStepId, typeof Bot>;

function createInitialSteps(definitions: WorkflowStepDefinition[] = workflowStepDefinitions) {
  return definitions.map<StepView>((step) => ({
    ...step,
    status: "idle",
    logs: [],
  }));
}

function formatElapsed(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function sourceLabel(source?: WorkflowSource) {
  if (!source) return "queued";

  const labels: Record<WorkflowSource, string> = {
    cerebras:        "Cerebras live",
    gemini:          "Gemini live",
    openai:          "OpenAI live",
    venice:          "Venice.ai TEE 🔒",
    "tool-runtime":  "Tool runtime",
    "patch-runtime": "Patch runtime",
  };

  return labels[source] ?? source;
}

function statusLabel(status: WorkflowStepStatus) {
  if (status === "running") {
    return "Running";
  }

  if (status === "complete") {
    return "Done";
  }

  if (status === "failed") {
    return "Failed";
  }

  return "Queued";
}

function parseSseBlock(block: string): WorkflowEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) {
    return null;
  }

  return JSON.parse(data) as WorkflowEvent;
}

function getArtifact<T extends WorkflowArtifact["type"]>(
  artifacts: WorkflowArtifact[],
  type: T,
) {
  return artifacts.find((artifact): artifact is Extract<WorkflowArtifact, { type: T }> =>
    artifact.type === type,
  );
}

function stepStatusClass(status: WorkflowStepStatus) {
  if (status === "complete") {
    return "border-emerald-200 bg-emerald-50";
  }

  if (status === "running") {
    return "border-amber-200 bg-amber-50";
  }

  if (status === "failed") {
    return "border-red-200 bg-red-50";
  }

  return "border-stone-200 bg-white";
}

function StepStatusIcon({ status }: { status: WorkflowStepStatus }) {
  if (status === "complete") {
    return <CheckCircle2 className="text-emerald-700" size={18} aria-hidden="true" />;
  }

  if (status === "running") {
    return (
      <LoaderCircle className="animate-spin text-amber-700" size={18} aria-hidden="true" />
    );
  }

  if (status === "failed") {
    return <AlertTriangle className="text-red-700" size={18} aria-hidden="true" />;
  }

  return <Circle className="text-stone-400" size={18} aria-hidden="true" />;
}

function StepCard({ step }: { step: StepView }) {
  const Icon = stepIcon[step.id];

  return (
    <article className={`rounded-2xl border p-3 shadow-sm ${stepStatusClass(step.status)}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-950 text-white">
          <Icon size={17} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold leading-5">{step.title}</h3>
              <p className="text-xs leading-5 text-stone-500">{step.owner}</p>
            </div>
            <StepStatusIcon status={step.status} />
          </div>
          <p className="mt-2 text-xs leading-5 text-stone-600">{step.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold text-stone-700">
              {statusLabel(step.status)}
            </span>
            <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold text-stone-700">
              {sourceLabel(step.source)}
            </span>
            {step.latencyMs ? (
              <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold text-stone-700">
                {step.latencyMs} ms
              </span>
            ) : null}
            {step.dependsOn.length ? (
              <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold text-stone-500">
                after {step.dependsOn.join(" + ")}
              </span>
            ) : null}
          </div>
          {step.summary ? (
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-stone-700">{step.summary}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LiveInvestigationOverlay({
  artifacts,
  elapsedMs,
  error,
  model,
  mode,
  onClose,
  open,
  runState,
  steps,
  streamLines,
  summary,
}: {
  artifacts: WorkflowArtifact[];
  elapsedMs: number;
  error: string | null;
  model: string;
  mode: string;
  onClose: () => void;
  open: boolean;
  runState: RunState;
  steps: StepView[];
  streamLines: StreamLine[];
  summary: string | null;
}) {
  const repro = getArtifact(artifacts, "repro");
  const bugReport = getArtifact(artifacts, "bug-report");
  const patchPlan = getArtifact(artifacts, "patch-plan");
  const patchVerify = getArtifact(artifacts, "patch-verify");
  const repoPr = getArtifact(artifacts, "repo-pr");
  const graphRef = useRef<HTMLDivElement | null>(null);
  const activeStep =
    steps.find((step) => step.status === "running") ??
    [...steps].reverse().find((step) => step.status === "complete") ??
    steps[0];
  const beforeScreenshot = repro?.repro.mobile.screenshotDataUrl;
  const afterScreenshot = patchVerify?.verification.after.mobile.screenshotDataUrl;
  const clientLogs =
    patchVerify?.verification.after.mobile.logEvents ??
    repro?.repro.mobile.logEvents ??
    [];
  const codeTitle = patchVerify
    ? "Allowlisted patch diff"
    : patchPlan
      ? "Patch plan operations"
      : "Source target";
  const codeBody = patchVerify
    ? patchVerify.verification.patch.diff || "No diff; file was already fixed."
    : patchPlan
      ? patchPlan.plan.operations
          .map(
            (operation) =>
              `${operation.operation} ${operation.file}\nfind: ${operation.find}\nreplace: ${operation.replace || "(empty string)"}`,
          )
          .join("\n\n")
      : "src/components/CheckoutDemo.tsx\nbugTriggered ? \"max-sm:hidden\" : \"\"";

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !activeStep) {
      return;
    }

    graphRef.current
      ?.querySelector(`[data-overlay-step-id="${activeStep.id}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeStep, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 p-3 backdrop-blur-sm">
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-stone-300 bg-[#f4f2ea] shadow-2xl">
        <header className="flex shrink-0 flex-col gap-3 border-b border-stone-200 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Live investigation
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Customer report to verified patch.
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
              {mode}
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
              {model}
            </span>
            <span className="rounded-full bg-stone-950 px-3 py-1 text-xs font-semibold text-white">
              {formatElapsed(elapsedMs)}
            </span>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-50"
              onClick={onClose}
              type="button"
            >
              <X size={17} aria-hidden="true" />
              <span className="sr-only">Close live investigation</span>
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 xl:grid-cols-[300px_minmax(0,1fr)_440px]">
          <aside
            className="min-h-0 overflow-y-auto rounded-[22px] border border-stone-200 bg-white p-3"
            ref={graphRef}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold">Execution graph</h3>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                {steps.filter((step) => step.status === "complete").length}/{steps.length}
              </span>
            </div>
            <div className="grid gap-2">
              {steps.map((step) => (
                <div data-overlay-step-id={step.id} key={step.id}>
                  <StepCard step={step} />
                </div>
              ))}
            </div>
          </aside>

          <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden">
            <section className="rounded-[22px] border border-stone-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Active step
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">{activeStep?.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    {activeStep?.summary ?? activeStep?.description}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                    runState === "complete"
                      ? "bg-emerald-50 text-emerald-800"
                      : runState === "failed"
                        ? "bg-red-50 text-red-800"
                        : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {runState === "complete"
                    ? "Verified patch"
                    : runState === "failed"
                      ? "Needs attention"
                      : "Running"}
                </span>
              </div>
              {summary ? (
                <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-900">
                  {summary}
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-800">
                  {error}
                </p>
              ) : null}
            </section>

            <section className="grid min-h-0 gap-3">
              <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] rounded-[22px] border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Camera className="text-emerald-700" size={18} aria-hidden="true" />
                    <h3 className="font-semibold">Screenshot evidence</h3>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                    before / after
                  </span>
                </div>
                <div className="mt-4 grid min-h-0 gap-3 lg:grid-cols-2">
                  {[
                    {
                      label: "Before",
                      detail: "SAVE20 applied, checkout CTA missing",
                      image: beforeScreenshot,
                      tone: "bg-red-50 text-red-800",
                    },
                    {
                      label: "After",
                      detail: "Patch verified, checkout CTA visible",
                      image: afterScreenshot,
                      tone: "bg-emerald-50 text-emerald-800",
                    },
                  ].map((item) => (
                    <figure
                      className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] rounded-2xl bg-stone-100 p-3"
                      key={item.label}
                    >
                      <figcaption className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.label}</p>
                          <p className="text-xs leading-5 text-stone-600">{item.detail}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.tone}`}>
                          {item.image ? "captured" : "waiting"}
                        </span>
                      </figcaption>
                      <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={`${item.label} mobile checkout evidence`}
                            className="h-full max-h-full w-auto max-w-full object-contain"
                            src={item.image}
                          />
                        ) : (
                          <div className="px-5 text-center text-sm leading-6 text-stone-500">
                            Waiting for the {item.label.toLowerCase()} screenshot.
                          </div>
                        )}
                      </div>
                    </figure>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid shrink-0 gap-3 lg:grid-cols-2">
              {bugReport ? (
                <div className="rounded-[22px] border border-stone-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="text-emerald-700" size={18} aria-hidden="true" />
                    <h3 className="font-semibold">Bug report</h3>
                  </div>
                  <h4 className="mt-3 text-sm font-semibold">{bugReport.report.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {bugReport.report.actual}
                  </p>
                  <ol className="mt-3 grid gap-2 text-sm leading-6 text-stone-700">
                    {bugReport.report.reproSteps.map((step) => (
                      <li className="rounded-xl bg-stone-50 px-3 py-2" key={step}>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {repoPr ? (
                <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="text-emerald-700" size={18} aria-hidden="true" />
                    <h3 className="font-semibold">GitHub PR opened</h3>
                  </div>
                  <h4 className="mt-3 text-sm font-semibold">{repoPr.repo.prTitle}</h4>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <a
                      className="rounded-xl bg-white px-3 py-2 font-semibold text-emerald-800 transition hover:bg-emerald-100"
                      href={repoPr.repo.issueUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Issue #{repoPr.repo.issueNumber}
                    </a>
                    <a
                      className="rounded-xl bg-emerald-800 px-3 py-2 font-semibold text-white transition hover:bg-emerald-900"
                      href={repoPr.repo.prUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      PR #{repoPr.repo.prNumber}
                    </a>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-700">
                    Branch {repoPr.repo.fixBranch} changes {repoPr.repo.filesChanged.join(", ")}.
                  </p>
                </div>
              ) : null}
            </section>
          </main>

          <aside className="grid min-h-0 min-w-0 grid-rows-[minmax(220px,1fr)_minmax(180px,0.9fr)_minmax(150px,0.65fr)] gap-3 overflow-hidden">
            <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[22px] bg-stone-950 p-4 font-mono text-xs leading-6 text-stone-100">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Terminal className="text-emerald-300" size={16} aria-hidden="true" />
                  <h3 className="font-semibold uppercase tracking-[0.16em] text-emerald-300">
                    Live logs
                  </h3>
                </div>
                <span className="text-stone-400">{streamLines.length}</span>
              </div>
              <div className="grid min-h-0 min-w-0 content-start gap-1 overflow-auto pr-1">
                {(streamLines.length
                  ? streamLines
                  : [{ id: 0, message: "waiting for Run Investigation" }]
                ).map((line) => (
                  <div className="flex min-w-0 gap-2" key={line.id}>
                    <span className="shrink-0 text-emerald-300">{">"}</span>
                    <span className="min-w-0 break-words">
                      {line.stepId ? `${line.stepId}: ${line.message}` : line.message}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[22px] border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <Code2 className="text-emerald-700" size={18} aria-hidden="true" />
                <h3 className="font-semibold">{codeTitle}</h3>
              </div>
              <pre className="mt-3 min-h-0 max-w-full overflow-auto whitespace-pre rounded-2xl bg-stone-950 p-3 text-xs leading-5 text-stone-100">
                {codeBody}
              </pre>
            </section>

            <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[22px] border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <FileText className="text-emerald-700" size={18} aria-hidden="true" />
                <h3 className="font-semibold">Client logs</h3>
              </div>
              <div className="mt-3 grid min-h-0 content-start gap-2 overflow-auto pr-1">
                {(clientLogs.length ? clientLogs : ["cart_loaded", "payment_options_ready"]).map(
                  (entry) => {
                    const cleanEntry = entry.replace(/^event\s+/, "");

                    return (
                      <div
                        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl bg-stone-50 px-3 py-2 font-mono text-xs"
                        key={entry}
                      >
                        <span className="font-semibold text-emerald-700">event</span>
                        <span className="min-w-0 break-words text-right text-stone-700">
                          {cleanEntry}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}

export function AgentSwarm() {
  const [steps, setSteps] = useState<StepView[]>(() => createInitialSteps());
  const [runState, setRunState] = useState<RunState>("idle");
  const [provider, setProvider] = useState<TraceProvider>("openai");
  const [mode, setMode] = useState("runtime ready");
  const [model, setModel] = useState("gemma-4-31b");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<WorkflowArtifact[]>([]);
  const [streamLines, setStreamLines] = useState<StreamLine[]>([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPrUrlRef = useRef<string | null>(null);
  const runIdRef = useRef(0);
  const lineIdRef = useRef(0);

  const completedCount = useMemo(
    () => steps.filter((step) => step.status === "complete").length,
    [steps],
  );

  const addStreamLine = useCallback((message: string, stepId?: WorkflowStepId) => {
    lineIdRef.current += 1;
    const line = {
      id: lineIdRef.current,
      stepId,
      message,
    };
    setStreamLines((current) => [...current.slice(-80), line]);
  }, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const updateStep = useCallback((stepId: WorkflowStepId, update: Partial<StepView>) => {
    setSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, ...update } : step)),
    );
  }, []);

  const appendStepLog = useCallback((stepId: WorkflowStepId, message: string) => {
    setSteps((current) =>
      current.map((step) =>
        step.id === stepId
          ? {
              ...step,
              logs: [...step.logs, message],
            }
          : step,
      ),
    );
  }, []);

  const handleStepCompleted = useCallback(
    (result: WorkflowStepResult) => {
      updateStep(result.id, {
        status: result.status,
        source: result.source,
        latencyMs: result.latencyMs,
        summary: result.summary,
        confidence: result.confidence,
        error: result.error,
      });
      addStreamLine(`${result.title}: ${result.status} in ${result.latencyMs}ms`, result.id);
    },
    [addStreamLine, updateStep],
  );

  const handleEvent = useCallback(
    (event: WorkflowEvent) => {
      window.dispatchEvent(new CustomEvent("trace-workflow-event", { detail: event }));

      if (event.type === "workflow-started") {
        setMode(sourceLabel(event.mode));
        setModel(event.model);
        setSteps(createInitialSteps(event.steps));
        addStreamLine(`workflow started: ${event.mode} / ${event.model}`);
        return;
      }

      if (event.type === "step-started") {
        updateStep(event.stepId, {
          status: "running",
          source: event.source,
          error: undefined,
        });
        addStreamLine(`${event.stepId}: started via ${sourceLabel(event.source)}`, event.stepId);
        return;
      }

      if (event.type === "step-log") {
        appendStepLog(event.stepId, event.message);
        addStreamLine(event.message, event.stepId);
        return;
      }

      if (event.type === "artifact-created") {
        setArtifacts((current) => [...current, event.artifact]);
        if (event.artifact.type === "repo-pr") {
          pendingPrUrlRef.current = event.artifact.repo.prUrl;
        }
        addStreamLine(`${event.artifact.title} artifact created`, event.artifact.stepId);
        return;
      }

      if (event.type === "step-completed") {
        handleStepCompleted(event.result);
        return;
      }

      if (event.type === "workflow-completed") {
        setElapsedMs(event.elapsedMs);
        setSummary(event.summary);
        setRunState("complete");
        addStreamLine(`workflow completed in ${event.elapsedMs}ms`);
        if (pendingPrUrlRef.current) {
          window.open(pendingPrUrlRef.current, "_blank", "noopener,noreferrer");
        }
        clearTimer();
        return;
      }

      if (event.type === "workflow-failed") {
        setElapsedMs(event.elapsedMs);
        setError(event.error);
        setRunState("failed");
        addStreamLine(`workflow failed: ${event.error}`, event.stepId);
        clearTimer();
      }
    },
    [addStreamLine, appendStepLog, clearTimer, handleStepCompleted, updateStep],
  );

  const runWorkflow = useCallback(async () => {
    const currentRunId = runIdRef.current + 1;
    runIdRef.current = currentRunId;
    abortRef.current?.abort();
    clearTimer();

    const controller = new AbortController();
    abortRef.current = controller;

    setSteps(createInitialSteps());
    setRunState("running");
    setElapsedMs(0);
    setSummary(null);
    setError(null);
    setArtifacts([]);
    setStreamLines([]);
    setOverlayOpen(true);
    pendingPrUrlRef.current = null;

    const startedAt = Date.now();
    intervalRef.current = setInterval(() => {
      if (runIdRef.current === currentRunId) {
        setElapsedMs(Date.now() - startedAt);
      }
    }, 100);

    try {
      const response = await fetch("/api/trace/workflow/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Workflow failed with status ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const event = parseSseBlock(block);
          if (event) {
            handleEvent(event);
          }
        }
      }

      const tail = buffer.trim();
      if (tail) {
        const event = parseSseBlock(tail);
        if (event) {
          handleEvent(event);
        }
      }
    } catch (caught) {
      if (controller.signal.aborted || runIdRef.current !== currentRunId) {
        return;
      }

      const message = caught instanceof Error ? caught.message : "Unable to run workflow.";
      setError(message);
      setRunState("failed");
      addStreamLine(`client error: ${message}`);
      clearTimer();
    } finally {
      if (runIdRef.current === currentRunId) {
        abortRef.current = null;
      }
    }
  }, [addStreamLine, clearTimer, handleEvent, provider]);

  const resetView = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    clearTimer();
    setSteps(createInitialSteps());
    setRunState("idle");
    setElapsedMs(0);
    setSummary(null);
    setError(null);
    setArtifacts([]);
    setStreamLines([]);
    setOverlayOpen(false);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearTimer();
    };
  }, [clearTimer]);

  return (
    <>
      <LiveInvestigationOverlay
        artifacts={artifacts}
        elapsedMs={elapsedMs}
        error={error}
        mode={mode}
        model={model}
        onClose={() => setOverlayOpen(false)}
        open={overlayOpen}
        runState={runState}
        steps={steps}
        streamLines={streamLines}
        summary={summary}
      />
      <section className="grid min-w-0 gap-4 overflow-x-hidden">
      <header className="min-w-0 rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Workflow graph
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Agents wait for evidence before they act.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Trace runs triage first, fans out visual and log analysis, then drives the
              browser repro before source localization, patching, verification, and handoff.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
            <div className="relative h-11 min-w-0 sm:w-52">
              <label className="sr-only" htmlFor="provider-select">
                Model provider
              </label>
              <select
                className="h-full w-full appearance-none rounded-xl border border-stone-200 bg-white py-0 pl-3 pr-9 text-sm font-semibold text-stone-900 outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                data-testid="provider-select"
                disabled={runState === "running"}
                id="provider-select"
                onChange={(event) => setProvider(event.target.value as TraceProvider)}
                value={provider}
              >
                <option value="openai">OpenAI GPT-4o</option>
                <option value="cerebras">Cerebras (fast)</option>
                <option value="gemini">Gemini Flash</option>
                <option value="venice">Venice.ai TEE</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-500"
                size={16}
                aria-hidden="true"
              />
            </div>
            <div className="flex h-11 items-center gap-2 rounded-xl border border-stone-200 px-3 text-sm">
              <Timer size={16} className="text-emerald-700" aria-hidden="true" />
              <span className="text-stone-500">Elapsed</span>
              <span className="font-semibold tabular-nums">{formatElapsed(elapsedMs)}</span>
            </div>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              data-testid="run-investigation"
              disabled={runState === "running"}
              onClick={runWorkflow}
              type="button"
            >
              <Play size={16} aria-hidden="true" />
              {runState === "running" ? "Investigating" : "Run Investigation"}
            </button>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-700 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-stone-300"
              disabled={runState === "idle" && artifacts.length === 0}
              onClick={() => setOverlayOpen(true)}
              type="button"
            >
              <MonitorSmartphone size={16} aria-hidden="true" />
              Live window
            </button>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
              disabled={runState === "running" || (runState === "idle" && artifacts.length === 0)}
              onClick={resetView}
              type="button"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reset view
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              runState === "complete"
                ? "bg-emerald-50 text-emerald-800"
                : runState === "failed"
                  ? "bg-red-50 text-red-800"
                  : runState === "running"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-stone-100 text-stone-600"
            }`}
          >
            {runState === "complete"
              ? "Verified patch"
              : runState === "failed"
                ? "Needs attention"
                : runState === "running"
                  ? "Running graph"
                  : "Ready"}
          </span>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
            {mode}
          </span>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
            Model: {model}
          </span>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
            {completedCount}/{steps.length} steps complete
          </span>
        </div>

        {summary ? (
          <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-900">
            {summary}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-800">
            {error}
          </p>
        ) : null}
      </header>

      <section className="grid min-w-0 gap-3">
        {steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </section>

      <section className="rounded-[22px] bg-stone-950 p-4 font-mono text-xs leading-6 text-stone-100 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="text-emerald-300" size={16} aria-hidden="true" />
            <span className="font-semibold uppercase tracking-[0.16em] text-emerald-300">
              Live output
            </span>
          </div>
          <span className="text-stone-400">{streamLines.length} events</span>
        </div>
        <div className="grid max-h-48 gap-1 overflow-auto">
          {(streamLines.length
            ? streamLines
            : [{ id: 0, message: "waiting for Run Investigation" }]
          ).map((line) => (
            <div className="flex gap-2" key={line.id}>
              <span className="text-emerald-300">{">"}</span>
              <span>{line.stepId ? `${line.stepId}: ${line.message}` : line.message}</span>
            </div>
          ))}
        </div>
      </section>

      {artifacts.length > 0 ? (
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-700 bg-white px-4 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
          onClick={() => setOverlayOpen(true)}
          type="button"
        >
          <MonitorSmartphone size={17} aria-hidden="true" />
          Open fullscreen evidence window
        </button>
      ) : null}
      </section>
    </>
  );
}
