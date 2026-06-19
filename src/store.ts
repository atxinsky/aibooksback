import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hashPassword } from "./crypto.js";
import { daysFromNow, nowIso } from "./time.js";
import type {
  AdminStore,
  AuditLog,
  Author,
  AuthorBrain,
  Contract,
  CostRecord,
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
  PublicUser,
  QualitySnapshot,
  Session,
  SupportAccessGrant,
  User,
} from "./types.js";

type StoreDump = {
  users: User[];
  sessions: Session[];
  organizations: Organization[];
  organizationMembers: OrganizationMember[];
  platformAdminMembers: PlatformAdminMember[];
  authors: Author[];
  projects: Project[];
  projectMembers: ProjectMember[];
  invitations: Invitation[];
  materials: Material[];
  authorBrains: AuthorBrain[];
  qualitySnapshots: QualitySnapshot[];
  jobs: Job[];
  llmConfigs: LlmProviderConfig[];
  costs: CostRecord[];
  contracts: Contract[];
  exports: ExportJob[];
  notifications: Notification[];
  featureFlags: FeatureFlag[];
  supportAccessGrants: SupportAccessGrant[];
  auditLogs: AuditLog[];
};

export function createEmptyStore(): AdminStore {
  return {
    users: new Map(),
    sessions: new Map(),
    organizations: new Map(),
    organizationMembers: new Map(),
    platformAdminMembers: new Map(),
    authors: new Map(),
    projects: new Map(),
    projectMembers: new Map(),
    invitations: new Map(),
    materials: new Map(),
    authorBrains: new Map(),
    qualitySnapshots: new Map(),
    jobs: new Map(),
    llmConfigs: new Map(),
    costs: new Map(),
    contracts: new Map(),
    exports: new Map(),
    notifications: new Map(),
    featureFlags: new Map(),
    supportAccessGrants: new Map(),
    auditLogs: new Map(),
  };
}

function put<T extends { id: string }>(map: Map<string, T>, value: T) {
  map.set(value.id, value);
  return value;
}

export function publicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export function cleanSession(session: Session) {
  const { tokenHash: _tokenHash, ...safe } = session;
  return safe;
}

