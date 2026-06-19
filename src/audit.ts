import { id } from "./crypto.js";
import { nowIso } from "./time.js";
import type { AppContext, AuditLog, JsonRecord } from "./types.js";

export function writeAudit(
  c: AppContext,
  input: {
    action: string;
    resourceType: string;
    resourceId?: string;
    organizationId?: string;
    projectId?: string;
    before?: JsonRecord;
    after?: JsonRecord;
  },
) {
  const user = c.get("user");
  const log: AuditLog = {
    id: id("aud"),
    actorUserId: user?.id,
    organizationId: input.organizationId,
    projectId: input.projectId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    before: input.before,
    after: input.after,
    ip: c.req.header("x-forwarded-for") ?? undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
    requestId: c.get("requestId"),
    createdAt: nowIso(),
  };
  c.get("store").auditLogs.set(log.id, log);
  return log;
}

