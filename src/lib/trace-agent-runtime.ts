import Cerebras from "@cerebras/cerebras_cloud_sdk";
import OpenAI from "openai";
import { z } from "zod";
import { demoAgents, finalHandoff, type AgentDefinition, type AgentId } from "@/lib/demo-agents";
import { formatEvidenceForPrompt, traceEvidence } from "@/lib/trace-evidence";

// ─── Provider types ────────────────────────────────────────────────────────────

export type TraceProvider = "cerebras" | "gemini" | "openai" | "venice";
export type RuntimeSource = TraceProvider;

// Venice.ai uses an OpenAI-compatible API. For display purposes we want to show
// it as "venice" but it reuses the OpenAI SDK under the hood.
const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

// ─── Runtime result types ──────────────────────────────────────────────────────

export type AgentRuntimeResult = {
  agentId: AgentId;
  finding: string;
  evidence: string[];
  latencyMs: number;
  source: RuntimeSource;
  confidence?: number;
  error?: string;
};

export type TraceRunEvent =
  | {
      type: "run-started";
      mode: RuntimeSource;
      model: string;
      startedAt: string;
    }
  | {
      type: "agent-started";
      agentId: AgentId;
      source: RuntimeSource;
    }
  | {
      type: "agent-completed";
      result: AgentRuntimeResult;
    }
  | {
      type: "run-completed";
      elapsedMs: number;
      handoff: typeof finalHandoff;
    };

// ─── Schema validation ─────────────────────────────────────────────────────────

const agentOutputSchema = z.object({
  finding: z.string().min(12).max(240),
  evidence: z.array(z.string().min(1).max(160)).min(2).max(5),
  confidence: z.number().min(0).max(1).optional(),
});

type ValidAgentOutput = z.infer<typeof agentOutputSchema>;

type ChatResponseLike = {
  choices?: Array<{
    message?: {
      content?: string | null;
    } | null;
  }> | null;
};

type JsonCompletionRequest = {
  provider: TraceProvider;
  system: string;
  prompt: string;
  seed?: number;
};

type GeminiResponseLike = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

// ─── Cerebras client ───────────────────────────────────────────────────────────

let cachedCerebrasClient: Cerebras | null = null;
let cachedCerebrasKey = "";

export function getCerebrasClient() {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) return null;

  const baseURL = process.env.CEREBRAS_BASE_URL ?? "";
  const cacheKey = `${apiKey}:${baseURL}`;

  if (!cachedCerebrasClient || cachedCerebrasKey !== cacheKey) {
    cachedCerebrasClient = new Cerebras({
      apiKey,
      baseURL: process.env.CEREBRAS_BASE_URL,
      maxRetries: 1,
      timeout: 20_000,
      warmTCPConnection: true,
    });
    cachedCerebrasKey = cacheKey;
  }

  return cachedCerebrasClient;
}

// ─── OpenAI client ─────────────────────────────────────────────────────────────

let cachedOpenAIClient: OpenAI | null = null;
let cachedOpenAIKey = "";

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  if (!cachedOpenAIClient || cachedOpenAIKey !== apiKey) {
    cachedOpenAIClient = new OpenAI({ apiKey, maxRetries: 1, timeout: 30_000 });
    cachedOpenAIKey = apiKey;
  }

  return cachedOpenAIClient;
}

// ─── Venice.ai client (OpenAI-compatible) ─────────────────────────────────────

let cachedVeniceClient: OpenAI | null = null;
let cachedVeniceKey = "";

export function getVeniceClient() {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) return null;

  if (!cachedVeniceClient || cachedVeniceKey !== apiKey) {
    cachedVeniceClient = new OpenAI({
      apiKey,
      baseURL: VENICE_BASE_URL,
      maxRetries: 1,
      timeout: 30_000,
    });
    cachedVeniceKey = apiKey;
  }

  return cachedVeniceClient;
}

// ─── Model resolution ──────────────────────────────────────────────────────────

export function getTraceModel() {
  return process.env.CEREBRAS_MODEL ?? "gemma-4-31b";
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp";
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4o";
}

