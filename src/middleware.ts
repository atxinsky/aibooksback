import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { id, sha256 } from "./crypto.js";
import { failure } from "./response.js";
import { hasPermission } from "./rbac.js";
import { nowIso } from "./time.js";
import type { AdminStore, AppVariables, Permission } from "./types.js";

export function requestContext(store: AdminStore) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    c.set("requestId", c.req.header("x-request-id") ?? id("req"));
    c.set("store", store);
    await next();
  });
}

export const requireAuth = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const cookieName = process.env.SESSION_COOKIE || "liyan_session";
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const token = getCookie(c, cookieName) ?? bearer;
  if (!token) return failure(c, "UNAUTHORIZED", "请先登录", 401);

  const tokenHash = sha256(token);
  const session = [...c.get("store").sessions.values()].find((item) => item.tokenHash === tokenHash);
  if (!session || session.revokedAt || Date.parse(session.expiresAt) < Date.now()) {
    return failure(c, "UNAUTHORIZED", "登录状态已失效", 401);
  }

  const user = c.get("store").users.get(session.userId);
  if (!user || user.status !== "active") return failure(c, "FORBIDDEN", "账号不可用", 403);

  c.get("store").sessions.set(session.id, { ...session, lastActiveAt: nowIso() });
  c.set("session", session);
  c.set("user", user);
  await next();
});

export function requirePermission(permission: Permission) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const user = c.get("user");
    if (!user) return failure(c, "UNAUTHORIZED", "请先登录", 401);
    if (!hasPermission(c.get("store"), user, permission)) {
      return failure(c, "FORBIDDEN", "无权访问该资源", 403, { required: permission });
    }
    await next();
  });
}

