import type { Context } from "hono";

export type GlobalRole =
  | "platform_owner"
  | "platform_admin"
  | "platform_ops"
  | "implementation_manager"
  | "support"
  | "finance_ops"
  | "security_auditor"
  | "user";

export type OrganizationRole = "org_owner" | "org_admin" | "org_billing" | "org_data_steward" | "org_viewer";
export type ProjectRole = "project_manager" | "editor" | "expert" | "author" | "viewer";
export type UserStatus = "active" | "disabled";
export type TenantStatus = "trial" | "active" | "suspended" | "archived";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";
export type MaterialStatus = "uploaded" | "extracting" | "ocr_processing" | "needs_review" | "indexed" | "blocked" | "frozen" | "error";
export type MaterialUsage = "fact_and_voice" | "fact_only" | "voice_only" | "blocked";
export type MaterialRightsStatus = "original" | "institution" | "third_party" | "public" | "pending" | "forbidden";
export type ProjectStatus = "draft" | "setup" | "ingesting" | "brain_building" | "writing" | "reviewing" | "delivering" | "completed" | "frozen" | "archived";
export type AuthorBrainStatus = "building" | "pending_review" | "pending_confirmation" | "frozen" | "published" | "revoked";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export type LlmKeyStatus = "missing" | "configured" | "invalid" | "quota_exceeded";
export type ExportStatus = "queued" | "rendering" | "completed" | "blocked" | "failed";
export type SupportGrantStatus = "pending" | "approved" | "active" | "expired" | "revoked";

export type JsonRecord = Record<string, unknown>;

export type Permission =
  | "admin.open"
  | "overview.view"
  | "organizations.view"
  | "organizations.manage"
  | "users.view"
  | "users.manage"
  | "admin_users.view"
  | "admin_users.manage"
  | "invitations.view"
  | "invitations.manage"
  | "authors.view"
  | "authors.manage"
  | "projects.view"
  | "projects.manage"
  | "materials.view"
  | "materials.manage"
  | "materials.metadata"
  | "author_brains.view"
  | "author_brains.manage"
  | "quality.view"
  | "jobs.view"
  | "jobs.manage"
  | "llm.view"
  | "llm.manage"
  | "costs.view"
  | "contracts.view"
  | "contracts.manage"
  | "exports.view"
  | "exports.manage"
  | "notifications.view"
  | "notifications.manage"
  | "audit.view"
  | "feature_flags.view"
  | "feature_flags.manage"
  | "system.view"
  | "support_grants.view"
  | "support_grants.manage";

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  globalRole: GlobalRole;
  status: UserStatus;
  passwordHash: string;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
};

export type PublicUser = Omit<User, "passwordHash">;

export type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
  revokedAt?: string;
};

