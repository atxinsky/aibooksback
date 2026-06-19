import type { AdminStore, OrganizationRole, Permission, ProjectRole, User } from "./types.js";

const allPermissions: Permission[] = [
  "admin.open",
  "overview.view",
  "organizations.view",
  "organizations.manage",
  "users.view",
  "users.manage",
  "admin_users.view",
  "admin_users.manage",
  "invitations.view",
  "invitations.manage",
  "authors.view",
  "authors.manage",
  "projects.view",
  "projects.manage",
  "materials.view",
  "materials.manage",
  "materials.metadata",
  "author_brains.view",
  "author_brains.manage",
  "quality.view",
  "jobs.view",
  "jobs.manage",
  "llm.view",
  "llm.manage",
  "costs.view",
  "contracts.view",
  "contracts.manage",
  "exports.view",
  "exports.manage",
  "notifications.view",
  "notifications.manage",
  "audit.view",
  "feature_flags.view",
  "feature_flags.manage",
  "system.view",
  "support_grants.view",
  "support_grants.manage",
];

const platformRolePermissions: Record<Exclude<User["globalRole"], "user">, Permission[]> = {
  platform_owner: allPermissions,
  platform_admin: allPermissions,
  platform_ops: allPermissions.filter((permission) => !["admin_users.manage", "llm.manage", "contracts.manage"].includes(permission)),
  implementation_manager: [
    "admin.open",
    "overview.view",
    "organizations.view",
    "organizations.manage",
    "users.view",
    "users.manage",
    "invitations.view",
    "invitations.manage",
    "authors.view",
    "authors.manage",
    "projects.view",
    "projects.manage",
    "materials.view",
    "materials.manage",
    "author_brains.view",
    "quality.view",
    "jobs.view",
    "jobs.manage",
    "llm.view",
    "audit.view",
    "system.view",
  ],
  support: [
    "admin.open",
    "overview.view",
    "organizations.view",
    "users.view",
    "authors.view",
    "projects.view",
    "materials.metadata",
    "quality.view",
    "jobs.view",
    "exports.view",
    "audit.view",
    "support_grants.view",
    "system.view",
  ],
  finance_ops: [
    "admin.open",
    "overview.view",
    "organizations.view",
    "projects.view",
    "costs.view",
    "contracts.view",
    "contracts.manage",
    "exports.view",
    "audit.view",
  ],
  security_auditor: ["admin.open", "overview.view", "organizations.view", "projects.view", "materials.metadata", "exports.view", "audit.view", "system.view"],
};

const orgRolePermissions: Record<OrganizationRole, Permission[]> = {
  org_owner: [
    "admin.open",
    "overview.view",
    "organizations.view",
    "organizations.manage",
    "users.view",
    "users.manage",
    "invitations.view",
    "invitations.manage",
    "authors.view",
    "authors.manage",
    "projects.view",
    "projects.manage",
    "materials.view",
    "materials.metadata",
    "materials.manage",
    "author_brains.view",
    "quality.view",
    "jobs.view",
    "jobs.manage",
    "llm.view",
    "costs.view",
    "contracts.view",
    "exports.view",
    "notifications.view",
    "notifications.manage",
    "audit.view",
    "feature_flags.view",
    "system.view",
  ],
  org_admin: [
    "admin.open",
    "overview.view",
    "organizations.view",
    "users.view",
    "users.manage",
    "invitations.view",
    "invitations.manage",
    "authors.view",
    "authors.manage",
    "projects.view",
    "projects.manage",
    "materials.view",
    "materials.metadata",
    "materials.manage",
    "author_brains.view",
    "quality.view",
    "jobs.view",
    "jobs.manage",
    "llm.view",
    "costs.view",
    "contracts.view",
    "exports.view",
    "notifications.view",
    "audit.view",
    "feature_flags.view",
    "system.view",
  ],
  org_billing: ["admin.open", "overview.view", "organizations.view", "projects.view", "costs.view", "contracts.view", "exports.view", "audit.view"],
  org_data_steward: [
    "admin.open",
    "overview.view",
    "organizations.view",
    "authors.view",
    "projects.view",
    "materials.view",
    "materials.metadata",
    "materials.manage",
    "quality.view",
    "jobs.view",
    "audit.view",
  ],
  org_viewer: ["organizations.view", "projects.view"],
};

