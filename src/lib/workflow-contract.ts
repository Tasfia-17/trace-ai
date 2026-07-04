import type { AgentId } from "@/lib/demo-agents";
import type { PatchPlan, PatchResetResult, PatchVerifyResult } from "@/lib/patch-contract";
import type { ReproResult } from "@/lib/repro-contract";
import type { AgentRuntimeResult, RuntimeSource } from "@/lib/trace-agent-runtime";

export type WorkflowStepId =
  | "reset"
  | "triage"
  | "vision"
  | "log"
  | "repro"
  | "bug-report"
  | "code"
  | "patch-plan"
  | "patch-verify"
  | "repo-pr"
  | "maintainer";

export type WorkflowStepKind = "agent" | "tool" | "patch" | "summary";
export type WorkflowStepStatus = "idle" | "running" | "complete" | "failed";
export type WorkflowSource = RuntimeSource | "tool-runtime" | "patch-runtime";

// Human-readable labels for each source - used by the UI badge renderer.
export const workflowSourceLabels: Record<WorkflowSource, string> = {
  cerebras:      "Cerebras live",
  gemini:        "Gemini live",
  openai:        "OpenAI live",
  venice:        "Venice.ai TEE",
  "tool-runtime":  "Tool runtime",
  "patch-runtime": "Patch runtime",
};

export type WorkflowStepDefinition = {
  id: WorkflowStepId;
  title: string;
  owner: string;
  kind: WorkflowStepKind;
  dependsOn: WorkflowStepId[];
  agentId?: AgentId;
  description: string;
};

export type WorkflowStepResult = {
  id: WorkflowStepId;
  title: string;
  owner: string;
  kind: WorkflowStepKind;
  status: Exclude<WorkflowStepStatus, "idle" | "running">;
  source: WorkflowSource;
  latencyMs: number;
  summary: string;
  agentId?: AgentId;
  confidence?: number;
  error?: string;
};

export type WorkflowArtifact =
  | {
      id: string;
      type: "agent-result";
      stepId: WorkflowStepId;
      title: string;
      agent: AgentRuntimeResult;
    }
  | {
      id: string;
      type: "repro";
      stepId: WorkflowStepId;
      title: string;
      repro: ReproResult;
    }
  | {
      id: string;
      type: "bug-report";
      stepId: WorkflowStepId;
      title: string;
      report: {
        title: string;
        severity: string;
        environment: string;
        expected: string;
        actual: string;
        reproSteps: string[];
        suspectedFile: string;
      };
    }
  | {
      id: string;
      type: "patch-plan";
      stepId: WorkflowStepId;
      title: string;
      plan: PatchPlan;
    }
  | {
      id: string;
      type: "patch-verify";
      stepId: WorkflowStepId;
      title: string;
      verification: PatchVerifyResult;
    }
  | {
      id: string;
      type: "repo-pr";
      stepId: WorkflowStepId;
      title: string;
      repo: {
        owner: string;
        name: string;
        htmlUrl: string;
        defaultBranch: string;
        fixBranch: string;
        issueNumber: number;
        prNumber: number;
        issueTitle: string;
        prTitle: string;
        issueUrl: string;
        prUrl: string;
        branchUrl: string;
        viewerUrl: string;
        commits: string[];
        filesChanged: string[];
        diff: string;
        beforeImageUrl?: string;
        afterImageUrl?: string;
      };
    }
  | {
      id: string;
      type: "reset";
      stepId: WorkflowStepId;
      title: string;
      reset: PatchResetResult;
    };

export type WorkflowEvent =
  | {
      type: "workflow-started";
      mode: RuntimeSource;
      model: string;
      startedAt: string;
      steps: WorkflowStepDefinition[];
    }
  | {
      type: "step-started";
      stepId: WorkflowStepId;
      source: WorkflowSource;
      startedAt: string;
    }
  | {
      type: "step-log";
      stepId: WorkflowStepId;
      message: string;
      at: string;
    }
  | {
      type: "artifact-created";
      artifact: WorkflowArtifact;
    }
  | {
      type: "step-completed";
      result: WorkflowStepResult;
    }
  | {
      type: "workflow-completed";
      elapsedMs: number;
      summary: string;
    }
  | {
      type: "workflow-failed";
      stepId?: WorkflowStepId;
      elapsedMs: number;
      error: string;
    };