export type Organization = {
  id: string;
  name: string;
  type: "research_institute" | "publisher" | "government" | "museum" | "association" | "other";
  ownerUserId: string;
  tenantStatus: TenantStatus;
  trialEndsAt?: string;
  plan: "trial" | "standard" | "professional" | "high_security" | "on_premise";
  seatLimit: number;
  projectLimit: number;
  authorLimit: number;
  dataRegion: "cn" | "hk" | "sg" | "us";
  privacyMode: "standard" | "high_security" | "on_premise_ready";
  monthlyTokenBudget: number;
  budgetPolicy: "warn" | "require_approval" | "block";
  defaultModelPolicyId?: string;
  status: "active" | "frozen" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type PlatformAdminMember = {
  id: string;
  userId: string;
  platformRole: Exclude<GlobalRole, "user">;
  allowedOrganizationIds: string[];
  enabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Author = {
  id: string;
  organizationId: string;
  userId?: string;
  name: string;
  field: string;
  profileType: "archaeology" | "cultural_scholar" | "martial_arts" | "institution_ip" | "other";
  privacyLevel: "standard" | "high_security";
  authorizationStatus: "pending" | "active" | "expired" | "revoked";
  sensitive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  organizationId: string;
  authorId?: string;
  managerUserId: string;
  title: string;
  type: "author_brain" | "book" | "research_report" | "course" | "exhibition" | "institution_knowledge_base";
  status: ProjectStatus;
  contractAmountCents: number;
  paidAmountCents: number;
  monthlyTokenBudget: number;
  deadline?: string;
  privacyLevel: "internal" | "confidential" | "high_security";
  exportPolicy: "draft_only" | "allow_final_when_no_red";
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type Invitation = {
  id: string;
  email: string;
  organizationId?: string;
  projectId?: string;
  organizationRole?: OrganizationRole;
  projectRole?: ProjectRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  status: InvitationStatus;
  createdAt: string;
};

export type Material = {
  id: string;
  organizationId: string;
  projectId: string;
  authorId?: string;
  title: string;
  type: "document" | "image" | "audio" | "video" | "webclip";
  status: MaterialStatus;
  rightsStatus: MaterialRightsStatus;
  sourceUsage: MaterialUsage;
  privacyLevel: "public" | "internal" | "confidential" | "high_security";
  uploadedBy: string;
  chunks: number;
  ocrQuality?: number;
  citationCount: number;
  createdAt: string;
  updatedAt: string;
  frozenFrom?: { status: MaterialStatus; sourceUsage: MaterialUsage };
};

export type AuthorBrain = {
  id: string;
  organizationId: string;
  projectId: string;
  authorId: string;
  version: number;
  status: AuthorBrainStatus;
  completeness: {
    voice: number;
    terminology: number;
    logic: number;
    stance: number;
    sourceCoverage: number;
    authorConfirmation: number;
  };
  frozenAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type QualitySnapshot = {
  id: string;
  organizationId: string;
  projectId: string;
  greenSentences: number;
  yellowSentences: number;
  redSentences: number;
  sourceCoverage: number;
  styleMatch: number;
  redReasons: Record<string, number>;
  updatedAt: string;
};

export type Job = {
  id: string;
  organizationId: string;
  projectId?: string;
  type: "material.extract" | "material.ocr" | "material.embed" | "author_brain.build" | "author_brain.rebuild" | "draft.generate" | "export.render" | "notification.send";
  status: JobStatus;
  progress: number;
  resourceType?: string;
  resourceId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type LlmProviderConfig = {
  id: string;
  organizationId?: string;
  projectId?: string;
  provider: "openai" | "anthropic" | "gemini" | "deepseek" | "qwen" | "local";
  model: string;
  baseUrl?: string;
  keyRef?: string;
  keyStatus: LlmKeyStatus;
  settings: {
    maxTokens?: number;
    temperature?: number;
    monthlyBudgetCents?: number;
  };
  updatedBy: string;
  updatedAt: string;
};

export type CostRecord = {
  id: string;
  organizationId: string;
  projectId?: string;
  userId?: string;
  provider: string;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  latencyMs: number;
  status: "ok" | "failed";
  createdAt: string;
};

export type Contract = {
  id: string;
  organizationId: string;
  code: string;
  plan: Organization["plan"];
  startsAt: string;
  endsAt: string;
  seatLimit: number;
  projectLimit: number;
  authorLimit: number;
  monthlyTokenLimit: number;
  amountCents: number;
  paidAmountCents: number;
  status: "draft" | "active" | "expired" | "suspended";
  createdAt: string;
  updatedAt: string;
};

export type ExportJob = {
  id: string;
  organizationId: string;
  projectId: string;
  requestedBy: string;
  format: "docx" | "markdown" | "html" | "delivery_package";
  status: ExportStatus;
  redSentenceCount: number;
  yellowSentenceCount: number;
  sourceCoverage: number;
  blockedReason?: string;
  fileUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type Notification = {
  id: string;
  organizationId?: string;
  projectId?: string;
  target: "all" | "organization" | "project" | "user";
  targetUserId?: string;
  title: string;
  body: string;
  status: "draft" | "queued" | "sent" | "failed";
  createdBy: string;
  createdAt: string;
};

export type FeatureFlag = {
  id: string;
  key: string;
  scopeType: "platform" | "organization" | "project";
  scopeId?: string;
  enabled: boolean;
  config: JsonRecord;
  updatedBy: string;
  updatedAt: string;
};

export type SupportAccessGrant = {
  id: string;
  actorUserId: string;
  targetOrganizationId: string;
  targetProjectId?: string;
  reason: string;
  expiresAt: string;
  approvedBy?: string;
  status: SupportGrantStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  actorUserId?: string;
  organizationId?: string;
  projectId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: JsonRecord;
  after?: JsonRecord;
  ip?: string;
  userAgent?: string;
  requestId: string;
  createdAt: string;
};

export type AdminStore = {
  users: Map<string, User>;
  sessions: Map<string, Session>;
  organizations: Map<string, Organization>;
  organizationMembers: Map<string, OrganizationMember>;
  platformAdminMembers: Map<string, PlatformAdminMember>;
  authors: Map<string, Author>;
  projects: Map<string, Project>;
  projectMembers: Map<string, ProjectMember>;
  invitations: Map<string, Invitation>;
  materials: Map<string, Material>;
  authorBrains: Map<string, AuthorBrain>;
  qualitySnapshots: Map<string, QualitySnapshot>;
  jobs: Map<string, Job>;
  llmConfigs: Map<string, LlmProviderConfig>;
  costs: Map<string, CostRecord>;
  contracts: Map<string, Contract>;
  exports: Map<string, ExportJob>;
  notifications: Map<string, Notification>;
  featureFlags: Map<string, FeatureFlag>;
  supportAccessGrants: Map<string, SupportAccessGrant>;
  auditLogs: Map<string, AuditLog>;
};

export type AppVariables = {
  requestId: string;
  store: AdminStore;
  session?: Session;
  user?: User;
};

export type AppContext = Context<{ Variables: AppVariables }>;

