import { resetAllowedPatch, createPatchPlan, verifyAllowedPatch } from "@/lib/trace-patch-runtime";
import { runCheckoutRepro } from "@/lib/repro-runtime";
import { traceEvidence } from "@/lib/trace-evidence";
import { workflowStepDefinitions } from "@/lib/workflow-definition";
import { createGitHubIssueBranchAndPr } from "@/lib/github-pr-runtime";
import { classifyArtifact } from "@/lib/artifact-acl";
import {
  getDemoAgent,
  getRuntimeModel,
  hasVeniceConfig,
  runTraceAgent,
  type AgentRuntimeResult,
  type RuntimeSource,
  type TraceProvider,
} from "@/lib/trace-agent-runtime";
import type {
  WorkflowArtifact,
  WorkflowEvent,
  WorkflowSource,
  WorkflowStepDefinition,
  WorkflowStepId,
  WorkflowStepKind,
  WorkflowStepResult,
} from "@/lib/workflow-contract";

type WorkflowContext = {
  origin: string;
  startedAt: number;
  mode: RuntimeSource;
  provider: TraceProvider;
  agentResults: AgentRuntimeResult[];
  artifacts: WorkflowArtifact[];
  send: (event: WorkflowEvent) => void;
};

type WorkflowStepRunner = (context: WorkflowContext) => Promise<{
  source: WorkflowSource;
  summary: string;
  confidence?: number;
}>;

type RunnableStep = WorkflowStepDefinition & {
  source: (context: WorkflowContext) => WorkflowSource;
  run: WorkflowStepRunner;
};

function artifactId(stepId: WorkflowStepId, type: WorkflowArtifact["type"]) {
  return `${stepId}-${type}`;
}

function sendLog(context: WorkflowContext, stepId: WorkflowStepId, message: string) {
  context.send({
    type: "step-log",
    stepId,
    message,
    at: new Date().toISOString(),
  });
}

function addArtifact(context: WorkflowContext, artifact: WorkflowArtifact, sourceIds: string[] = []) {
  // Classify ACL at write time - deterministic, no LLM in this path
  classifyArtifact(artifact, sourceIds);
  context.artifacts.push(artifact);
  context.send({
    type: "artifact-created",
    artifact,
  });
}

function getStep(stepId: WorkflowStepId) {
  const step = workflowSteps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new Error(`Unknown workflow step: ${stepId}`);
  }
  return step;
}

function definition(stepId: WorkflowStepId) {
  const step = workflowStepDefinitions.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new Error(`Unknown workflow definition: ${stepId}`);
  }
  return step;
}

function createBugReport() {
  return {
    title: "Checkout CTA disappears on mobile after SAVE20",
    severity: "High - mobile customers cannot complete payment",
    environment: traceEvidence.environment,
    expected: "After SAVE20 applies, the customer can continue to payment.",
    actual: "The discount applies, but the primary checkout CTA becomes hidden on the mobile viewport.",
    reproSteps: [
      `Open ${traceEvidence.checkoutRoute} at ${traceEvidence.viewport}.`,
      `Enter coupon ${traceEvidence.coupon}.`,
      "Click Apply.",
      "Observe that the payment action remains but the checkout CTA is missing.",
    ],
    suspectedFile: traceEvidence.suspectedFile,
  };
}

async function runAgentStep(
  context: WorkflowContext,
  stepId: WorkflowStepId,
  agentId: NonNullable<WorkflowStepDefinition["agentId"]>,
) {
  sendLog(context, stepId, `loading ${agentId} prompt with prior evidence`);
  const result = await runTraceAgent(getDemoAgent(agentId), context.agentResults, context.provider);
  context.agentResults.push(result);

  // Lineage: this agent-result artifact is derived from all prior agent-result artifacts
  const priorAgentArtifactIds = context.artifacts
    .filter((a) => a.type === "agent-result")
    .map((a) => a.id);

  addArtifact(context, {
    id: artifactId(stepId, "agent-result"),
    type: "agent-result",
    stepId,
    title: `${getStep(stepId).owner} result`,
    agent: result,
  }, priorAgentArtifactIds);

  return {
    source: result.source,
    summary: result.finding,
    confidence: result.confidence,
  };
}

