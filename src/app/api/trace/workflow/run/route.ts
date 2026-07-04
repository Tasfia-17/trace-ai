import { NextRequest } from "next/server";
import { runTraceWorkflow } from "@/lib/trace-workflow-runtime";
import type { WorkflowEvent } from "@/lib/workflow-contract";
import type { TraceProvider } from "@/lib/trace-agent-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function encodeEvent(event: WorkflowEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function getOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    return `${forwardedProto ?? request.nextUrl.protocol.replace(":", "")}://${host}`;
  }

  return request.nextUrl.origin;
}

const VALID_PROVIDERS = new Set(["cerebras", "gemini", "openai", "venice"]);

async function getRequestedProvider(request: NextRequest): Promise<TraceProvider> {
  try {
    const body = (await request.json()) as { provider?: string };
    const p = body.provider ?? "";
    return VALID_PROVIDERS.has(p) ? (p as TraceProvider) : "openai";
  } catch {
    return "openai";
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const origin = getOrigin(request);
  const provider = await getRequestedProvider(request);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: WorkflowEvent) {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      }

      await runTraceWorkflow(origin, send, provider);
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
