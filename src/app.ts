import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestContext } from "./middleware.js";
import { success } from "./response.js";
import { saveStoreToFile } from "./store.js";
import type { AdminStore, AppVariables } from "./types.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";

export function makeApp(store: AdminStore, options: { storeFile?: string; persist?: boolean } = {}) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", requestContext(store));
  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      credentials: true,
      allowHeaders: ["content-type", "authorization", "x-request-id"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  if (options.persist) {
    app.use("*", async (_c, next) => {
      await next();
      saveStoreToFile(store, options.storeFile);
    });
  }

  app.get("/health", (c) => success(c, { ok: true, service: "aibooksback", time: new Date().toISOString() }));
  app.get("/admin-health", (c) => success(c, { ok: true, service: "aibooksback", time: new Date().toISOString() }));

  app.route("/admin-api/auth", authRoutes);
  app.route("/admin-api/admin", adminRoutes);

  app.route("/api/auth", authRoutes);
  app.route("/api/admin", adminRoutes);

  app.notFound((c) => c.json({ ok: false, error: { code: "NOT_FOUND", message: "接口不存在", requestId: c.get("requestId") } }, 404));

  return app;
}