const workflowSteps: RunnableStep[] = [
  {
    ...definition("reset"),
    source: () => "patch-runtime",
    async run(context) {
      sendLog(context, "reset", "restoring the known buggy checkout target");
      const reset = await resetAllowedPatch();
      addArtifact(context, {
        id: artifactId("reset", "reset"),
        type: "reset",
        stepId: "reset",
        title: "Target reset",
        reset,
      });

      return {
        source: "patch-runtime",
        summary: reset.reset ? "Controlled bug restored before repro." : "Target was already in repro state.",
      };
    },
  },
  {
    ...definition("triage"),
    source: (context) => context.mode,
    run: (context) => runAgentStep(context, "triage", "triage"),
  },
  {
    ...definition("vision"),
    // Vision agent is privacy-routed to Venice.ai TEE when configured.
    source: (context) => (hasVeniceConfig() ? "venice" : context.mode),
    run: (context) => runAgentStep(context, "vision", "vision"),
  },
  {
    ...definition("log"),
    source: (context) => context.mode,
    run: (context) => runAgentStep(context, "log", "log"),
  },
  {
    ...definition("repro"),
    source: () => "tool-runtime",
    async run(context) {
      sendLog(context, "repro", "opening /checkout in desktop control and mobile customer viewport");
      sendLog(context, "repro", "typing SAVE20 and clicking Apply with deterministic selectors");
      const repro = await runCheckoutRepro(context.origin);
      addArtifact(context, {
        id: artifactId("repro", "repro"),
        type: "repro",
        stepId: "repro",
        title: "Playwright repro evidence",
        repro,
      });

      if (!repro.reproduced) {
        throw new Error(repro.assertion);
      }

      return {
        source: "tool-runtime",
        summary: repro.assertion,
      };
    },
  },
  {
    ...definition("bug-report"),
    source: () => "tool-runtime",
    async run(context) {
      sendLog(context, "bug-report", "assembling issue title, repro steps, impact, and suspected file");
      const report = createBugReport();
      addArtifact(context, {
        id: artifactId("bug-report", "bug-report"),
        type: "bug-report",
        stepId: "bug-report",
        title: "Issue-ready bug report",
        report,
      });

      return {
        source: "tool-runtime",
        summary: `${report.title} prepared for engineering handoff.`,
      };
    },
  },
  {
    ...definition("code"),
    source: (context) => context.mode,
    run: (context) => runAgentStep(context, "code", "code"),
  },
  {
    ...definition("patch-plan"),
    source: (context) => context.mode,
    async run(context) {
      sendLog(context, "patch-plan", "requesting model rationale for the allowlisted checkout patch");
      const plan = await createPatchPlan(context.provider);
      addArtifact(context, {
        id: artifactId("patch-plan", "patch-plan"),
        type: "patch-plan",
        stepId: "patch-plan",
        title: "Constrained patch plan",
        plan,
      });

      return {
        source: plan.source,
        summary: plan.rationale,
      };
    },
  },
  {
    ...definition("patch-verify"),
    source: () => "patch-runtime",
    async run(context) {
      sendLog(context, "patch-verify", "applying allowlisted replacement in CheckoutDemo.tsx");
      sendLog(context, "patch-verify", "rerunning desktop and mobile checkout verification");
      const verification = await verifyAllowedPatch(context.origin);
      addArtifact(context, {
        id: artifactId("patch-verify", "patch-verify"),
        type: "patch-verify",
        stepId: "patch-verify",
        title: "Patch verification",
        verification,
      });

      if (!verification.fixed) {
        throw new Error(verification.after.assertion);
      }

      return {
        source: "patch-runtime",
        summary: verification.summary,
      };
    },
  },
  {
    ...definition("repo-pr"),
    source: () => "tool-runtime",
    async run(context) {
      sendLog(context, "repo-pr", "creating or reusing GitHub issue in divagr18/mobile-demo");
      sendLog(context, "repo-pr", "pushing Trace fix branch and opening pull request");
      const verification = context.artifacts.find(
        (artifact): artifact is Extract<WorkflowArtifact, { type: "patch-verify" }> =>
          artifact.type === "patch-verify",
      )?.verification;
      const before = context.artifacts.find(
        (artifact): artifact is Extract<WorkflowArtifact, { type: "repro" }> =>
          artifact.type === "repro",
      )?.repro;

      if (!verification) {
        throw new Error("Patch verification artifact is missing.");
      }

      const repo = await createGitHubIssueBranchAndPr(verification, before);
      addArtifact(context, {
        id: artifactId("repo-pr", "repo-pr"),
        type: "repo-pr",
        stepId: "repo-pr",
        title: "GitHub issue and PR",
        repo,
      });

      return {
        source: "tool-runtime",
        summary: `Opened GitHub issue #${repo.issueNumber} and PR #${repo.prNumber} in divagr18/mobile-demo.`,
      };
    },
  },
  {
    ...definition("maintainer"),
    source: (context) => context.mode,
    run: (context) => runAgentStep(context, "maintainer", "maintainer"),
  },
];

