import type { AppContext } from "./types.js";

export function success<T>(c: AppContext, data: T, status = 200) {
  return c.json({ ok: true, data, requestId: c.get("requestId") }, status as 200);
}

export function failure(c: AppContext, code: string, message: string, status = 400, details?: unknown) {
  return c.json(
    {
      ok: false,
      error: { code, message, details, requestId: c.get("requestId") },
    },
    status as 400,
  );
}

export function parsePage(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageResult<T>(items: T[], page: number, pageSize: number, total: number) {
  return {
    items,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