export function getVeniceModel() {
  // Venice offers privacy-preserving inference via TEE.
  // Default to their best available model; override via env.
  return process.env.VENICE_MODEL ?? "llama-3.3-70b";
}

export function getRuntimeModel(provider: TraceProvider) {
  switch (provider) {
    case "gemini":  return getGeminiModel();
    case "openai":  return getOpenAIModel();
    case "venice":  return getVeniceModel();
    default:        return getTraceModel();
  }
}

// ─── Config checks ─────────────────────────────────────────────────────────────

export function hasCerebrasConfig() {
  return Boolean(process.env.CEREBRAS_API_KEY && getTraceModel());
}

export function hasGeminiConfig() {
  return Boolean(process.env.GEMINI_API_KEY && getGeminiModel());
}

export function hasOpenAIConfig() {
  return Boolean(process.env.OPENAI_API_KEY && getOpenAIModel());
}

export function hasVeniceConfig() {
  return Boolean(process.env.VENICE_API_KEY && getVeniceModel());
}

export function hasRuntimeConfig(provider: TraceProvider) {
  switch (provider) {
    case "gemini":  return hasGeminiConfig();
    case "openai":  return hasOpenAIConfig();
    case "venice":  return hasVeniceConfig();
    default:        return hasCerebrasConfig();
  }
}

/**
 * Returns the first available provider in priority order.
 * Used as the default when no provider is specified.
 */
export function getDefaultProvider(): TraceProvider {
  if (hasOpenAIConfig())  return "openai";
  if (hasCerebrasConfig()) return "cerebras";
  if (hasGeminiConfig())  return "gemini";
  if (hasVeniceConfig())  return "venice";
  return "cerebras"; // will fail gracefully with a clear error message
}

// ─── Gemini helpers ────────────────────────────────────────────────────────────

function getGeminiBaseUrl() {
  return (
    process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/$/, "");
}

function getGeminiModelPath(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

// ─── Shared utils ──────────────────────────────────────────────────────────────

export function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 180);
  return "Unknown agent runtime error";
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const firstBrace = trimmed.indexOf("{");
  const lastBrace  = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model response did not contain a JSON object.");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function parseAgentOutput(content: string): ValidAgentOutput {
  const json = JSON.parse(extractJsonObject(content));
  return agentOutputSchema.parse(json);
}

// ─── Core completion dispatcher ────────────────────────────────────────────────

export async function runTraceJsonCompletion({
  provider,
  system,
  prompt,
  seed,
}: JsonCompletionRequest) {
  // ── Gemini ──────────────────────────────────────────────────────────────────
  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const model = getGeminiModel();
    const response = await fetch(
      `${getGeminiBaseUrl()}/${getGeminiModelPath(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${system}\n\n${prompt}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "low" },
            temperature: 0.1,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini request failed: ${response.status} ${body.slice(0, 140)}`);
    }

    const body = (await response.json()) as GeminiResponseLike;
    const content = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!content) throw new Error("Gemini returned an empty response.");

    return { content, model, source: "gemini" as const };
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  if (provider === "openai") {
    const client = getOpenAIClient();
    if (!client) throw new Error("OPENAI_API_KEY is not configured.");

    const model = getOpenAIModel();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      seed,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    if (!content) throw new Error("OpenAI returned an empty response.");

    return { content, model, source: "openai" as const };
  }

  // ── Venice.ai (OpenAI-compatible, privacy-preserving TEE inference) ──────────
  if (provider === "venice") {
    const client = getVeniceClient();
    if (!client) throw new Error("VENICE_API_KEY is not configured.");

    const model = getVeniceModel();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: prompt },
      ],
      // Venice supports standard OpenAI params
      temperature: 0.1,
      // Note: Venice does not support json_object response_format on all models;
      // we rely on prompt instruction + extractJsonObject() for robustness.
    } as Parameters<typeof client.chat.completions.create>[0]);

    const content =
      (completion as { choices?: Array<{ message?: { content?: string | null } }> })
        .choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("Venice returned an empty response.");

    return { content, model, source: "venice" as const };
  }

  // ── Cerebras (default, lowest latency) ─────────────────────────────────────
  const client = getCerebrasClient();
  if (!client) throw new Error("CEREBRAS_API_KEY is not configured.");

  const model = getTraceModel();
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: prompt },
    ],
    response_format: { type: "json_object" },
    seed,
    temperature: 0.1,
  });

  if (!("choices" in completion)) {
    throw new Error("Cerebras returned an unexpected response.");
  }

  const cerebrasResponse = completion as ChatResponseLike;
  const content = cerebrasResponse.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Cerebras returned an empty response.");

  return { content, model, source: "cerebras" as const };
}

