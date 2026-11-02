# GEOly Docs

GEOly 产品文档站（Mintlify）。内容按顶部 Tab 分为：Get Started / Analytics / Shopify App / Platform / Integrations / Developers，支持 en（根路径）与 zh（`/zh`）。

## 目录

- `docs.json`：站点配置与导航（`navigation.languages[].tabs`）
- `index.mdx`、`zh/index.mdx`：首页卡片导航
- `<tab>/<slug>.mdx`、`zh/<tab>/<slug>.mdx`：文档页面
- `images/<slug>/`：文档图片
- `scripts/export-payload.mjs`：从官网 Payload CMS 导出文档的迁移脚本

## 从 Payload 重新导出

切换前文档仍以官网 Payload 为准，可随时重新导出覆盖：

```bash
node scripts/export-payload.mjs
```

脚本会同时生成：

- `scripts/navigation.generated.json`：导航结构，需同步到 `docs.json` 的 `navigation.languages`
- `scripts/redirects-map.json`：官网旧 `/docs/<slug>`、`/zh/docs/<slug>` → 新路径，供官网 `proxy.ts` 做 301

新增文档时在脚本的 `SECTIONS` 里登记 slug 所属 Tab / 分组。

## 本地预览与检查

```bash
npx mint@latest dev
npx mint@latest validate
npx mint@latest broken-links
```

## 发布

推送到 `main` 后由 Mintlify GitHub App 自动部署。
