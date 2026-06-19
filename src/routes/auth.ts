import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { writeAudit } from "../audit.js";
import { id, randomToken, sha256, verifyPassword } from "../crypto.js";
import { requireAuth } from "../middleware.js";
import { failure, success } from "../response.js";
import { landingPathForUser, permissionsForUser, visibleScopes } from "../rbac.js";
import { cleanSession, publicUser } from "../store.js";
import { daysFromNow, nowIso } from "../time.js";
import type { AppContext, AppVariables } from "../types.js";
import { LoginSchema } from "../schemas.js";

export const authRoutes = new Hono<{ Variables: AppVariables }>();

function sessionCookieName() {
  return process.env.SESSION_COOKIE || "liyan_session";
}

function sessionDays() {
  return Math.max(1, Number(process.env.SESSION_DAYS ?? 7));
}

function mePayload(c: AppContext) {
  const store = c.get("store");
  const user = c.get("user")!;
  const permissions = [...permissionsForUser(store, user)].sort();
  return {
    user: publicUser(user),
    permissions,
    visibleScopes: visibleScopes(store, user),
    landingPath: landingPathForUser(store, user),
    organizations: [...store.organizations.values()].filter((org) => visibleScopes(store, user).organizations.includes(org.id)),
    projects: [...store.projects.values()].filter((project) => visibleScopes(store, user).projects.includes(project.id)),
  };
}

authRoutes.post("/login", async (c) => {
  const parsed = LoginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return failure(c, "BAD_REQUEST", "登录参数不合法", 400, parsed.error.flatten());

  const user = [...c.get("store").users.values()].find((item) => item.email.toLowerCase() === parsed.data.email.toLowerCase());
  if (!user || user.status !== "active" || !verifyPassword(parsed.data.password, user.passwordHash)) {
    writeAudit(c, {
      action: "auth.login_failed",
      resourceType: "user",
      resourceId: user?.id,
      after: { email: parsed.data.email },
    });
    return failure(c, "INVALID_CREDENTIALS", "邮箱或密码错误", 401);
  }

  const token = randomToken();
  const session = {
    id: id("ses"),
    userId: user.id,
    tokenHash: sha256(token),
    createdAt: nowIso(),
    lastActiveAt: nowIso(),
    expiresAt: daysFromNow(sessionDays()),
    ip: c.req.header("x-forwarded-for") ?? undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
  };

  c.get("store").sessions.set(session.id, session);
  c.get("store").users.set(user.id, { ...user, lastLoginAt: nowIso(), lastLoginIp: session.ip, updatedAt: nowIso() });
  c.set("session", session);
  c.set("user", { ...user, lastLoginAt: nowIso(), lastLoginIp: session.ip, updatedAt: nowIso() });

  setCookie(c, sessionCookieName(), token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionDays() * 24 * 60 * 60,
  });

  writeAudit(c, {
    action: "auth.login_success",
    resourceType: "session",
    resourceId: session.id,
    after: { landingPath: landingPathForUser(c.get("store"), c.get("user")!) },
  });

  return success(c, {
    token,
    session: cleanSession(session),
    ...mePayload(c),
  });
});

authRoutes.get("/me", requireAuth, (c) => success(c, mePayload(c)));

authRoutes.post("/logout", requireAuth, (c) => {
  const session = c.get("session");
  if (session) c.get("store").sessions.set(session.id, { ...session, revokedAt: nowIso(), lastActiveAt: nowIso() });
  deleteCookie(c, sessionCookieName(), { path: "/" });
  writeAudit(c, { action: "auth.logout", resourceType: "session", resourceId: session?.id });
  return success(c, { ok: true });
});

authRoutes.get("/sessions", requireAuth, (c) => {
  const user = c.get("user")!;
  const sessions = [...c.get("store").sessions.values()].filter((session) => session.userId === user.id).map(cleanSession);
  return success(c, { items: sessions });
});