async function runWorkflowStep(context: WorkflowContext, step: RunnableStep) {
  const startedAt = Date.now();
  context.send({
    type: "step-started",
    stepId: step.id,
    source: step.source(context),
    startedAt: new Date(startedAt).toISOString(),
  });

  try {
    const output = await step.run(context);
    const result: WorkflowStepResult = {
      id: step.id,
      title: step.title,
      owner: step.owner,
      kind: step.kind as WorkflowStepKind,
      status: "complete",
      source: output.source,
      latencyMs: Math.max(1, Date.now() - startedAt),
      summary: output.summary,
      agentId: step.agentId,
      confidence: output.confidence,
    };
    context.send({ type: "step-completed", result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow error";
    const result: WorkflowStepResult = {
      id: step.id,
      title: step.title,
      owner: step.owner,
      kind: step.kind as WorkflowStepKind,
      status: "failed",
      source: step.source(context),
      latencyMs: Math.max(1, Date.now() - startedAt),
      summary: message,
      agentId: step.agentId,
      error: message,
    };
    context.send({ type: "step-completed", result });
    throw Object.assign(new Error(message), { stepId: step.id });
  }
}

export async function runTraceWorkflow(
  origin: string,
  send: (event: WorkflowEvent) => void,
  provider: TraceProvider = "cerebras",
) {
  const startedAt = Date.now();
  const mode: RuntimeSource = provider;
  const context: WorkflowContext = {
    origin,
    startedAt,
    mode,
    provider,
    agentResults: [],
    artifacts: [],
    send,
  };

  send({
    type: "workflow-started",
    mode,
    model: getRuntimeModel(provider),
    startedAt: new Date(startedAt).toISOString(),
    steps: workflowStepDefinitions,
  });

  const pending = new Map<WorkflowStepId, RunnableStep>(
    workflowSteps.map((step) => [step.id, step]),
  );
  const completed = new Set<WorkflowStepId>();

  try {
    while (pending.size > 0) {
      const runnable = Array.from(pending.values()).filter((step) =>
        step.dependsOn.every((dependency) => completed.has(dependency)),
      );

      if (runnable.length === 0) {
        throw new Error("Workflow dependency graph is blocked.");
      }

      await Promise.all(
        runnable.map(async (step) => {
          await runWorkflowStep(context, step);
          pending.delete(step.id);
          completed.add(step.id);
        }),
      );
    }

    send({
      type: "workflow-completed",
      elapsedMs: Math.max(1, Date.now() - startedAt),
      summary:
        "Trace reproduced the mobile checkout bug, applied a constrained fix, verified it, and prepared the maintainer handoff.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow error";
    const stepId =
      typeof error === "object" && error && "stepId" in error
        ? (error.stepId as WorkflowStepId)
        : undefined;

    send({
      type: "workflow-failed",
      stepId,
      elapsedMs: Math.max(1, Date.now() - startedAt),
      error: message,
    });
  }
}
