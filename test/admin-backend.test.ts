import { describe, expect, test } from "vitest";
import { makeApp } from "../src/app.js";
import { createSeedStore } from "../src/store.js";

function app() {
  return makeApp(createSeedStore());
}

async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function login(application: ReturnType<typeof makeApp>, email: string, password: string) {
  const res = await application.request("/admin-api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  const body = await json(res);
  return {
    token: body.data.token as string,
    user: body.data.user,
    landingPath: body.data.landingPath as string,
  };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("platform admin backend", () => {
  test("health endpoint and admin landing path work", async () => {
    const application = app();
    const health = await application.request("/health");
    expect(health.status).toBe(200);
    expect((await json(health)).data.service).toBe("aibooksback");

    const admin = await login(application, "admin@liyan.local", "LiyanAdmin2026!");
    expect(admin.user.globalRole).toBe("platform_admin");
    expect(admin.landingPath).toBe("/admin");

    const me = await application.request("/admin-api/auth/me", { headers: auth(admin.token) });
    const meBody = await json(me);
    expect(me.status).toBe(200);
    expect(meBody.data.permissions).toContain("admin.open");
    expect(meBody.data.landingPath).toBe("/admin");
  });

  test("author account is routed to author portal and cannot open admin backend", async () => {
    const application = app();
    const pan = await login(application, "pan@liyan.local", "LiyanAuthor2026!");
    expect(pan.landingPath).toBe("/author-portal/auth_pan");

    const overview = await application.request("/admin-api/admin/overview", { headers: auth(pan.token) });
    const body = await json(overview);
    expect(overview.status).toBe(403);
    expect(body.error.details.required).toBe("admin.open");
  });

  test("organization admin sees only scoped tenant data", async () => {
    const application = app();
    const orgAdmin = await login(application, "orgadmin@liyan.local", "LiyanOrgAdmin2026!");
    expect(orgAdmin.landingPath).toBe("/admin?scope=org:org_liyan_demo");

    const organizations = await application.request("/admin-api/admin/organizations", { headers: auth(orgAdmin.token) });
    const orgBody = await json(organizations);
    expect(organizations.status).toBe(200);
    expect(orgBody.data.items.map((item: any) => item.id)).toEqual(["org_liyan_demo"]);

    const adminUsers = await application.request("/admin-api/admin/admin-users", { headers: auth(orgAdmin.token) });
    expect(adminUsers.status).toBe(403);
  });

  test("llm key refs are masked or env-only and never expose raw secrets", async () => {
    const application = app();
    const admin = await login(application, "admin@liyan.local", "LiyanAdmin2026!");

    const created = await application.request("/admin-api/admin/llm-configs", {
      method: "POST",
      headers: { ...auth(admin.token), "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org_liyan_demo",
        provider: "openai",
        model: "gpt-5-mini",
        keyRef: "key-real-looking-secret-1234567890",
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = await json(created);
    expect(createdBody.data.llmConfig.keyRef).toBe("key-re****7890");

    const list = await application.request("/admin-api/admin/llm-configs", { headers: auth(admin.token) });
    const listBody = await json(list);
    expect(JSON.stringify(listBody)).not.toContain("real-looking-secret");
    expect(JSON.stringify(listBody)).toContain("env:DEEPSEEK_API_KEY");
  });

  test("red sentence export is blocked and audited", async () => {
    const application = app();
    const admin = await login(application, "admin@liyan.local", "LiyanAdmin2026!");

    const res = await application.request("/admin-api/admin/exports", {
      method: "POST",
      headers: { ...auth(admin.token), "content-type": "application/json" },
      body: JSON.stringify({ projectId: "prj_pan_gaoling", format: "delivery_package" }),
    });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error.code).toBe("RED_SENTENCE_EXPORT_BLOCKED");
    expect(body.error.details.exportJob.redSentenceCount).toBe(2);

    const audit = await application.request("/admin-api/admin/audit-logs?action=export.blocked_red_sentences", { headers: auth(admin.token) });
    const auditBody = await json(audit);
    expect(auditBody.data.total).toBe(1);
  });

  test("disabling a user revokes active sessions and writes audit log", async () => {
    const application = app();
    const editor = await login(application, "editor@liyan.local", "LiyanEditor2026!");
    const admin = await login(application, "admin@liyan.local", "LiyanAdmin2026!");

    const disabled = await application.request("/admin-api/admin/users/usr_editor/disable", {
      method: "POST",
      headers: auth(admin.token),
    });
    expect(disabled.status).toBe(200);
    const disabledBody = await json(disabled);
    expect(disabledBody.data.revokedSessions).toBe(1);

    const oldMe = await application.request("/admin-api/auth/me", { headers: auth(editor.token) });
    expect(oldMe.status).toBe(401);

    const audit = await application.request("/admin-api/admin/audit-logs?action=user.disabled", { headers: auth(admin.token) });
    const auditBody = await json(audit);
    expect(auditBody.data.total).toBe(1);
  });
});
