"use client";

import { CheckCircle2, LoaderCircle, MonitorSmartphone, MousePointer2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkflowEvent } from "@/lib/workflow-contract";

type PhoneActionState = "idle" | "running" | "complete";

export function MobileReproPanel() {
  const [frameKey, setFrameKey] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [actionLabel, setActionLabel] = useState("Waiting for investigation");
  const [actionState, setActionState] = useState<PhoneActionState>("idle");

  async function resetTarget() {
    setIsResetting(true);
    setActionLabel("Resetting checkout target");
    setActionState("running");

    try {
      await fetch("/api/trace/patch/reset", {
        method: "POST",
      });
    } finally {
      setFrameKey((current) => current + 1);
      setActionLabel("Controlled bug restored");
      setActionState("complete");
      setIsResetting(false);
    }
  }

  useEffect(() => {
    function handleWorkflowEvent(event: Event) {
      const workflowEvent = (event as CustomEvent<WorkflowEvent>).detail;

      if (workflowEvent.type === "workflow-started") {
        setFrameKey((current) => current + 1);
        setActionLabel("Investigation started");
        setActionState("running");
        return;
      }

      if (workflowEvent.type === "step-started") {
        if (workflowEvent.stepId === "reset") {
          setActionLabel("Restoring broken checkout target");
          setActionState("running");
        }

        if (workflowEvent.stepId === "repro") {
          setActionLabel("Repro Agent is opening the phone and applying SAVE20");
          setActionState("running");
        }

        if (workflowEvent.stepId === "patch-verify") {
          setActionLabel("Patch Runtime is applying the fix and rerunning mobile checkout");
          setActionState("running");
        }
      }

      if (workflowEvent.type === "artifact-created" && workflowEvent.artifact.type === "repro") {
        setActionLabel(
          workflowEvent.artifact.repro.reproduced
            ? "Bug reproduced: mobile checkout CTA is missing"
            : "Repro completed without expected failure",
        );
        setActionState("complete");
      }

      if (
        workflowEvent.type === "artifact-created" &&
        workflowEvent.artifact.type === "patch-verify"
      ) {
        setFrameKey((current) => current + 1);
        setActionLabel(
          workflowEvent.artifact.verification.fixed
            ? "Patch verified: phone target reloaded with checkout CTA visible"
            : "Patch verification failed on the phone target",
        );
        setActionState("complete");
      }

      if (workflowEvent.type === "workflow-failed") {
        setActionLabel("Investigation stopped before verification");
        setActionState("idle");
      }
    }

    window.addEventListener("trace-workflow-event", handleWorkflowEvent);
    return () => window.removeEventListener("trace-workflow-event", handleWorkflowEvent);
  }, []);

  return (
    <section className="flex min-h-0 flex-col rounded-[26px] border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="text-emerald-700" size={18} aria-hidden="true" />
          <h2 className="font-semibold">Mobile repro</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            Live target
          </span>
          <button
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
            onClick={resetTarget}
            type="button"
            disabled={isResetting}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {isResetting ? "Resetting" : "Reset target"}
          </button>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col overflow-hidden rounded-[32px] border-8 border-stone-950 bg-stone-950 shadow-2xl">
        <div className="mx-auto mt-2 h-5 w-24 shrink-0 rounded-full bg-stone-800" />
        <div className="relative mt-2 min-h-0 flex-1 overflow-hidden rounded-t-[24px] bg-[#f7f7f2]">
          <iframe
            className="h-full w-full bg-[#f7f7f2]"
            key={frameKey}
            src="/checkout"
            title="Live mobile checkout target"
          />
          <div className="pointer-events-none absolute left-4 right-4 top-4 rounded-2xl border border-stone-200 bg-white/95 px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              {actionState === "running" ? (
                <LoaderCircle className="animate-spin text-amber-700" size={15} aria-hidden="true" />
              ) : actionState === "complete" ? (
                <CheckCircle2 className="text-emerald-700" size={15} aria-hidden="true" />
              ) : (
                <MonitorSmartphone className="text-stone-500" size={15} aria-hidden="true" />
              )}
              <p className="text-xs font-semibold leading-5 text-stone-800">{actionLabel}</p>
            </div>
          </div>
          {actionState === "running" ? (
            <div className="pointer-events-none absolute left-[62%] top-[58%] rounded-full bg-stone-950 p-2 text-white shadow-xl">
              <MousePointer2 size={16} aria-hidden="true" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
