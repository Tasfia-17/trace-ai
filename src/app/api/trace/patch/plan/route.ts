import { createPatchPlan } from "@/lib/trace-patch-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  return Response.json(await createPatchPlan());
}