const projectRolePermissions: Record<ProjectRole, Permission[]> = {
  project_manager: ["projects.view", "projects.manage", "materials.view", "materials.manage", "author_brains.view", "quality.view", "jobs.view", "exports.view", "exports.manage"],
  editor: ["projects.view", "materials.view", "materials.manage", "author_brains.view", "quality.view", "jobs.view", "exports.view"],
  expert: ["projects.view", "materials.view", "author_brains.view", "quality.view"],
  author: ["projects.view", "author_brains.view"],
  viewer: ["projects.view"],
};

export function permissionsForUser(store: AdminStore, user: User) {
  const permissions = new Set<Permission>();

  if (user.status !== "active") return permissions;

  if (user.globalRole !== "user") {
    platformRolePermissions[user.globalRole].forEach((permission) => permissions.add(permission));
  }

  for (const member of store.organizationMembers.values()) {
    if (member.userId === user.id && member.status === "active") {
      orgRolePermissions[member.role].forEach((permission) => permissions.add(permission));
    }
  }

  for (const member of store.projectMembers.values()) {
    if (member.userId === user.id && member.status === "active") {
      projectRolePermissions[member.role].forEach((permission) => permissions.add(permission));
    }
  }

  return permissions;
}

export function hasPermission(store: AdminStore, user: User, permission: Permission) {
  return permissionsForUser(store, user).has(permission);
}

export function isPlatformScoped(user: User) {
  return ["platform_owner", "platform_admin", "platform_ops", "implementation_manager", "support", "finance_ops", "security_auditor"].includes(user.globalRole);
}

export function visibleOrganizationIds(store: AdminStore, user: User) {
  if (isPlatformScoped(user)) return new Set([...store.organizations.keys()]);

  const ids = new Set<string>();
  for (const member of store.organizationMembers.values()) {
    if (member.userId === user.id && member.status === "active") ids.add(member.organizationId);
  }
  for (const member of store.projectMembers.values()) {
    if (member.userId !== user.id || member.status !== "active") continue;
    const project = store.projects.get(member.projectId);
    if (project) ids.add(project.organizationId);
  }
  for (const author of store.authors.values()) {
    if (author.userId === user.id) ids.add(author.organizationId);
  }
  return ids;
}

export function visibleProjectIds(store: AdminStore, user: User) {
  if (isPlatformScoped(user)) return new Set([...store.projects.keys()]);

  const visibleOrgs = visibleOrganizationIds(store, user);
  const ids = new Set<string>();
  for (const project of store.projects.values()) {
    if (visibleOrgs.has(project.organizationId)) ids.add(project.id);
  }
  for (const member of store.projectMembers.values()) {
    if (member.userId === user.id && member.status === "active") ids.add(member.projectId);
  }
  return ids;
}

export function landingPathForUser(store: AdminStore, user: User) {
  const permissions = permissionsForUser(store, user);
  if (permissions.has("admin.open")) {
    if (isPlatformScoped(user)) return "/admin";
    const billingOrg = [...store.organizationMembers.values()].find((member) => member.userId === user.id && member.status === "active" && member.role === "org_billing");
    if (billingOrg) return `/admin/costs?scope=org:${billingOrg.organizationId}`;
    const adminOrg = [...store.organizationMembers.values()].find(
      (member) => member.userId === user.id && member.status === "active" && ["org_owner", "org_admin", "org_data_steward"].includes(member.role),
    );
    if (adminOrg) return `/admin?scope=org:${adminOrg.organizationId}`;
  }

  const author = [...store.authors.values()].find((item) => item.userId === user.id);
  const projectMember = [...store.projectMembers.values()].find((member) => member.userId === user.id && member.status === "active");
  if (author) return `/author-portal/${author.id}`;
  if (projectMember) return projectMember.role === "viewer" ? `/workspace/${projectMember.projectId}?mode=readonly` : `/workspace/${projectMember.projectId}`;
  return "/workspace";
}

export function visibleScopes(store: AdminStore, user: User) {
  return {
    organizations: [...visibleOrganizationIds(store, user)],
    projects: [...visibleProjectIds(store, user)],
  };
}
