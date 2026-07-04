import { NextRequest } from "next/server";
import { runCheckoutRepro } from "@/lib/repro-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    return `${forwardedProto ?? request.nextUrl.protocol.replace(":", "")}://${host}`;
  }

  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const origin = getOrigin(request);

  try {
    return Response.json(await runCheckoutRepro(origin));
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown Playwright repro error",
      },
      { status: 500 },
    );
  }
}
