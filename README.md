# 立言 SaaS 平台管理后台后端

按 `docs/spec/12-saas-platform-admin-console.md` 推进的后端第一版。

本仓库目标是平台级管理后台，不是潘老师个人工作台设置页。它负责 SaaS 试用和后续研究院租户的账号、机构、项目、素材授权、模型密钥策略、成本、任务、导出和审计。

## 运行

```bash
npm install
npm run dev
```

默认端口：`3021`

## 测试

```bash
npm test
npm run typecheck
```

## 关键入口

- `GET /health`
- `POST /admin-api/auth/login`
- `GET /admin-api/auth/me`
- `POST /admin-api/auth/logout`
- `GET /admin-api/admin/overview`
- `GET /admin-api/admin/organizations`
- `GET /admin-api/admin/users`
- `GET /admin-api/admin/projects`
- `GET /admin-api/admin/materials`
- `GET /admin-api/admin/audit-logs`

## 试用账号

| 角色 | 邮箱 | 密码 | 默认落点 |
|---|---|---|---|
| 平台管理员 | `admin@liyan.local` | `LiyanAdmin2026!` | `/admin` |
| 平台运营 | `ops@liyan.local` | `LiyanOps2026!` | `/admin` |
| 客户实施 | `impl@liyan.local` | `LiyanImpl2026!` | `/admin` |
| 研究院管理员 | `orgadmin@liyan.local` | `LiyanOrgAdmin2026!` | `/admin?scope=org:org_liyan_demo` |
| 项目经理 | `pm@liyan.local` | `LiyanPM2026!` | `/workspace:projectId` |
| 责任编辑 | `editor@liyan.local` | `LiyanEditor2026!` | `/workspace:projectId` |
| 专家审校 | `expert@liyan.local` | `LiyanExpert2026!` | `/workspace:projectId` |
| 潘老师作者账号 | `pan@liyan.local` | `LiyanAuthor2026!` | `/author-portal:authorId` |

## 当前实现范围

- httpOnly cookie session + Bearer token fallback。
- 登录后返回 `landingPath`，前端不得硬编码跳 `/`。
- RBAC：平台角色、机构角色、项目角色合并授权。
- 租户可见范围：平台管理员全量，机构管理员只能看本机构。
- 管理后台核心模块 API：机构、用户、平台员工、邀请、作者、项目、素材、作者大脑、质量、任务、LLM、成本、合同、导出、通知、审计、功能开关、系统健康。
- 高危动作写审计。
- LLM keyRef 脱敏，真实 key 不返回前端。
- 红句导出阻断。
- JSON 文件持久化可选，后续可替换为 Postgres。

## 生产化待办

- 替换 JSON store 为 Postgres + Prisma/Drizzle。
- 接入 Redis session/queue。
- 接入邮件邀请和密码重置。
- 增加 2FA 和生产登录限速。
- 细化高保密材料正文查看审批。
