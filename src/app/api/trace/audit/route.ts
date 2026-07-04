import { NextRequest, NextResponse } from "next/server";
import { getAuditLog, getAclRegistry, checkAccess, type ArtifactRole } from "@/lib/artifact-acl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ROLES = new Set<ArtifactRole>([
  "customer-support",
  "engineer",
  "senior-engineer",
  "security-auditor",
  "system",
]);

/**
 * GET /api/trace/audit
 *
 * Returns the audit log. Only accessible by security-auditor and system roles.
 * Query params:
 *   - role: ArtifactRole (required, determines what you can see)
 *   - limit: number (default 200)
 *   - since: ISO timestamp (optional, filter entries after this time)
 *
 * GET /api/trace/audit?role=security-auditor
 * GET /api/trace/audit?role=engineer&limit=50
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const roleParam = searchParams.get("role") ?? "engineer";
  const limitParam = parseInt(searchParams.get("limit") ?? "200", 10);
  const sinceParam = searchParams.get("since");

  if (!VALID_ROLES.has(roleParam as ArtifactRole)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(", ")}` },
      { status: 400 },
    );
  }

  const role = roleParam as ArtifactRole;
  const limit = isNaN(limitParam) || limitParam < 1 ? 200 : Math.min(limitParam, 1000);
  const sinceMs = sinceParam ? new Date(sinceParam).getTime() : undefined;

  // Only security-auditor and system can see the audit log
  if (role !== "security-auditor" && role !== "system") {
    return NextResponse.json(
      {
        error: "Access denied",
        reason: "Audit log access requires security-auditor or system role",
        requestorRole: role,
      },
      { status: 403 },
    );
  }

  const entries = getAuditLog(limit, sinceMs);
  const registry = getAclRegistry();
  const registrySummary: Record<string, { sensitivity: string; allowedRoles: string[] }> = {};
  for (const [id, acl] of registry) {
    registrySummary[id] = {
      sensitivity: acl.sensitivity,
      allowedRoles: acl.allowedRoles,
    };
  }

  return NextResponse.json({
    role,
    entries,
    total: entries.length,
    registeredArtifacts: registry.size,
    acl: registrySummary,
    generatedAt: new Date().toISOString(),
  });
}

/**
 * POST /api/trace/audit/check
 *
 * Check access for a specific artifact+role combination.
 * Body: { artifactId: string, role: ArtifactRole }
 */
export async function POST(request: NextRequest) {
  let body: { artifactId?: string; role?: string };

  try {
    body = (await request.json()) as { artifactId?: string; role?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.artifactId || !body.role) {
    return NextResponse.json(
      { error: "Body must include artifactId and role" },
      { status: 400 },
    );
  }

  if (!VALID_ROLES.has(body.role as ArtifactRole)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(", ")}` },
      { status: 400 },
    );
  }

  const result = checkAccess(body.artifactId, body.role as ArtifactRole);

  return NextResponse.json({
    artifactId: body.artifactId,
    role: body.role,
    ...result,
  });
}