export function createSeedStore() {
  const store = createEmptyStore();
  const t = nowIso();

  const admin = put(store.users, seedUser("usr_admin", "立言平台管理员", "admin@liyan.local", "platform_admin", "LiyanAdmin2026!", t));
  const ops = put(store.users, seedUser("usr_ops", "立言平台运营", "ops@liyan.local", "platform_ops", "LiyanOps2026!", t));
  const impl = put(store.users, seedUser("usr_impl", "客户实施", "impl@liyan.local", "implementation_manager", "LiyanImpl2026!", t));
  const support = put(store.users, seedUser("usr_support", "平台支持", "support@liyan.local", "support", "LiyanSupport2026!", t));
  const finance = put(store.users, seedUser("usr_finance", "财务运营", "finance@liyan.local", "finance_ops", "LiyanFinance2026!", t));
  const orgAdmin = put(store.users, seedUser("usr_orgadmin", "研究院管理员", "orgadmin@liyan.local", "user", "LiyanOrgAdmin2026!", t));
  const pm = put(store.users, seedUser("usr_pm", "项目经理", "pm@liyan.local", "user", "LiyanPM2026!", t));
  const editor = put(store.users, seedUser("usr_editor", "责任编辑", "editor@liyan.local", "user", "LiyanEditor2026!", t));
  const expert = put(store.users, seedUser("usr_expert", "专家审校", "expert@liyan.local", "user", "LiyanExpert2026!", t));
  const pan = put(store.users, seedUser("usr_pan", "潘老师", "pan@liyan.local", "user", "LiyanAuthor2026!", t));

  [admin, ops, impl, support, finance].forEach((user) => {
    if (user.globalRole !== "user") {
      put(store.platformAdminMembers, {
        id: `pam_${user.id.replace("usr_", "")}`,
        userId: user.id,
        platformRole: user.globalRole,
        allowedOrganizationIds: [],
        enabled: true,
        mustChangePassword: false,
        createdAt: t,
        updatedAt: t,
      });
    }
  });

  const org = put(store.organizations, {
    id: "org_liyan_demo",
    name: "潘伟斌 · 考古学者数字孪生试用研究院",
    type: "research_institute",
    ownerUserId: orgAdmin.id,
    tenantStatus: "trial",
    trialEndsAt: daysFromNow(30),
    plan: "professional",
    seatLimit: 20,
    projectLimit: 5,
    authorLimit: 3,
    dataRegion: "cn",
    privacyMode: "high_security",
    monthlyTokenBudget: 3_000_000,
    budgetPolicy: "require_approval",
    defaultModelPolicyId: "llm_org_default",
    status: "active",
    createdAt: t,
    updatedAt: t,
  });

  const otherOrg = put(store.organizations, {
    id: "org_other_research",
    name: "示例文史馆",
    type: "museum",
    ownerUserId: admin.id,
    tenantStatus: "trial",
    trialEndsAt: daysFromNow(14),
    plan: "trial",
    seatLimit: 5,
    projectLimit: 1,
    authorLimit: 1,
    dataRegion: "cn",
    privacyMode: "standard",
    monthlyTokenBudget: 300_000,
    budgetPolicy: "warn",
    status: "active",
    createdAt: t,
    updatedAt: t,
  });

  [
    { id: "om_admin", userId: orgAdmin.id, role: "org_admin" as const },
    { id: "om_pm", userId: pm.id, role: "org_viewer" as const },
    { id: "om_editor", userId: editor.id, role: "org_viewer" as const },
    { id: "om_expert", userId: expert.id, role: "org_viewer" as const },
    { id: "om_pan", userId: pan.id, role: "org_viewer" as const },
  ].forEach((member) =>
    put(store.organizationMembers, {
      id: member.id,
      organizationId: org.id,
      userId: member.userId,
      role: member.role,
      status: "active",
      createdAt: t,
      updatedAt: t,
    }),
  );

  const author = put(store.authors, {
    id: "auth_pan",
    organizationId: org.id,
    userId: pan.id,
    name: "潘伟斌",
    field: "考古学 / 曹操高陵研究",
    profileType: "archaeology",
    privacyLevel: "high_security",
    authorizationStatus: "active",
    sensitive: true,
    createdAt: t,
    updatedAt: t,
  });

  const project = put(store.projects, {
    id: "prj_pan_gaoling",
    organizationId: org.id,
    authorId: author.id,
    managerUserId: pm.id,
    title: "潘伟斌 · 考古学者数字孪生",
    type: "book",
    status: "writing",
    contractAmountCents: 500_0000,
    paidAmountCents: 150_0000,
    monthlyTokenBudget: 1_500_000,
    deadline: daysFromNow(60),
    privacyLevel: "high_security",
    exportPolicy: "allow_final_when_no_red",
    createdAt: t,
    updatedAt: t,
  });

  put(store.projects, {
    id: "prj_other_museum",
    organizationId: otherOrg.id,
    managerUserId: admin.id,
    title: "示例文史馆口述史项目",
    type: "author_brain",
    status: "setup",
    contractAmountCents: 100_0000,
    paidAmountCents: 0,
    monthlyTokenBudget: 200_000,
    privacyLevel: "internal",
    exportPolicy: "draft_only",
    createdAt: t,
    updatedAt: t,
  });

  [
    { id: "pm_pm", userId: pm.id, role: "project_manager" as const },
    { id: "pm_editor", userId: editor.id, role: "editor" as const },
    { id: "pm_expert", userId: expert.id, role: "expert" as const },
    { id: "pm_author", userId: pan.id, role: "author" as const },
  ].forEach((member) =>
    put(store.projectMembers, {
      id: member.id,
      projectId: project.id,
      userId: member.userId,
      role: member.role,
      status: "active",
      createdAt: t,
      updatedAt: t,
    }),
  );

  put(store.materials, {
    id: "mat_gaoling_report",
    organizationId: org.id,
    projectId: project.id,
    authorId: author.id,
    title: "曹操高陵发掘材料包",
    type: "document",
    status: "indexed",
    rightsStatus: "institution",
    sourceUsage: "fact_and_voice",
    privacyLevel: "high_security",
    uploadedBy: editor.id,
    chunks: 128,
    ocrQuality: 0.94,
    citationCount: 37,
    createdAt: t,
    updatedAt: t,
  });

  put(store.materials, {
    id: "mat_unlicensed_clip",
    organizationId: org.id,
    projectId: project.id,
    authorId: author.id,
    title: "待授权媒体采访摘录",
    type: "webclip",
    status: "blocked",
    rightsStatus: "pending",
    sourceUsage: "blocked",
    privacyLevel: "confidential",
    uploadedBy: pm.id,
    chunks: 8,
    citationCount: 0,
    createdAt: t,
    updatedAt: t,
  });

  put(store.authorBrains, {
    id: "brain_pan_v1",
    organizationId: org.id,
    projectId: project.id,
    authorId: author.id,
    version: 1,
    status: "pending_confirmation",
    completeness: {
      voice: 82,
      terminology: 88,
      logic: 84,
      stance: 76,
      sourceCoverage: 67,
      authorConfirmation: 35,
    },
    createdAt: t,
    updatedAt: t,
  });

  put(store.qualitySnapshots, {
    id: "qty_prj_pan",
    organizationId: org.id,
    projectId: project.id,
    greenSentences: 183,
    yellowSentences: 27,
    redSentences: 2,
    sourceCoverage: 0.67,
    styleMatch: 0.85,
    redReasons: {
      "missing_source": 1,
      "authorization_pending": 1,
    },
    updatedAt: t,
  });

  put(store.jobs, {
    id: "job_ocr_1",
    organizationId: org.id,
    projectId: project.id,
    type: "material.ocr",
    status: "failed",
    progress: 71,
    resourceType: "material",
    resourceId: "mat_unlicensed_clip",
    error: "授权状态为 pending，禁止继续 OCR 入库",
    createdAt: t,
    updatedAt: t,
  });

  put(store.llmConfigs, {
    id: "llm_org_default",
    organizationId: org.id,
    provider: "deepseek",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    keyRef: "env:DEEPSEEK_API_KEY",
    keyStatus: "configured",
    settings: {
      maxTokens: 4096,
      temperature: 0.4,
      monthlyBudgetCents: 20_000,
    },
    updatedBy: admin.id,
    updatedAt: t,
  });

  put(store.costs, {
    id: "cost_seed_1",
    organizationId: org.id,
    projectId: project.id,
    userId: editor.id,
    provider: "deepseek",
    model: "deepseek-chat",
    purpose: "draft.generate",
    inputTokens: 52100,
    outputTokens: 8500,
    costCents: 158,
    latencyMs: 9400,
    status: "ok",
    createdAt: t,
  });

  put(store.contracts, {
    id: "ctr_pan_trial",
    organizationId: org.id,
    code: "LIYAN-TRIAL-2026-PAN",
    plan: "professional",
    startsAt: t,
    endsAt: daysFromNow(30),
    seatLimit: 20,
    projectLimit: 5,
    authorLimit: 3,
    monthlyTokenLimit: 3_000_000,
    amountCents: 500_0000,
    paidAmountCents: 150_0000,
    status: "active",
    createdAt: t,
    updatedAt: t,
  });

  put(store.exports, {
    id: "exp_blocked_red",
    organizationId: org.id,
    projectId: project.id,
    requestedBy: editor.id,
    format: "delivery_package",
    status: "blocked",
    redSentenceCount: 2,
    yellowSentenceCount: 27,
    sourceCoverage: 0.67,
    blockedReason: "存在红句，不允许交付导出",
    createdAt: t,
    updatedAt: t,
  });

  put(store.notifications, {
    id: "ntf_author_confirm",
    organizationId: org.id,
    projectId: project.id,
    target: "user",
    targetUserId: pan.id,
    title: "待确认作者大脑",
    body: "潘老师作者大脑 v1 已生成，请确认语言风格和学术立场。",
    status: "queued",
    createdBy: pm.id,
    createdAt: t,
  });

  put(store.featureFlags, {
    id: "ff_wechat_reading",
    key: "wechat_reading_assist",
    scopeType: "organization",
    scopeId: org.id,
    enabled: true,
    config: { legalUseOnly: true },
    updatedBy: admin.id,
    updatedAt: t,
  });

  put(store.auditLogs, {
    id: "aud_seed",
    actorUserId: admin.id,
    organizationId: org.id,
    projectId: project.id,
    action: "system.seeded",
    resourceType: "admin_backend",
    requestId: "seed",
    createdAt: t,
  });

  return store;
}

