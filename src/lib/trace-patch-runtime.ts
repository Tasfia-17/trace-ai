import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  PatchApplyResult,
  PatchOperation,
  PatchPlan,
  PatchResetResult,
  PatchVerifyResult,
} from "@/lib/patch-contract";
import { runCheckoutRepro } from "@/lib/repro-runtime";
import { formatEvidenceForPrompt, traceEvidence } from "@/lib/trace-evidence";
import {
  getRuntimeModel,
  hasRuntimeConfig,
  runTraceJsonCompletion,
  type TraceProvider,
} from "@/lib/trace-agent-runtime";

const targetRelativePath = "src/components/CheckoutDemo.tsx" as const;
const bugPattern = 'bugTriggered ? "max-sm:hidden" : ""';
const fixedReplacement = '""';
const fixedClassInterpolationPattern = /\$\{\s*""\s*\}/;
const stateDir = path.join(process.cwd(), ".trace");
const statePath = path.join(stateDir, "patch-state.json");
const targetPath = path.join(process.cwd(), targetRelativePath);

const notePattern = "Review your order details before continuing.";
const noteReplacement = "Your discount is applied. Continue to payment when ready.";
const allowedOperations: PatchOperation[] = [
  {
    file: targetRelativePath,
    operation: "replace",
    find: bugPattern,
    replace: fixedReplacement,
  },
  {
    file: targetRelativePath,
    operation: "replace",
    find: notePattern,
    replace: noteReplacement,
  },
];

type PatchState = {
  originalContent: string;
  patchedContent: string;
  appliedAt: string;
};

const patchPlanSchema = z.object({
  rationale: z.string().min(20).max(500),
  risk: z.enum(["low", "medium", "high"]).default("low"),
  verificationPlan: z.array(z.string().min(5).max(160)).min(2).max(5),
});

type PatchPlanModelOutput = z.infer<typeof patchPlanSchema>;

const globalForPatch = globalThis as typeof globalThis & {
  tracePatchLock?: Promise<unknown>;
};

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 220);
  }

  return "Unknown patch runtime error";
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model response did not contain a JSON object.");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function parsePatchPlan(content: string): PatchPlanModelOutput {
  return patchPlanSchema.parse(JSON.parse(extractJsonObject(content)));
}

function buildPatchPlanPrompt() {
  return [
    "You are the Patch Agent for Trace.",
    "The app has already reproduced this checkout bug. Recommend a minimal safe fix.",
    "Do not propose arbitrary files. The only allowed file is src/components/CheckoutDemo.tsx.",
    "The patch engine will only remove the mobile-only hidden class from the checkout CTA.",
    "",
    "Evidence:",
    formatEvidenceForPrompt(traceEvidence),
    "",
    "Current defect anchor:",
    bugPattern,
    "",
    "Return only JSON:",
    '{"rationale":"why this fix is correct","risk":"low","verificationPlan":["step","step"]}',
  ].join("\n");
}

export async function createPatchPlan(provider: TraceProvider = "openai"): Promise<PatchPlan> {
  const startedAt = Date.now();

  if (!hasRuntimeConfig(provider)) {
    throw new Error(
      `Provider "${provider}" is not configured. Set the corresponding API key environment variable.`,
    );
  }

  try {
    const completion = await runTraceJsonCompletion({
      provider,
      system: "You are a precise patch-planning agent. Return valid compact JSON only. No markdown.",
      prompt: buildPatchPlanPrompt(),
      seed: 44,
    });
    const parsed = parsePatchPlan(completion.content);

    return {
      source: completion.source,
      model: completion.model,
      rationale: parsed.rationale,
      risk: parsed.risk,
      operations: allowedOperations,
      verificationPlan: parsed.verificationPlan,
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  } catch (error) {
    throw new Error(
      `Patch Agent failed via ${provider} (${getRuntimeModel(provider)}): ${safeErrorMessage(error)}`,
    );
  }
}

async function readPatchState(): Promise<PatchState | null> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as PatchState;
  } catch {
    return null;
  }
}

async function writePatchState(state: PatchState) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function makeDiff(before: string, after: string) {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const changedIndex = beforeLines.findIndex((line, index) => line !== afterLines[index]);
  const start = Math.max(0, changedIndex - 3);
  const end = Math.min(Math.max(beforeLines.length, afterLines.length), changedIndex + 4);
  const output = [`--- a/${targetRelativePath}`, `+++ b/${targetRelativePath}`];

  for (let index = start; index < end; index += 1) {
    const beforeLine = beforeLines[index] ?? "";
    const afterLine = afterLines[index] ?? "";

    if (beforeLine === afterLine) {
      output.push(` ${beforeLine}`);
    } else {
      output.push(`-${beforeLine}`);
      output.push(`+${afterLine}`);
    }
  }

  return output.join("\n");
}

