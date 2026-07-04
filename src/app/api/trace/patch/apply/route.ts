import { NextRequest } from "next/server";
import { applyAllowedPatch, verifyAllowedPatch } from "@/lib/trace-patch-runtime";

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
  const url = new URL(request.url);
  const verify = url.searchParams.get("verify") !== "false";

  if (!verify) {
    return Response.json(await applyAllowedPatch());
  }

  return Response.json(await verifyAllowedPatch(getOrigin(request)));
}
