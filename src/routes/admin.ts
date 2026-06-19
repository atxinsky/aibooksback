import { Hono } from "hono";
import { writeAudit } from "../audit.js";
import { hashPassword, id, randomToken, sha256 } from "../crypto.js";
import { requireAuth, requirePermission } from "../middleware.js";
import { failure, pageResult, parsePage, success } from "../response.js";
import { visibleOrganizationIds, visibleProjectIds } from "../rbac.js";
import { publicUser, cleanSession } from "../store.js";
import { daysFromNow, nowIso } from "../time.js";
import type {
  AppContext,
  AppVariables,
  AuthorBrain,
  Contract,
  ExportJob,
  FeatureFlag,
  Invitation,
  Job,
  LlmProviderConfig,
  Material,
  Notification,
  Organization,
  OrganizationMember,
  PlatformAdminMember,
  Project,
  ProjectMember,
  SupportAccessGrant,
  User,
} from "../types.js";
import {
  AuthorCreateSchema,
  ExportCreateSchema,
  FeatureFlagPatchSchema,
  InvitationCreateSchema,
  LlmConfigCreateSchema,
  MaterialPatchSchema,
  NotificationCreateSchema,
  OrganizationCreateSchema,
  OrganizationPatchSchema,
  ProjectCreateSchema,
  ProjectPatchSchema,
  SupportGrantCreateSchema,
  UserCreateSchema,
  UserPatchSchema,
} from "../schemas.js";

export const adminRoutes = new Hono<{ Variables: AppVariables }>();

adminRoutes.use("*", requireAuth, requirePermission("admin.open"));

function paginate<T>(c: AppContext, rows: T[]) {
  const { page, pageSize, offset } = parsePage(new URL(c.req.url));
  return pageResult(rows.slice(offset, offset + pageSize), page, pageSize, rows.length);
}

async function parseJson(c: AppContext) {
  return c.req.json().catch(() => ({}));
}

function visibleUsers(c: AppContext) {
  const store = c.get("store");
  const user = c.get("user")!;
  const orgIds = visibleOrganizationIds(store, user);
  const projectIds = visibleProjectIds(store, user);
  const userIds = new Set<string>();

  for (const member of store.organizationMembers.values()) {
    if (orgIds.has(member.organizationId)) userIds.add(member.userId);
  }
  for (const member of store.projectMembers.values()) {
    if (projectIds.has(member.projectId)) userIds.add(member.userId);
  }
  for (const author of store.authors.values()) {
    if (orgIds.has(author.organizationId) && author.userId) userIds.add(author.userId);
  }

  if (["platform_owner", "platform_admin", "platform_ops", "implementation_manager", "support", "finance_ops", "security_auditor"].includes(user.globalRole)) {
    return [...store.users.values()].map(publicUser);
  }
  return [...store.users.values()].filter((item) => userIds.has(item.id)).map(publicUser);
}

function filterByVisibleOrg<T extends { organizationId: string }>(c: AppContext, rows: T[]) {
  const ids = visibleOrganizationIds(c.get("store"), c.get("user")!);
  return rows.filter((row) => ids.has(row.organizationId));
}

function filterByVisibleProject<T extends { projectId: string }>(c: AppContext, rows: T[]) {
  const ids = visibleProjectIds(c.get("store"), c.get("user")!);
  return rows.filter((row) => ids.has(row.projectId));
}

function safeInvitation(invitation: Invitation) {
  const { tokenHash: _tokenHash, ...safe } = invitation;
  return safe;
}

function safeLlmConfig(config: LlmProviderConfig) {
  return {
    ...config,
    keyRef: config.keyRef ? maskKeyRef(config.keyRef) : undefined,
  };
}

function maskKeyRef(keyRef: string) {
  if (keyRef.startsWith("env:")) return keyRef;
  if (keyRef.length <= 12) return "key_****";
  return `${keyRef.slice(0, 6)}****${keyRef.slice(-4)}`;
}

function qualityForProject(c: AppContext, projectId: string) {
  return [...c.get("store").qualitySnapshots.values()].find((snapshot) => snapshot.projectId === projectId);
}

