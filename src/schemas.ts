import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const OrganizationCreateSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["research_institute", "publisher", "government", "museum", "association", "other"]).default("research_institute"),
  ownerUserId: z.string().min(1),
  tenantStatus: z.enum(["trial", "active", "suspended", "archived"]).default("trial"),
  plan: z.enum(["trial", "standard", "professional", "high_security", "on_premise"]).default("trial"),
  seatLimit: z.number().int().positive().default(5),
  projectLimit: z.number().int().positive().default(1),
  authorLimit: z.number().int().positive().default(1),
  monthlyTokenBudget: z.number().int().nonnegative().default(300000),
  budgetPolicy: z.enum(["warn", "require_approval", "block"]).default("warn"),
  privacyMode: z.enum(["standard", "high_security", "on_premise_ready"]).default("standard"),
  dataRegion: z.enum(["cn", "hk", "sg", "us"]).default("cn"),
  trialDays: z.number().int().positive().max(365).optional(),
});

export const OrganizationPatchSchema = OrganizationCreateSchema.partial().omit({ ownerUserId: true });

export const UserCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  globalRole: z
    .enum(["platform_owner", "platform_admin", "platform_ops", "implementation_manager", "support", "finance_ops", "security_auditor", "user"])
    .default("user"),
  organizationId: z.string().optional(),
  organizationRole: z.enum(["org_owner", "org_admin", "org_billing", "org_data_steward", "org_viewer"]).optional(),
  projectId: z.string().optional(),
  projectRole: z.enum(["project_manager", "editor", "expert", "author", "viewer"]).optional(),
});

export const UserPatchSchema = z.object({
  name: z.string().min(1).optional(),
  globalRole: z.enum(["platform_owner", "platform_admin", "platform_ops", "implementation_manager", "support", "finance_ops", "security_auditor", "user"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  mustChangePassword: z.boolean().optional(),
});

export const InvitationCreateSchema = z.object({
  email: z.string().email(),
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  organizationRole: z.enum(["org_owner", "org_admin", "org_billing", "org_data_steward", "org_viewer"]).optional(),
  projectRole: z.enum(["project_manager", "editor", "expert", "author", "viewer"]).optional(),
  expiresInDays: z.number().int().positive().max(90).default(7),
});

export const AuthorCreateSchema = z.object({
  organizationId: z.string(),
  userId: z.string().optional(),
  name: z.string().min(1),
  field: z.string().min(1),
  profileType: z.enum(["archaeology", "cultural_scholar", "martial_arts", "institution_ip", "other"]).default("other"),
  privacyLevel: z.enum(["standard", "high_security"]).default("standard"),
  authorizationStatus: z.enum(["pending", "active", "expired", "revoked"]).default("pending"),
  sensitive: z.boolean().default(false),
});

export const ProjectCreateSchema = z.object({
  organizationId: z.string(),
  authorId: z.string().optional(),
  managerUserId: z.string(),
  title: z.string().min(2),
  type: z.enum(["author_brain", "book", "research_report", "course", "exhibition", "institution_knowledge_base"]).default("book"),
  monthlyTokenBudget: z.number().int().nonnegative().default(300000),
  contractAmountCents: z.number().int().nonnegative().default(0),
  privacyLevel: z.enum(["internal", "confidential", "high_security"]).default("internal"),
  exportPolicy: z.enum(["draft_only", "allow_final_when_no_red"]).default("allow_final_when_no_red"),
});

export const ProjectPatchSchema = ProjectCreateSchema.partial();

export const MaterialPatchSchema = z.object({
  status: z.enum(["uploaded", "extracting", "ocr_processing", "needs_review", "indexed", "blocked", "frozen", "error"]).optional(),
  rightsStatus: z.enum(["original", "institution", "third_party", "public", "pending", "forbidden"]).optional(),
  sourceUsage: z.enum(["fact_and_voice", "fact_only", "voice_only", "blocked"]).optional(),
  privacyLevel: z.enum(["public", "internal", "confidential", "high_security"]).optional(),
});

export const LlmConfigCreateSchema = z.object({
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  provider: z.enum(["openai", "anthropic", "gemini", "deepseek", "qwen", "local"]),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  keyRef: z.string().min(3).optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  monthlyBudgetCents: z.number().int().nonnegative().optional(),
});

export const FeatureFlagPatchSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const ExportCreateSchema = z.object({
  projectId: z.string(),
  format: z.enum(["docx", "markdown", "html", "delivery_package"]),
});

export const NotificationCreateSchema = z.object({
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  target: z.enum(["all", "organization", "project", "user"]),
  targetUserId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const SupportGrantCreateSchema = z.object({
  actorUserId: z.string(),
  targetOrganizationId: z.string(),
  targetProjectId: z.string().optional(),
  reason: z.string().min(5),
  expiresInHours: z.number().int().positive().max(72).default(2),
});

