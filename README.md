# GEOly Docs

GEOly 产品文档站（Mintlify，https://docs.geoly.ai）。内容按顶部 Tab 分为：Documentation（使用教程，按分组展开）/ MCP Server（MCP、CLI）/ API Reference（GEOly Data API 概览 + 按资源分组的接口页），支持 en（根路径）与 zh（`/zh`）。

## 目录

- `docs.json`：站点配置与导航（`navigation.languages[].tabs`）
- `index.mdx`、`zh/index.mdx`：首页（Welcome to GEOly）
- `<dir>/<slug>.mdx`、`zh/<dir>/<slug>.mdx`：文档页面
- `images/<slug>/`：文档图片
- `scripts/export-payload.mjs`：从官网 Payload CMS 迁移文档的一次性脚本（已完成）

## 编辑文档

2026-11-02 起文档**直接在本仓库编辑**，Payload 里的旧 docs 只是存档。

- 新增页面：在对应目录新建 `.mdx`，并把路径加进 `docs.json` 中英文两份 `navigation.languages`。
- 不要随意移动已有页面的目录（= URL）：官网 `src/config/docs-site.ts` 的 301 映射依赖这些路径；确需移动时在 `docs.json` 加 `redirects` 并同步官网映射。
- **不要重新运行** `scripts/export-payload.mjs`：它会用 Payload 旧内容覆盖本仓库的修改（脚本默认拒绝执行，需 `--force`）。

## API Reference（OpenAPI）

API Reference Tab 的接口页由 Mintlify 从 `api-reference/openapi.json` 自动生成（参数、请求体、响应、代码示例、Try it 调试）。规格源自 App 公开的 https://app.geoly.ai/openapi/data-api-v1.json（源码 `geoly-app/src/lib/data-api/openapi.ts`），**App 的 API 有变化时**运行：

```bash
node scripts/sync-openapi.mjs
```

脚本会更新规格、生成/更新中英文接口页（`api-reference/**`、`zh/api-reference/**`），并校对接口清单——规格新增了未登记的接口会直接报错，到脚本的 `API_GROUPS` 里补上标题后再跑；接口分组变化时把 `scripts/api-navigation.generated.json` 同步进 `docs.json`。接口说明文字改动请改 App 里的规格，不要改生成的页面。

## 本地预览与检查

```bash
npx mint@latest dev
npx mint@latest validate
npx mint@latest broken-links
```

注：本地 `mint dev` 预览对 `/zh` 页面的顶部 Tab 会显示英文；API Reference 接口页在默认预览里是空白，需要加 `--classic`（`npx mint@latest dev --classic`）。线上均正常。

## 发布

推送到 `main` 后由 Mintlify GitHub App 自动部署，CDN 刷新通常需要 1–2 分钟。
