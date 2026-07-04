import type { AgentId } from "@/lib/demo-agents";

export type SpeedAgentTiming = {
  agentId: AgentId;
  latencyMs: number;
};

export type SpeedComparison = {
  mode: "gpu-provider";
  providerName: string;
  model: string;
  baselineWallMs: number;
  baselineAgentTimings: SpeedAgentTiming[];
  note: string;
};

export type SpeedSummary = {
  cerebrasWallMs: number;
  baselineWallMs: number;
  speedup: number;
};
