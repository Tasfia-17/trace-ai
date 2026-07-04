import { NextRequest, NextResponse } from "next/server";
import { runTraceWorkflow } from "@/lib/trace-workflow-runtime";
import type { WorkflowEvent, WorkflowArtifact } from "@/lib/workflow-contract";
import type { TraceProvider } from "@/lib/trace-agent-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/trace/asi-one
 *
 * ASI:One / Agentverse-compatible endpoint for Trace.
 *
 * Accepts a natural-language bug report and runs the full Trace workflow,
 * returning a structured summary suitable for display in an ASI:One conversation.
 *
 * Request body:
 * {
 *   "message": "Checkout button disappears on mobile after applying SAVE20",
 *   "provider": "openai" | "cerebras" | "gemini" | "venice"  (optional)
 * }
 *
 * Response:
 * {
 *   "text": "...",          -- human-readable summary for ASI:One
 *   "result": { ... },      -- structured result data
 *   "agentId": "trace",
 *   "capability": "bug-to-patch"
 * }
 */
export async function POST(request: NextRequest) {
  let body: { message?: string; provider?: string };

  try {
    body = (await request.json()) as { message?: string; provider?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const VALID_PROVIDERS = new Set(["cerebras", "gemini", "openai", "venice"]);
  const provider = VALID_PROVIDERS.has(body.provider ?? "")
    ? (body.provider as TraceProvider)
    : "openai";

  const origin = (() => {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host  = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
    return `${proto}://${host}`;
  })();

  // Collect workflow events
  const events: WorkflowEvent[] = [];
  const artifacts: WorkflowArtifact[] = [];
  let workflowSummary = "";
  let workflowError   = "";
  let elapsedMs       = 0;
  let prUrl           = "";
  let issueUrl        = "";

  await runTraceWorkflow(origin, (event) => {
    events.push(event);

    if (event.type === "artifact-created") {
      artifacts.push(event.artifact);
      if (event.artifact.type === "repo-pr") {
        prUrl    = event.artifact.repo.prUrl;
        issueUrl = event.artifact.repo.issueUrl;
      }
    }
    if (event.type === "workflow-completed") {
      workflowSummary = event.summary;
      elapsedMs       = event.elapsedMs;
    }
    if (event.type === "workflow-failed") {
      workflowError = event.error;
      elapsedMs     = event.elapsedMs;
    }
  }, provider);

  const success = !workflowError;
  const patchVerify = artifacts.find((a) => a.type === "patch-verify");
  const bugReport   = artifacts.find((a) => a.type === "bug-report");
  const repoPr      = artifacts.find((a) => a.type === "repo-pr");

  // Build ASI:One human-readable response
  const lines: string[] = [
    `**Trace Agent - Bug to Verified Patch**`,
    ``,
    success
      ? `✅ Investigation complete in ${(elapsedMs / 1000).toFixed(1)}s`
      : `❌ Investigation failed: ${workflowError}`,
    ``,
  ];

  if (bugReport?.type === "bug-report") {
    lines.push(`**Issue:** ${bugReport.report.title}`);
    lines.push(`**Severity:** ${bugReport.report.severity}`);
    lines.push(`**Environment:** ${bugReport.report.environment}`);
    lines.push(``);
  }

  if (patchVerify?.type === "patch-verify") {
    const v = patchVerify.verification;
    lines.push(`**Patch verification:**`);
    lines.push(`- Desktop CTA: ${v.after.desktop.checkoutVisible ? "✅ visible" : "❌ hidden"}`);
    lines.push(`- Mobile CTA:  ${v.after.mobile.checkoutVisible  ? "✅ visible" : "❌ hidden"}`);
    lines.push(`- Summary: ${v.summary}`);
    lines.push(``);
  }

  if (repoPr?.type === "repo-pr") {
    lines.push(`**GitHub:**`);
    lines.push(`- Issue: ${issueUrl}`);
    lines.push(`- PR:    ${prUrl}`);
    lines.push(``);
  }

  lines.push(`*Powered by Trace - multi-provider bug-to-patch agent system*`);
  lines.push(`*Provider: ${provider} | Steps: ${events.filter((e) => e.type === "step-completed").length}*`);

  return NextResponse.json({
    text:       lines.join("\n"),
    agentId:    "trace",
    capability: "bug-to-patch",
    provider,
    elapsedMs,
    success,
    result: {
      summary:      workflowSummary || workflowError,
      prUrl:        prUrl   || null,
      issueUrl:     issueUrl || null,
      patchFixed:   patchVerify?.type === "patch-verify"
        ? patchVerify.verification.fixed
        : null,
      stepsCompleted: events.filter((e) => e.type === "step-completed").length,
    },
  });
}

/**
 * GET /api/trace/asi-one
 *
 * Returns the Trace agent card for Agentverse / ASI:One discoverability.
 * This is the agent manifest that gets registered on Fetch.ai Agentverse.
 */
export async function GET() {
  const agentCard = {
    name:        "Trace",
    agentId:     "trace",
    version:     "1.0.0",
    description:
      "Trace is a multi-agent bug-to-verified-patch system. " +
      "Given a customer bug report, Trace autonomously: triages severity, " +
      "analyzes visual evidence via Venice.ai TEE, correlates client logs, " +
      "drives a Playwright browser reproduction, localizes the defect, plans and " +
      "applies a constrained patch, verifies it, and opens a GitHub issue and PR. " +
      "Built for enterprise legacy modernization - compresses weeks of consultant work into minutes.",
    capabilities: ["bug-to-patch", "enterprise-legacy-modernization", "automated-verification"],
    endpoints: {
      run:   "/api/trace/asi-one",
      audit: "/api/trace/audit",
      artifacts: "/api/trace/artifacts",
    },
    providers: ["openai", "cerebras", "gemini", "venice"],
    input: {
      type:       "object",
      properties: {
        message:  { type: "string", description: "Natural language bug report" },
        provider: { type: "string", enum: ["openai", "cerebras", "gemini", "venice"], default: "openai" },
      },
      required: ["message"],
    },
    output: {
      type:       "object",
      properties: {
        text:     { type: "string", description: "Human-readable summary for ASI:One" },
        result:   { type: "object" },
        success:  { type: "boolean" },
        prUrl:    { type: "string" },
        issueUrl: { type: "string" },
      },
    },
    sponsors: ["OpenAI", "Venice.ai", "Cerebras", "Fetch.ai", "Conduct AI", "BasedAI"],
    hackathon: "UK AI Agent Hackathon EP5 × Conduct",
  };

  return NextResponse.json(agentCard);
}
