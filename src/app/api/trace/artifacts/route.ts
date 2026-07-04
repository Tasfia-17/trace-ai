import { NextRequest, NextResponse } from "next/server";
import { filterArtifactsForRole, getAclForArtifact, type ArtifactRole } from "@/lib/artifact-acl";
import type { WorkflowArtifact } from "@/lib/workflow-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// In-memory artifact store - populated by the workflow runtime via SSE.
// In production this would be a persistent store.
const artifactStore: WorkflowArtifact[] = [];

/**
 * Push artifacts into the store. Called server-side by the workflow runtime.
 * This function is NOT an API route - it's called directly.
 */
export function storeArtifact(artifact: WorkflowArtifact) {
  artifactStore.push(artifact);
}

export function clearArtifactStore() {
  artifactStore.length = 0;
}

const VALID_ROLES = new Set<ArtifactRole>([
  "customer-support",
  "engineer",
  "senior-engineer",
  "security-auditor",
  "system",
]);

/**
 * GET /api/trace/artifacts?role=engineer
 *
 * Returns all artifacts visible to the given role.
 * ACL is enforced at this retrieval layer - no LLM involved.
 *
 * Example responses by role:
 *  - customer-support: sees triage, bug-report, maintainer artifacts only
 *  - engineer:         sees everything except vision (screenshot) and patch diffs
 *  - senior-engineer:  sees everything
 *  - security-auditor: sees nothing (use /api/trace/audit instead)
 */
export async function GET(request: NextRequest) {
  const roleParam = request.nextUrl.searchParams.get("role") ?? "engineer";

  if (!VALID_ROLES.has(roleParam as ArtifactRole)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(", ")}` },
      { status: 400 },
    );
  }

  const role = roleParam as ArtifactRole;
  const { artifacts, redacted, latencyMs } = filterArtifactsForRole(artifactStore, role);

  // Attach ACL metadata to each returned artifact for transparency
  const annotated = artifacts.map((artifact) => {
    const acl = getAclForArtifact(artifact.id);
    return {
      ...artifact,
      _acl: acl
        ? {
            sensitivity: acl.sensitivity,
            allowedRoles: acl.allowedRoles,
            classifiedAt: acl.classifiedAt,
            sourceCount: acl.sourceArtifactIds.length,
          }
        : undefined,
    };
  });

  return NextResponse.json({
    role,
    artifacts: annotated,
    visible: artifacts.length,
    redacted,
    total: artifactStore.length,
    enforcedAt: "retrieval-layer",
    llmInDecisionPath: false,
    latencyMs,
  });
}