adminRoutes.get("/overview", requirePermission("overview.view"), (c) => {
  const store = c.get("store");
  const orgIds = visibleOrganizationIds(store, c.get("user")!);
  const projectIds = visibleProjectIds(store, c.get("user")!);
  const organizations = [...store.organizations.values()].filter((org) => orgIds.has(org.id));
  const projects = [...store.projects.values()].filter((project) => projectIds.has(project.id));
  const materials = [...store.materials.values()].filter((material) => projectIds.has(material.projectId));
  const brains = [...store.authorBrains.values()].filter((brain) => projectIds.has(brain.projectId));
  const jobs = [...store.jobs.values()].filter((job) => orgIds.has(job.organizationId));
  const costs = [...store.costs.values()].filter((cost) => orgIds.has(cost.organizationId));
  const quality = [...store.qualitySnapshots.values()].filter((snapshot) => projectIds.has(snapshot.projectId));

  return success(c, {
    organizations: {
      total: organizations.length,
      trial: organizations.filter((org) => org.tenantStatus === "trial").length,
      active: organizations.filter((org) => org.status === "active").length,
    },
    projects: {
      total: projects.length,
      byStatus: countBy(projects, (project) => project.status),
    },
    users: visibleUsers(c).length,
    materials: {
      total: materials.length,
      needsReview: materials.filter((material) => material.status === "needs_review").length,
      blocked: materials.filter((material) => material.status === "blocked").length,
      frozen: materials.filter((material) => material.status === "frozen").length,
    },
    authorBrains: {
      total: brains.length,
      pendingConfirmation: brains.filter((brain) => brain.status === "pending_confirmation").length,
      frozen: brains.filter((brain) => brain.status === "frozen").length,
    },
    quality: {
      redSentences: quality.reduce((sum, item) => sum + item.redSentences, 0),
      yellowSentences: quality.reduce((sum, item) => sum + item.yellowSentences, 0),
      averageSourceCoverage: quality.length ? quality.reduce((sum, item) => sum + item.sourceCoverage, 0) / quality.length : 0,
      averageStyleMatch: quality.length ? quality.reduce((sum, item) => sum + item.styleMatch, 0) / quality.length : 0,
    },
    jobs: {
      total: jobs.length,
      failed: jobs.filter((job) => job.status === "failed").length,
      processing: jobs.filter((job) => job.status === "processing").length,
      queued: jobs.filter((job) => job.status === "queued").length,
    },
    llm: {
      costCents: costs.reduce((sum, cost) => sum + cost.costCents, 0),
      inputTokens: costs.reduce((sum, cost) => sum + cost.inputTokens, 0),
      outputTokens: costs.reduce((sum, cost) => sum + cost.outputTokens, 0),
      calls: costs.length,
    },
    risks: [
      ...materials.filter((material) => ["blocked", "error"].includes(material.status)).map((material) => ({ type: "material", id: material.id, title: material.title, status: material.status })),
      ...jobs.filter((job) => job.status === "failed").map((job) => ({ type: "job", id: job.id, title: job.type, status: job.status, error: job.error })),
      ...quality.filter((item) => item.redSentences > 0).map((item) => ({ type: "quality", id: item.id, projectId: item.projectId, redSentences: item.redSentences })),
    ],
  });
});

adminRoutes.get("/organizations", requirePermission("organizations.view"), (c) => {
  const q = new URL(c.req.url).searchParams.get("q")?.toLowerCase();
  const ids = visibleOrganizationIds(c.get("store"), c.get("user")!);
  let rows = [...c.get("store").organizations.values()].filter((org) => ids.has(org.id));
  if (q) rows = rows.filter((org) => org.name.toLowerCase().includes(q));
  return success(c, paginate(c, rows));
});

adminRoutes.post("/organizations", requirePermission("organizations.manage"), async (c) => {
  const parsed = OrganizationCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "机构参数不合法", 400, parsed.error.flatten());
  if (!c.get("store").users.has(parsed.data.ownerUserId)) return failure(c, "BAD_REQUEST", "机构拥有者不存在", 400);
  const organization: Organization = {
    id: id("org"),
    name: parsed.data.name,
    type: parsed.data.type,
    ownerUserId: parsed.data.ownerUserId,
    tenantStatus: parsed.data.tenantStatus,
    trialEndsAt: parsed.data.trialDays ? daysFromNow(parsed.data.trialDays) : undefined,
    plan: parsed.data.plan,
    seatLimit: parsed.data.seatLimit,
    projectLimit: parsed.data.projectLimit,
    authorLimit: parsed.data.authorLimit,
    dataRegion: parsed.data.dataRegion,
    privacyMode: parsed.data.privacyMode,
    monthlyTokenBudget: parsed.data.monthlyTokenBudget,
    budgetPolicy: parsed.data.budgetPolicy,
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").organizations.set(organization.id, organization);
  const member: OrganizationMember = {
    id: id("om"),
    organizationId: organization.id,
    userId: organization.ownerUserId,
    role: "org_owner",
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").organizationMembers.set(member.id, member);
  writeAudit(c, { action: "organization.created", resourceType: "organization", resourceId: organization.id, organizationId: organization.id, after: organization });
  return success(c, { organization, ownerMember: member }, 201);
});

adminRoutes.patch("/organizations/:id", requirePermission("organizations.manage"), async (c) => {
  const organization = c.get("store").organizations.get(c.req.param("id"));
  if (!organization) return failure(c, "NOT_FOUND", "机构不存在", 404);
  const parsed = OrganizationPatchSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "机构参数不合法", 400, parsed.error.flatten());
  const next = { ...organization, ...parsed.data, updatedAt: nowIso() };
  c.get("store").organizations.set(organization.id, next);
  writeAudit(c, { action: "organization.updated", resourceType: "organization", resourceId: organization.id, organizationId: organization.id, before: organization, after: next });
  return success(c, { organization: next });
});

adminRoutes.post("/organizations/:id/suspend", requirePermission("organizations.manage"), (c) => {
  return setOrganizationStatus(c, "suspended", "organization.suspended");
});

adminRoutes.post("/organizations/:id/reactivate", requirePermission("organizations.manage"), (c) => {
  return setOrganizationStatus(c, "active", "organization.reactivated");
});

function setOrganizationStatus(c: AppContext, tenantStatus: Organization["tenantStatus"], action: string) {
  const organization = c.get("store").organizations.get(c.req.param("id") ?? "");
  if (!organization) return failure(c, "NOT_FOUND", "机构不存在", 404);
  const next = { ...organization, tenantStatus, status: tenantStatus === "suspended" ? "frozen" as const : "active" as const, updatedAt: nowIso() };
  c.get("store").organizations.set(organization.id, next);
  writeAudit(c, { action, resourceType: "organization", resourceId: organization.id, organizationId: organization.id, before: organization, after: next });
  return success(c, { organization: next });
}

