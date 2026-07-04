import { agentExecutionWaves, demoAgents, type AgentId } from "@/lib/demo-agents";
import type { SpeedAgentTiming, SpeedComparison } from "@/lib/speed-contract";

function getBaselineConfig() {
  return {
    apiKey: process.env.GPU_BASELINE_API_KEY,
    baseUrl: process.env.GPU_BASELINE_BASE_URL,
    model: process.env.GPU_BASELINE_MODEL ?? "gpu-baseline-model",
    providerName: process.env.GPU_BASELINE_PROVIDER_NAME ?? "GPU provider",
  };
}

function buildBaselinePrompt(agentId: AgentId) {
  const agent = demoAgents.find((candidate) => candidate.id === agentId);

  return [
    `You are the ${agent?.name ?? agentId} in a customer bug triage system.`,
    "Summarize one finding for this bug in compact JSON.",
    "Bug: checkout button disappears on iPhone Safari after applying SAVE20.",
    "Return JSON with finding and evidence.",
  ].join("\n");
}

async function timeGpuAgent(agentId: AgentId, config: ReturnType<typeof getBaselineConfig>) {
  const startedAt = Date.now();
  const response = await fetch(`${config.baseUrl?.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: "Return compact JSON only.",
        },
        {
          role: "user",
          content: buildBaselinePrompt(agentId),
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`GPU baseline request failed with status ${response.status}`);
  }

  await response.json();

  return {
    agentId,
    latencyMs: Math.max(1, Date.now() - startedAt),
  };
}

async function runGpuProviderBaseline(): Promise<SpeedComparison> {
  const config = getBaselineConfig();
  if (!config.apiKey || !config.baseUrl) {
    throw new Error("GPU_BASELINE_API_KEY and GPU_BASELINE_BASE_URL are required.");
  }

  const startedAt = Date.now();
  const timings: SpeedAgentTiming[] = [];

  for (const wave of agentExecutionWaves) {
    const waveTimings = await Promise.all(wave.map((agentId) => timeGpuAgent(agentId, config)));
    timings.push(...waveTimings);
  }

  return {
    mode: "gpu-provider",
    providerName: config.providerName,
    model: config.model,
    baselineWallMs: Math.max(1, Date.now() - startedAt),
    baselineAgentTimings: timings,
    note: "Measured against the configured OpenAI-compatible GPU baseline provider.",
  };
}

export async function getSpeedComparison(): Promise<SpeedComparison> {
  return runGpuProviderBaseline();
}