function restoreKnownBug(content: string) {
  let restored = content.replace(noteReplacement, notePattern);

  if (!restored.includes(bugPattern)) {
    restored = restored.replace(
      fixedClassInterpolationPattern,
      `\${\n                ${bugPattern}\n              }`,
    );
  }

  return restored;
}

async function withPatchLock<T>(work: () => Promise<T>): Promise<T> {
  while (globalForPatch.tracePatchLock) {
    await globalForPatch.tracePatchLock.catch(() => undefined);
  }

  const lock = work();
  globalForPatch.tracePatchLock = lock;

  try {
    return await lock;
  } finally {
    if (globalForPatch.tracePatchLock === lock) {
      globalForPatch.tracePatchLock = undefined;
    }
  }
}

export async function applyAllowedPatch(): Promise<PatchApplyResult> {
  return withPatchLock(async () => {
    const startedAt = Date.now();
    const currentContent = await readFile(targetPath, "utf8");

    if (!allowedOperations.some((operation) => currentContent.includes(operation.find))) {
      const state = await readPatchState();
      const alreadyFixed = Boolean(state && currentContent === state.patchedContent);

      return {
        applied: false,
        alreadyFixed,
        changedFiles: [],
        diff: "",
        operation: allowedOperations[0],
        elapsedMs: Math.max(1, Date.now() - startedAt),
      };
    }

    let patchedContent = currentContent;
    allowedOperations.forEach((operation) => {
      patchedContent = patchedContent.replace(operation.find, operation.replace);
    });
    await writePatchState({
      originalContent: currentContent,
      patchedContent,
      appliedAt: new Date().toISOString(),
    });
    await writeFile(targetPath, patchedContent, "utf8");

    return {
      applied: true,
      alreadyFixed: false,
      changedFiles: [targetRelativePath],
      diff: makeDiff(currentContent, patchedContent),
      operation: allowedOperations[0],
      elapsedMs: Math.max(1, Date.now() - startedAt),
    };
  });
}

export async function verifyAllowedPatch(origin: string): Promise<PatchVerifyResult> {
  const startedAt = Date.now();
  const patch = await applyAllowedPatch();
  const after = await runCheckoutRepro(origin);
  const fixed =
    after.desktop.checkoutVisible &&
    after.mobile.checkoutVisible &&
    after.desktop.totalText === "$155" &&
    after.mobile.totalText === "$155";

  return {
    fixed,
    elapsedMs: Math.max(1, Date.now() - startedAt),
    patch,
    after: {
      ...after,
      assertion: fixed
        ? "Patch verified: checkout CTA remains visible on desktop and mobile after SAVE20."
        : "Patch did not verify: expected checkout CTA visible on both desktop and mobile.",
    },
    summary: fixed
      ? "Removed the mobile-only hidden class from the checkout CTA while preserving coupon state, discount total, and event evidence."
      : "The patch was applied, but sandbox verification did not confirm the expected checkout behavior.",
    prBody: [
      "## Summary",
      "- Keep the checkout CTA visible after SAVE20 is applied on mobile.",
      "- Preserve discount calculation and customer-facing coupon feedback.",
      "- Verify desktop and 390x844 mobile checkout paths with the sandbox repro.",
      "",
      "## Verification",
      `- Desktop CTA: ${after.desktop.checkoutVisible ? "visible" : "hidden"}`,
      `- Mobile CTA: ${after.mobile.checkoutVisible ? "visible" : "hidden"}`,
      `- Mobile total: ${after.mobile.totalText}`,
    ].join("\n"),
  };
}

export async function resetAllowedPatch(): Promise<PatchResetResult> {
  return withPatchLock(async () => {
    const startedAt = Date.now();
    const currentContent = await readFile(targetPath, "utf8");
    const state = await readPatchState();

    const restoredContent =
      state?.originalContent.includes(bugPattern) && state.originalContent.includes(notePattern)
        ? state.originalContent
        : restoreKnownBug(currentContent);

    if (restoredContent === currentContent) {
      return {
        reset: false,
        changedFiles: [],
        elapsedMs: Math.max(1, Date.now() - startedAt),
      };
    }

    await writeFile(targetPath, restoredContent, "utf8");

    return {
      reset: true,
      changedFiles: [targetRelativePath],
      elapsedMs: Math.max(1, Date.now() - startedAt),
    };
  });
}
