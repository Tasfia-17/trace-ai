import type { ReproResult } from "@/lib/repro-contract";
import type { RuntimeSource } from "@/lib/trace-agent-runtime";

export type PatchOperation = {
  file: "src/components/CheckoutDemo.tsx";
  operation: "replace";
  find: string;
  replace: string;
};

export type PatchPlan = {
  source: RuntimeSource;
  model: string;
  rationale: string;
  risk: "low" | "medium" | "high";
  operations: PatchOperation[];
  verificationPlan: string[];
  latencyMs: number;
  error?: string;
};

export type PatchApplyResult = {
  applied: boolean;
  alreadyFixed: boolean;
  changedFiles: string[];
  diff: string;
  operation: PatchOperation;
  elapsedMs: number;
};

export type PatchVerifyResult = {
  fixed: boolean;
  elapsedMs: number;
  patch: PatchApplyResult;
  after: ReproResult;
  summary: string;
  prBody: string;
};

export type PatchResetResult = {
  reset: boolean;
  changedFiles: string[];
  elapsedMs: number;
};