function seedUser(id: string, name: string, email: string, globalRole: User["globalRole"], password: string, t: string): User {
  return {
    id,
    name,
    email,
    globalRole,
    status: "active",
    passwordHash: hashPassword(password),
    mustChangePassword: false,
    twoFactorEnabled: false,
    createdAt: t,
    updatedAt: t,
  };
}

export function dumpStore(store: AdminStore): StoreDump {
  return {
    users: [...store.users.values()],
    sessions: [...store.sessions.values()],
    organizations: [...store.organizations.values()],
    organizationMembers: [...store.organizationMembers.values()],
    platformAdminMembers: [...store.platformAdminMembers.values()],
    authors: [...store.authors.values()],
    projects: [...store.projects.values()],
    projectMembers: [...store.projectMembers.values()],
    invitations: [...store.invitations.values()],
    materials: [...store.materials.values()],
    authorBrains: [...store.authorBrains.values()],
    qualitySnapshots: [...store.qualitySnapshots.values()],
    jobs: [...store.jobs.values()],
    llmConfigs: [...store.llmConfigs.values()],
    costs: [...store.costs.values()],
    contracts: [...store.contracts.values()],
    exports: [...store.exports.values()],
    notifications: [...store.notifications.values()],
    featureFlags: [...store.featureFlags.values()],
    supportAccessGrants: [...store.supportAccessGrants.values()],
    auditLogs: [...store.auditLogs.values()],
  };
}

export function hydrateStore(dump: StoreDump): AdminStore {
  const store = createEmptyStore();
  for (const [key, rows] of Object.entries(dump) as Array<[keyof StoreDump, StoreDump[keyof StoreDump]]>) {
    const map = store[key] as Map<string, { id: string }>;
    for (const row of rows as Array<{ id: string }>) map.set(row.id, row);
  }
  return store;
}

export function loadStoreFromFile(file?: string) {
  if (!file) return createSeedStore();
  try {
    const raw = readFileSync(file, "utf8");
    return hydrateStore(JSON.parse(raw) as StoreDump);
  } catch {
    return createSeedStore();
  }
}

export function saveStoreToFile(store: AdminStore, file?: string) {
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(dumpStore(store), null, 2)}\n`);
}

