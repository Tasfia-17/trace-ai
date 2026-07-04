import { agentExecutionWaves, finalHandoff } from "@/lib/demo-agents";
import {
  getDemoAgent,
  getTraceModel,
  hasCerebrasConfig,
  runTraceAgent,
  type AgentRuntimeResult,
  type TraceRunEvent,
} from "@/lib/trace-agent-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function encodeEvent(event: TraceRunEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST() {
  if (!hasCerebrasConfig()) {
    return Response.json(
      { error: "CEREBRAS_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const mode = "cerebras";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: TraceRunEvent) {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      }

      const previousResults: AgentRuntimeResult[] = [];

      send({
        type: "run-started",
        mode,
        model: getTraceModel(),
        startedAt: new Date(startedAt).toISOString(),
      });

      for (const wave of agentExecutionWaves) {
        wave.forEach((agentId) => {
          send({
            type: "agent-started",
            agentId,
            source: mode,
          });
        });

        const waveResults = await Promise.all(
          wave.map((agentId) => runTraceAgent(getDemoAgent(agentId), previousResults)),
        );

        previousResults.push(...waveResults);

        waveResults.forEach((result) => {
          send({
            type: "agent-completed",
            result,
          });
        });
      }

      send({
        type: "run-completed",
        elapsedMs: Date.now() - startedAt,
        handoff: finalHandoff,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