adminRoutes.get("/users", requirePermission("users.view"), (c) => {
  const q = new URL(c.req.url).searchParams.get("q")?.toLowerCase();
  let rows = visibleUsers(c);
  if (q) rows = rows.filter((user) => user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q));
  return success(c, paginate(c, rows));
});

adminRoutes.post("/users", requirePermission("users.manage"), async (c) => {
  const parsed = UserCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "用户参数不合法", 400, parsed.error.flatten());
  if ([...c.get("store").users.values()].some((user) => user.email.toLowerCase() === parsed.data.email.toLowerCase())) {
    return failure(c, "CONFLICT", "邮箱已存在", 409);
  }
  const user: User = {
    id: id("usr"),
    name: parsed.data.name,
    email: parsed.data.email,
    globalRole: parsed.data.globalRole,
    status: "active",
    passwordHash: hashPassword(parsed.data.password ?? randomToken(12)),
    mustChangePassword: !parsed.data.password,
    twoFactorEnabled: false,
    createdBy: c.get("user")!.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").users.set(user.id, user);
  if (user.globalRole !== "user") {
    const member: PlatformAdminMember = {
      id: id("pam"),
      userId: user.id,
      platformRole: user.globalRole,
      allowedOrganizationIds: [],
      enabled: true,
      mustChangePassword: user.mustChangePassword,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    c.get("store").platformAdminMembers.set(member.id, member);
  }
  attachMemberships(c, user.id, parsed.data.organizationId, parsed.data.organizationRole, parsed.data.projectId, parsed.data.projectRole);
  writeAudit(c, { action: "user.created", resourceType: "user", resourceId: user.id, after: publicUser(user) });
  return success(c, { user: publicUser(user) }, 201);
});

adminRoutes.patch("/users/:id", requirePermission("users.manage"), async (c) => {
  const user = c.get("store").users.get(c.req.param("id"));
  if (!user) return failure(c, "NOT_FOUND", "用户不存在", 404);
  const parsed = UserPatchSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "用户参数不合法", 400, parsed.error.flatten());
  const next = { ...user, ...parsed.data, updatedAt: nowIso() };
  c.get("store").users.set(user.id, next);
  writeAudit(c, { action: "user.updated", resourceType: "user", resourceId: user.id, before: publicUser(user), after: publicUser(next) });
  return success(c, { user: publicUser(next) });
});

adminRoutes.post("/users/:id/disable", requirePermission("users.manage"), (c) => {
  const user = c.get("store").users.get(c.req.param("id"));
  if (!user) return failure(c, "NOT_FOUND", "用户不存在", 404);
  const next = { ...user, status: "disabled" as const, updatedAt: nowIso() };
  c.get("store").users.set(user.id, next);
  const revokedSessions = revokeUserSessions(c, user.id);
  writeAudit(c, { action: "user.disabled", resourceType: "user", resourceId: user.id, before: publicUser(user), after: { ...publicUser(next), revokedSessions } });
  return success(c, { user: publicUser(next), revokedSessions });
});

adminRoutes.post("/users/:id/revoke-sessions", requirePermission("users.manage"), (c) => {
  const user = c.get("store").users.get(c.req.param("id"));
  if (!user) return failure(c, "NOT_FOUND", "用户不存在", 404);
  const revoked = revokeUserSessions(c, user.id);
  writeAudit(c, { action: "user.sessions_revoked", resourceType: "user", resourceId: user.id, after: { revoked } });
  return success(c, { revoked });
});

adminRoutes.get("/users/:id/sessions", requirePermission("users.view"), (c) => {
  const user = c.get("store").users.get(c.req.param("id"));
  if (!user) return failure(c, "NOT_FOUND", "用户不存在", 404);
  const sessions = [...c.get("store").sessions.values()].filter((session) => session.userId === user.id).map(cleanSession);
  return success(c, { items: sessions });
});

function revokeUserSessions(c: AppContext, userId: string) {
  let revoked = 0;
  for (const session of c.get("store").sessions.values()) {
    if (session.userId === userId && !session.revokedAt) {
      c.get("store").sessions.set(session.id, { ...session, revokedAt: nowIso(), lastActiveAt: nowIso() });
      revoked += 1;
    }
  }
  return revoked;
}

