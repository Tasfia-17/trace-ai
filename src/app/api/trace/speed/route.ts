import { getSpeedComparison } from "@/lib/speed-comparison-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  return Response.json(await getSpeedComparison());
}