// ─── Agent prompt builder ──────────────────────────────────────────────────────

function buildAgentPrompt(agent: AgentDefinition, previousResults: AgentRuntimeResult[]) {
  const previousSummary =
    previousResults.length === 0
      ? "No prior agent results yet."
      : previousResults
          .map((result) => `- ${result.agentId}: ${result.finding}`)
          .join("\n");

  return [
    `You are the ${agent.name} for Trace, a customer-bug-to-patch agent system.`,
    `Your role: ${agent.role}.`,
    "",
    "Analyze the evidence for this exact checkout bug. Be concise, concrete, and implementation-oriented.",
    "Do not invent external services, files, or facts beyond the evidence.",
    "",
    "Evidence:",
    formatEvidenceForPrompt(traceEvidence),
    "",
    "Prior agent results:",
    previousSummary,
    "",
    "Return only a JSON object with this shape:",
    '{"finding":"one specific sentence","evidence":["short evidence item","short evidence item"],"confidence":0.0}',
  ].join("\n");
}

// ─── Vision agent: always routed to Venice.ai for PII-safe screenshot analysis ──

/**
 * Builds a Venice-specific prompt for the Vision agent that explains why
 * we use encrypted TEE inference for screenshot evidence.
 */
function buildVisionPromptForVenice(agent: AgentDefinition, previousResults: AgentRuntimeResult[]) {
  const base = buildAgentPrompt(agent, previousResults);
  return [
    "// This request is processed inside a Venice.ai Trusted Execution Environment (TEE).",
    "// Customer screenshot data is analyzed without leaving the encrypted enclave.",
    "// No screenshot data is logged, stored, or accessible outside this context.",
    "",
    base,
  ].join("\n");
}

// ─── Single agent runner ───────────────────────────────────────────────────────

export async function runTraceAgent(
  agent: AgentDefinition,
  previousResults: AgentRuntimeResult[],
  provider: TraceProvider = "cerebras",
): Promise<AgentRuntimeResult> {
  const startedAt = Date.now();

  // Vision agent is always routed to Venice.ai when configured, for privacy.
  // If Venice is not configured, fall back to the selected provider.
  const effectiveProvider: TraceProvider =
    agent.id === "vision" && hasVeniceConfig() ? "venice" : provider;

  if (!hasRuntimeConfig(effectiveProvider)) {
    throw new Error(
      `Provider "${effectiveProvider}" is not configured. ` +
        `Set the corresponding API key environment variable.`,
    );
  }

  const isVisionVenice = agent.id === "vision" && effectiveProvider === "venice";
  const prompt = isVisionVenice
    ? buildVisionPromptForVenice(agent, previousResults)
    : buildAgentPrompt(agent, previousResults);

  try {
    const completion = await runTraceJsonCompletion({
      provider: effectiveProvider,
      system:
        "You are a precise engineering agent. Return valid compact JSON only. No markdown.",
      prompt,
      seed: 42,
    });

    const parsed = parseAgentOutput(completion.content);

    return {
      agentId: agent.id,
      finding: parsed.finding,
      evidence: parsed.evidence,
      latencyMs: Math.max(1, Date.now() - startedAt),
      source: completion.source,
      confidence: parsed.confidence,
    };
  } catch (error) {
    throw new Error(
      `${agent.name} failed via ${effectiveProvider}: ${safeErrorMessage(error)}`,
    );
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

export function getDemoAgent(agentId: AgentId) {
  const agent = demoAgents.find((candidate) => candidate.id === agentId);
  if (!agent) throw new Error(`Unknown agent id: ${agentId}`);
  return agent;
}