function attachMemberships(
  c: AppContext,
  userId: string,
  organizationId?: string,
  organizationRole?: OrganizationMember["role"],
  projectId?: string,
  projectRole?: ProjectMember["role"],
) {
  if (organizationId && organizationRole) {
    const memberId = id("om");
    c.get("store").organizationMembers.set(memberId, {
      id: memberId,
      organizationId,
      userId,
      role: organizationRole,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  if (projectId && projectRole) {
    const memberId = id("pm");
    c.get("store").projectMembers.set(memberId, {
      id: memberId,
      projectId,
      userId,
      role: projectRole,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
}

adminRoutes.get("/admin-users", requirePermission("admin_users.view"), (c) => {
  const rows = [...c.get("store").platformAdminMembers.values()].map((member) => ({
    ...member,
    user: publicUser(c.get("store").users.get(member.userId)!),
  }));
  return success(c, paginate(c, rows));
});

adminRoutes.post("/admin-users", requirePermission("admin_users.manage"), async (c) => {
  const parsed = UserCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "后台员工参数不合法", 400, parsed.error.flatten());
  const role = parsed.data.globalRole === "user" ? "platform_ops" : parsed.data.globalRole;
  const user: User = {
    id: id("usr"),
    name: parsed.data.name,
    email: parsed.data.email,
    globalRole: role,
    status: "active",
    passwordHash: hashPassword(parsed.data.password ?? randomToken(12)),
    mustChangePassword: true,
    twoFactorEnabled: false,
    createdBy: c.get("user")!.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const member: PlatformAdminMember = {
    id: id("pam"),
    userId: user.id,
    platformRole: role,
    allowedOrganizationIds: [],
    enabled: true,
    mustChangePassword: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").users.set(user.id, user);
  c.get("store").platformAdminMembers.set(member.id, member);
  writeAudit(c, { action: "admin_user.created", resourceType: "platform_admin_member", resourceId: member.id, after: { ...member, user: publicUser(user) } });
  return success(c, { adminUser: member, user: publicUser(user) }, 201);
});

adminRoutes.patch("/admin-users/:id", requirePermission("admin_users.manage"), async (c) => {
  const member = c.get("store").platformAdminMembers.get(c.req.param("id"));
  if (!member) return failure(c, "NOT_FOUND", "后台员工不存在", 404);
  const patch = await parseJson(c);
  const next = {
    ...member,
    platformRole: isString(patch.platformRole) ? patch.platformRole as PlatformAdminMember["platformRole"] : member.platformRole,
    allowedOrganizationIds: Array.isArray(patch.allowedOrganizationIds) ? patch.allowedOrganizationIds.filter(isString) : member.allowedOrganizationIds,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : member.enabled,
    updatedAt: nowIso(),
  };
  c.get("store").platformAdminMembers.set(member.id, next);
  const user = c.get("store").users.get(member.userId);
  if (user) c.get("store").users.set(user.id, { ...user, globalRole: next.platformRole, status: next.enabled ? "active" : "disabled", updatedAt: nowIso() });
  writeAudit(c, { action: "admin_user.updated", resourceType: "platform_admin_member", resourceId: member.id, before: member, after: next });
  return success(c, { adminUser: next });
});

adminRoutes.post("/admin-users/:id/reset-password", requirePermission("admin_users.manage"), (c) => {
  const member = c.get("store").platformAdminMembers.get(c.req.param("id"));
  if (!member) return failure(c, "NOT_FOUND", "后台员工不存在", 404);
  const user = c.get("store").users.get(member.userId);
  if (!user) return failure(c, "NOT_FOUND", "员工账号不存在", 404);
  const next = { ...user, passwordHash: hashPassword(randomToken(12)), mustChangePassword: true, updatedAt: nowIso() };
  c.get("store").users.set(user.id, next);
  const revoked = revokeUserSessions(c, user.id);
  writeAudit(c, { action: "admin_user.password_reset", resourceType: "platform_admin_member", resourceId: member.id, after: { revoked } });
  return success(c, { user: publicUser(next), revokedSessions: revoked });
});

adminRoutes.get("/invitations", requirePermission("invitations.view"), (c) => {
  const orgIds = visibleOrganizationIds(c.get("store"), c.get("user")!);
  const projectIds = visibleProjectIds(c.get("store"), c.get("user")!);
  const rows = [...c.get("store").invitations.values()].filter(
    (item) => (!item.organizationId || orgIds.has(item.organizationId)) && (!item.projectId || projectIds.has(item.projectId)),
  );
  return success(c, paginate(c, rows.map(safeInvitation)));
});

adminRoutes.post("/invitations", requirePermission("invitations.manage"), async (c) => {
  const parsed = InvitationCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "邀请参数不合法", 400, parsed.error.flatten());
  const token = randomToken(24);
  const invitation: Invitation = {
    id: id("inv"),
    email: parsed.data.email,
    organizationId: parsed.data.organizationId,
    projectId: parsed.data.projectId,
    organizationRole: parsed.data.organizationRole,
    projectRole: parsed.data.projectRole,
    tokenHash: sha256(token),
    invitedBy: c.get("user")!.id,
    expiresAt: daysFromNow(parsed.data.expiresInDays),
    status: "pending",
    createdAt: nowIso(),
  };
  c.get("store").invitations.set(invitation.id, invitation);
  writeAudit(c, { action: "invitation.created", resourceType: "invitation", resourceId: invitation.id, organizationId: invitation.organizationId, projectId: invitation.projectId, after: safeInvitation(invitation) });
  return success(c, { invitation: safeInvitation(invitation), acceptUrlPreview: `/accept-invite?token=${token}` }, 201);
});

adminRoutes.post("/invitations/:id/revoke", requirePermission("invitations.manage"), (c) => {
  const invitation = c.get("store").invitations.get(c.req.param("id"));
  if (!invitation) return failure(c, "NOT_FOUND", "邀请不存在", 404);
  const next = { ...invitation, status: "revoked" as const, revokedAt: nowIso() };
  c.get("store").invitations.set(invitation.id, next);
  writeAudit(c, { action: "invitation.revoked", resourceType: "invitation", resourceId: invitation.id, before: safeInvitation(invitation), after: safeInvitation(next) });
  return success(c, { invitation: safeInvitation(next) });
});

adminRoutes.post("/invitations/:id/resend", requirePermission("invitations.manage"), (c) => {
  const invitation = c.get("store").invitations.get(c.req.param("id"));
  if (!invitation) return failure(c, "NOT_FOUND", "邀请不存在", 404);
  writeAudit(c, { action: "invitation.resent", resourceType: "invitation", resourceId: invitation.id, after: safeInvitation(invitation) });
  return success(c, { resent: true });
});

adminRoutes.get("/authors", requirePermission("authors.view"), (c) => success(c, paginate(c, filterByVisibleOrg(c, [...c.get("store").authors.values()]))));

adminRoutes.post("/authors", requirePermission("authors.manage"), async (c) => {
  const parsed = AuthorCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "作者参数不合法", 400, parsed.error.flatten());
  const author = { id: id("auth"), ...parsed.data, createdAt: nowIso(), updatedAt: nowIso() };
  c.get("store").authors.set(author.id, author);
  writeAudit(c, { action: "author.created", resourceType: "author", resourceId: author.id, organizationId: author.organizationId, after: author });
  return success(c, { author }, 201);
});

adminRoutes.get("/projects", requirePermission("projects.view"), (c) => {
  const rows = filterByVisibleOrg(c, [...c.get("store").projects.values()]);
  return success(c, paginate(c, rows.map((project) => ({ ...project, quality: qualityForProject(c, project.id) }))));
});

adminRoutes.post("/projects", requirePermission("projects.manage"), async (c) => {
  const parsed = ProjectCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "项目参数不合法", 400, parsed.error.flatten());
  const project: Project = {
    id: id("prj"),
    ...parsed.data,
    status: "setup",
    paidAmountCents: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").projects.set(project.id, project);
  const memberId = id("pm");
  c.get("store").projectMembers.set(memberId, {
    id: memberId,
    projectId: project.id,
    userId: project.managerUserId,
    role: "project_manager",
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  writeAudit(c, { action: "project.created", resourceType: "project", resourceId: project.id, organizationId: project.organizationId, after: project });
  return success(c, { project }, 201);
});

adminRoutes.patch("/projects/:id", requirePermission("projects.manage"), async (c) => {
  const project = c.get("store").projects.get(c.req.param("id"));
  if (!project) return failure(c, "NOT_FOUND", "项目不存在", 404);
  const parsed = ProjectPatchSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "项目参数不合法", 400, parsed.error.flatten());
  const next = { ...project, ...parsed.data, updatedAt: nowIso() };
  c.get("store").projects.set(project.id, next);
  writeAudit(c, { action: "project.updated", resourceType: "project", resourceId: project.id, organizationId: project.organizationId, before: project, after: next });
  return success(c, { project: next });
});

adminRoutes.post("/projects/:id/freeze", requirePermission("projects.manage"), (c) => updateProjectStatus(c, "frozen", "project.frozen"));
adminRoutes.post("/projects/:id/archive", requirePermission("projects.manage"), (c) => updateProjectStatus(c, "archived", "project.archived"));

function updateProjectStatus(c: AppContext, status: Project["status"], action: string) {
  const project = c.get("store").projects.get(c.req.param("id") ?? "");
  if (!project) return failure(c, "NOT_FOUND", "项目不存在", 404);
  const next = { ...project, status, updatedAt: nowIso() };
  c.get("store").projects.set(project.id, next);
  writeAudit(c, { action, resourceType: "project", resourceId: project.id, organizationId: project.organizationId, before: project, after: next });
  return success(c, { project: next });
}

adminRoutes.get("/materials", requirePermission("materials.metadata"), (c) => {
  let rows = filterByVisibleProject(c, [...c.get("store").materials.values()]);
  const status = new URL(c.req.url).searchParams.get("status");
  if (status) rows = rows.filter((material) => material.status === status);
  return success(c, paginate(c, rows));
});

adminRoutes.patch("/materials/:id", requirePermission("materials.manage"), async (c) => {
  const material = c.get("store").materials.get(c.req.param("id"));
  if (!material) return failure(c, "NOT_FOUND", "素材不存在", 404);
  const parsed = MaterialPatchSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "素材参数不合法", 400, parsed.error.flatten());
  const next = { ...material, ...parsed.data, updatedAt: nowIso() };
  c.get("store").materials.set(material.id, next);
  writeAudit(c, { action: "material.updated", resourceType: "material", resourceId: material.id, organizationId: material.organizationId, projectId: material.projectId, before: material, after: next });
  return success(c, { material: next });
});

adminRoutes.post("/materials/:id/freeze", requirePermission("materials.manage"), (c) => {
  const material = c.get("store").materials.get(c.req.param("id"));
  if (!material) return failure(c, "NOT_FOUND", "素材不存在", 404);
  const next: Material = { ...material, status: "frozen", sourceUsage: "blocked", frozenFrom: { status: material.status, sourceUsage: material.sourceUsage }, updatedAt: nowIso() };
  c.get("store").materials.set(material.id, next);
  writeAudit(c, { action: "material.frozen", resourceType: "material", resourceId: material.id, organizationId: material.organizationId, projectId: material.projectId, before: material, after: next });
  return success(c, { material: next });
});

adminRoutes.post("/materials/:id/reprocess", requirePermission("materials.manage"), (c) => {
  const material = c.get("store").materials.get(c.req.param("id"));
  if (!material) return failure(c, "NOT_FOUND", "素材不存在", 404);
  const job: Job = {
    id: id("job"),
    organizationId: material.organizationId,
    projectId: material.projectId,
    type: material.type === "image" ? "material.ocr" : "material.extract",
    status: "queued",
    progress: 0,
    resourceType: "material",
    resourceId: material.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").jobs.set(job.id, job);
  writeAudit(c, { action: "material.reprocess_queued", resourceType: "material", resourceId: material.id, organizationId: material.organizationId, projectId: material.projectId, after: job });
  return success(c, { job }, 202);
});

adminRoutes.get("/author-brains", requirePermission("author_brains.view"), (c) => success(c, paginate(c, filterByVisibleProject(c, [...c.get("store").authorBrains.values()]))));

adminRoutes.post("/author-brains/:id/rebuild", requirePermission("author_brains.manage"), (c) => {
  const brain = c.get("store").authorBrains.get(c.req.param("id"));
  if (!brain) return failure(c, "NOT_FOUND", "作者大脑不存在", 404);
  const job: Job = {
    id: id("job"),
    organizationId: brain.organizationId,
    projectId: brain.projectId,
    type: "author_brain.rebuild",
    status: "queued",
    progress: 0,
    resourceType: "author_brain",
    resourceId: brain.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").jobs.set(job.id, job);
  writeAudit(c, { action: "author_brain.rebuild_queued", resourceType: "author_brain", resourceId: brain.id, organizationId: brain.organizationId, projectId: brain.projectId, after: job });
  return success(c, { job }, 202);
});

adminRoutes.post("/author-brains/:id/freeze", requirePermission("author_brains.manage"), (c) => {
  const brain = c.get("store").authorBrains.get(c.req.param("id"));
  if (!brain) return failure(c, "NOT_FOUND", "作者大脑不存在", 404);
  const next: AuthorBrain = { ...brain, status: "frozen", frozenAt: nowIso(), updatedAt: nowIso() };
  c.get("store").authorBrains.set(brain.id, next);
  writeAudit(c, { action: "author_brain.frozen", resourceType: "author_brain", resourceId: brain.id, organizationId: brain.organizationId, projectId: brain.projectId, before: brain, after: next });
  return success(c, { authorBrain: next });
});

adminRoutes.get("/quality", requirePermission("quality.view"), (c) => success(c, paginate(c, filterByVisibleProject(c, [...c.get("store").qualitySnapshots.values()]))));

adminRoutes.get("/jobs", requirePermission("jobs.view"), (c) => success(c, paginate(c, filterByVisibleOrg(c, [...c.get("store").jobs.values()]))));

adminRoutes.post("/jobs/:id/retry", requirePermission("jobs.manage"), (c) => {
  const job = c.get("store").jobs.get(c.req.param("id"));
  if (!job) return failure(c, "NOT_FOUND", "任务不存在", 404);
  const next: Job = { ...job, status: "queued", progress: 0, error: undefined, updatedAt: nowIso() };
  c.get("store").jobs.set(job.id, next);
  writeAudit(c, { action: "job.retried", resourceType: "job", resourceId: job.id, organizationId: job.organizationId, projectId: job.projectId, before: job, after: next });
  return success(c, { job: next });
});

adminRoutes.post("/jobs/:id/cancel", requirePermission("jobs.manage"), (c) => {
  const job = c.get("store").jobs.get(c.req.param("id"));
  if (!job) return failure(c, "NOT_FOUND", "任务不存在", 404);
  const next: Job = { ...job, status: "cancelled", updatedAt: nowIso() };
  c.get("store").jobs.set(job.id, next);
  writeAudit(c, { action: "job.cancelled", resourceType: "job", resourceId: job.id, organizationId: job.organizationId, projectId: job.projectId, before: job, after: next });
  return success(c, { job: next });
});

adminRoutes.get("/llm-configs", requirePermission("llm.view"), (c) => {
  const orgIds = visibleOrganizationIds(c.get("store"), c.get("user")!);
  const projectIds = visibleProjectIds(c.get("store"), c.get("user")!);
  const rows = [...c.get("store").llmConfigs.values()].filter(
    (config) => (!config.organizationId || orgIds.has(config.organizationId)) && (!config.projectId || projectIds.has(config.projectId)),
  );
  return success(c, paginate(c, rows.map(safeLlmConfig)));
});

adminRoutes.post("/llm-configs", requirePermission("llm.manage"), async (c) => {
  const parsed = LlmConfigCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "模型配置参数不合法", 400, parsed.error.flatten());
  const config: LlmProviderConfig = {
    id: id("llm"),
    organizationId: parsed.data.organizationId,
    projectId: parsed.data.projectId,
    provider: parsed.data.provider,
    model: parsed.data.model,
    baseUrl: parsed.data.baseUrl,
    keyRef: parsed.data.keyRef,
    keyStatus: parsed.data.keyRef ? "configured" : "missing",
    settings: {
      maxTokens: parsed.data.maxTokens,
      temperature: parsed.data.temperature,
      monthlyBudgetCents: parsed.data.monthlyBudgetCents,
    },
    updatedBy: c.get("user")!.id,
    updatedAt: nowIso(),
  };
  c.get("store").llmConfigs.set(config.id, config);
  writeAudit(c, { action: "llm_config.created", resourceType: "llm_config", resourceId: config.id, organizationId: config.organizationId, projectId: config.projectId, after: safeLlmConfig(config) });
  return success(c, { llmConfig: safeLlmConfig(config) }, 201);
});

adminRoutes.post("/llm-configs/:id/test", requirePermission("llm.view"), (c) => {
  const config = c.get("store").llmConfigs.get(c.req.param("id"));
  if (!config) return failure(c, "NOT_FOUND", "模型配置不存在", 404);
  writeAudit(c, { action: "llm_config.tested", resourceType: "llm_config", resourceId: config.id, organizationId: config.organizationId, projectId: config.projectId, after: { keyStatus: config.keyStatus } });
  return success(c, { ok: config.keyStatus === "configured", keyStatus: config.keyStatus, latencyMs: 120 });
});

adminRoutes.get("/costs", requirePermission("costs.view"), (c) => {
  const rows = filterByVisibleOrg(c, [...c.get("store").costs.values()]);
  return success(c, {
    ...paginate(c, rows),
    summary: {
      costCents: rows.reduce((sum, item) => sum + item.costCents, 0),
      inputTokens: rows.reduce((sum, item) => sum + item.inputTokens, 0),
      outputTokens: rows.reduce((sum, item) => sum + item.outputTokens, 0),
    },
  });
});

adminRoutes.get("/contracts", requirePermission("contracts.view"), (c) => success(c, paginate(c, filterByVisibleOrg(c, [...c.get("store").contracts.values()]))));

adminRoutes.get("/exports", requirePermission("exports.view"), (c) => success(c, paginate(c, filterByVisibleProject(c, [...c.get("store").exports.values()]))));

adminRoutes.post("/exports", requirePermission("exports.manage"), async (c) => {
  const parsed = ExportCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "导出参数不合法", 400, parsed.error.flatten());
  const project = c.get("store").projects.get(parsed.data.projectId);
  if (!project) return failure(c, "NOT_FOUND", "项目不存在", 404);
  const quality = qualityForProject(c, project.id);
  const redSentenceCount = quality?.redSentences ?? 0;
  const exportJob: ExportJob = {
    id: id("exp"),
    organizationId: project.organizationId,
    projectId: project.id,
    requestedBy: c.get("user")!.id,
    format: parsed.data.format,
    status: redSentenceCount > 0 ? "blocked" : "queued",
    redSentenceCount,
    yellowSentenceCount: quality?.yellowSentences ?? 0,
    sourceCoverage: quality?.sourceCoverage ?? 0,
    blockedReason: redSentenceCount > 0 ? "存在红句，不允许交付导出" : undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").exports.set(exportJob.id, exportJob);
  writeAudit(c, {
    action: redSentenceCount > 0 ? "export.blocked_red_sentences" : "export.queued",
    resourceType: "export",
    resourceId: exportJob.id,
    organizationId: project.organizationId,
    projectId: project.id,
    after: exportJob,
  });
  if (redSentenceCount > 0) return failure(c, "RED_SENTENCE_EXPORT_BLOCKED", "存在红句，不允许交付导出", 409, { exportJob });
  return success(c, { exportJob }, 202);
});

adminRoutes.get("/notifications", requirePermission("notifications.view"), (c) => success(c, paginate(c, filterByVisibleOrg(c, [...c.get("store").notifications.values()].filter((item) => item.organizationId) as Array<Notification & { organizationId: string }>))));

adminRoutes.post("/notifications", requirePermission("notifications.manage"), async (c) => {
  const parsed = NotificationCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "通知参数不合法", 400, parsed.error.flatten());
  const notification: Notification = { id: id("ntf"), ...parsed.data, status: "queued", createdBy: c.get("user")!.id, createdAt: nowIso() };
  c.get("store").notifications.set(notification.id, notification);
  writeAudit(c, { action: "notification.queued", resourceType: "notification", resourceId: notification.id, organizationId: notification.organizationId, projectId: notification.projectId, after: notification });
  return success(c, { notification }, 201);
});

adminRoutes.get("/audit-logs", requirePermission("audit.view"), (c) => {
  const orgIds = visibleOrganizationIds(c.get("store"), c.get("user")!);
  const projectIds = visibleProjectIds(c.get("store"), c.get("user")!);
  let rows = [...c.get("store").auditLogs.values()].filter(
    (log) => (!log.organizationId || orgIds.has(log.organizationId)) && (!log.projectId || projectIds.has(log.projectId)),
  );
  const action = new URL(c.req.url).searchParams.get("action");
  if (action) rows = rows.filter((log) => log.action === action);
  rows = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return success(c, paginate(c, rows));
});

adminRoutes.get("/feature-flags", requirePermission("feature_flags.view"), (c) => {
  const orgIds = visibleOrganizationIds(c.get("store"), c.get("user")!);
  const projectIds = visibleProjectIds(c.get("store"), c.get("user")!);
  const rows = [...c.get("store").featureFlags.values()].filter(
    (flag) => flag.scopeType === "platform" || !flag.scopeId || orgIds.has(flag.scopeId) || projectIds.has(flag.scopeId),
  );
  return success(c, paginate(c, rows));
});

adminRoutes.patch("/feature-flags/:id", requirePermission("feature_flags.manage"), async (c) => {
  const flag = c.get("store").featureFlags.get(c.req.param("id"));
  if (!flag) return failure(c, "NOT_FOUND", "功能开关不存在", 404);
  const parsed = FeatureFlagPatchSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "功能开关参数不合法", 400, parsed.error.flatten());
  const next: FeatureFlag = { ...flag, ...parsed.data, updatedBy: c.get("user")!.id, updatedAt: nowIso() };
  c.get("store").featureFlags.set(flag.id, next);
  writeAudit(c, { action: "feature_flag.updated", resourceType: "feature_flag", resourceId: flag.id, before: flag, after: next });
  return success(c, { featureFlag: next });
});

adminRoutes.get("/trial-accounts", requirePermission("system.view"), (c) => {
  return success(c, {
    warning: "仅用于本地试用与客户演示。正式部署必须替换为邀请制开户、强制改密和 2FA。",
    accounts: [
      { label: "平台管理员", email: "admin@liyan.local", role: "platform_admin", initialPassword: "LiyanAdmin2026!", entry: "/admin" },
      { label: "平台运营", email: "ops@liyan.local", role: "platform_ops", initialPassword: "LiyanOps2026!", entry: "/admin" },
      { label: "客户实施", email: "impl@liyan.local", role: "implementation_manager", initialPassword: "LiyanImpl2026!", entry: "/admin" },
      { label: "研究院管理员", email: "orgadmin@liyan.local", role: "org_admin", initialPassword: "LiyanOrgAdmin2026!", entry: "/admin?scope=org:org_liyan_demo" },
      { label: "项目经理", email: "pm@liyan.local", role: "project_manager", initialPassword: "LiyanPM2026!", entry: "/workspace/prj_pan_gaoling" },
      { label: "责任编辑", email: "editor@liyan.local", role: "editor", initialPassword: "LiyanEditor2026!", entry: "/workspace/prj_pan_gaoling" },
      { label: "专家审校", email: "expert@liyan.local", role: "expert", initialPassword: "LiyanExpert2026!", entry: "/workspace/prj_pan_gaoling" },
      { label: "潘老师作者账号", email: "pan@liyan.local", role: "author", initialPassword: "LiyanAuthor2026!", entry: "/author-portal/auth_pan" },
    ],
  });
});

adminRoutes.get("/settings", requirePermission("system.view"), (c) => {
  const store = c.get("store");
  return success(c, {
    deployment: {
      publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3021",
      adminApiBaseUrl: "/admin-api",
      dataMode: process.env.AI_BOOK_BACK_STORE_FILE ? "json_file" : "memory",
      adminStoreFile: process.env.AI_BOOK_BACK_STORE_FILE || "not_configured",
    },
    security: {
      sessionCookie: process.env.SESSION_COOKIE || "liyan_session",
      sessionDays: Math.max(1, Number(process.env.SESSION_DAYS ?? 7)),
      apiKeysInFrontend: false,
      auditEnabled: true,
      redSentenceExportBlocked: true,
    },
    trialReadiness: {
      organizations: store.organizations.size,
      projects: store.projects.size,
      users: store.users.size,
      materials: store.materials.size,
      llmConfigs: store.llmConfigs.size,
    },
  });
});

adminRoutes.get("/system", requirePermission("system.view"), (c) => {
  return success(c, {
    service: "aibooksback",
    version: "0.1.0",
    time: nowIso(),
    environment: process.env.NODE_ENV ?? "development",
    storage: process.env.AI_BOOK_BACK_STORE_FILE ? "json_file" : "memory",
    checks: {
      api: "ok",
      database: "not_configured",
      redis: "not_configured",
      objectStorage: "not_configured",
    },
    env: {
      sessionCookie: process.env.SESSION_COOKIE || "liyan_session",
      publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3021",
      storeFileConfigured: Boolean(process.env.AI_BOOK_BACK_STORE_FILE),
      apiKeysInFrontend: false,
    },
  });
});

adminRoutes.get("/support-access-grants", requirePermission("support_grants.view"), (c) => success(c, paginate(c, filterByVisibleOrg(c, [...c.get("store").supportAccessGrants.values()].map((grant) => ({ ...grant, organizationId: grant.targetOrganizationId }))))));

adminRoutes.post("/support-access-grants", requirePermission("support_grants.manage"), async (c) => {
  const parsed = SupportGrantCreateSchema.safeParse(await parseJson(c));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "代入授权参数不合法", 400, parsed.error.flatten());
  const grant: SupportAccessGrant = {
    id: id("sag"),
    actorUserId: parsed.data.actorUserId,
    targetOrganizationId: parsed.data.targetOrganizationId,
    targetProjectId: parsed.data.targetProjectId,
    reason: parsed.data.reason,
    expiresAt: new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000).toISOString(),
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  c.get("store").supportAccessGrants.set(grant.id, grant);
  writeAudit(c, { action: "support_access_grant.created", resourceType: "support_access_grant", resourceId: grant.id, organizationId: grant.targetOrganizationId, projectId: grant.targetProjectId, after: grant });
  return success(c, { supportAccessGrant: grant }, 201);
});

adminRoutes.post("/support-access-grants/:id/start", requirePermission("support_grants.manage"), (c) => {
  const grant = c.get("store").supportAccessGrants.get(c.req.param("id"));
  if (!grant) return failure(c, "NOT_FOUND", "代入授权不存在", 404);
  const next: SupportAccessGrant = { ...grant, status: "active", approvedBy: c.get("user")!.id, updatedAt: nowIso() };
  c.get("store").supportAccessGrants.set(grant.id, next);
  writeAudit(c, { action: "support_access_grant.started", resourceType: "support_access_grant", resourceId: grant.id, organizationId: grant.targetOrganizationId, projectId: grant.targetProjectId, before: grant, after: next });
  return success(c, { supportAccessGrant: next, banner: "SUPPORT_IMPERSONATION_ACTIVE" });
});

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = getKey(row);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
