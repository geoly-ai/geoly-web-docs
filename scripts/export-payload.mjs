#!/usr/bin/env node
/**
 * 从 geoly.ai 官网 Payload CMS 的公开 REST API 导出已发布文档，转换为 Mintlify MDX。
 *
 * ⚠️ 一次性迁移工具，迁移已于 2026-11-02 完成：此后文档直接在本仓库编辑，
 * 重新运行会用 Payload 旧内容覆盖所有手工修改。确需重跑时显式加 --force：
 *   node scripts/export-payload.mjs --force
 *
 * - 只导出 en / zh；de / jp 目前只有少量有正文的页面，暂不导出（见 SKIPPED 输出）。
 * - 正文只做语法转换（MDX 转义、图片本地化、内链改写），不改写内容。
 * - 同时生成 scripts/redirects-map.json：旧 /docs/<slug> → 新路径，供官网 proxy.ts 做 301。
 */
if (!process.argv.includes('--force')) {
  console.error(
    'Migration already done (2026-11-02). Docs are now edited in this repo; re-running overwrites them with old Payload content. Pass --force if you really mean it.'
  );
  process.exit(1);
}
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.geoly.ai';
const API = `${SITE}/payload/api/docs?limit=500&depth=0&where%5B_status%5D%5Bequals%5D=published`;
const LOCALES = ['en', 'zh'];

/**
 * 新信息架构：唯一事实源（参照 docs.peec.ai：少量顶部 Tab，主 Tab 下展开全部分组）。
 * TABS → groups；每个 group 的 dir 决定页面目录（= URL），slug 保持原样作为文件名。
 * 调整 Tab/分组归属时不要改 dir，否则官网 config/docs-site.ts 的跳转映射要同步改。
 * 某语言没有该 slug 的已发布文档时自动跳过；leading 为手写页面（如首页 index）。
 */
export const TABS = [
  {
    tab: { en: 'Documentation', zh: '文档' },
    icon: 'book-open',
    groups: [
      {
        name: { en: 'Get started', zh: '入门' },
        icon: 'rocket',
        dir: 'get-started',
        leading: ['index'],
        slugs: ['register-account', 'geoly-platform', 'geoly-operation-manual'],
      },
      {
        name: { en: 'Monitoring', zh: '监测' },
        icon: 'activity',
        dir: 'analytics',
        slugs: ['performance', 'geoly-prompts', 'ai-engine-topic'],
      },
      {
        name: { en: 'Insights', zh: '洞察' },
        icon: 'lightbulb',
        dir: 'analytics',
        slugs: [
          'ai-engine-insight',
          'ai-engine-explore',
          'ai-engine-shopping',
          'e-commerce',
          'geoly-ai-search',
          'chatgpt-ads-library',
        ],
      },
      {
        name: { en: 'Shopify app', zh: 'Shopify 应用' },
        icon: 'shopping-bag',
        dir: 'shopify',
        slugs: [
          'ai-llms-txt',
          'catalog-optimization',
          'how-to-setup-catalog-optimization',
        ],
      },
      {
        name: { en: 'Account & organization', zh: '账号与组织' },
        icon: 'users',
        dir: 'platform',
        slugs: ['basic-management'],
      },
      {
        name: { en: 'Agency', zh: '代理商' },
        icon: 'handshake',
        dir: 'platform',
        slugs: ['geo-agency'],
      },
      {
        name: { en: 'Integrations', zh: '集成' },
        icon: 'plug',
        dir: 'integrations',
        slugs: ['google-analytics-help-docs', 'cloudflare-integration'],
      },
      {
        name: { en: 'Concepts', zh: '概念' },
        icon: 'book-marked',
        dir: 'get-started',
        slugs: ['what-is-ai-llms-txt'],
      },
    ],
  },
  {
    // MCP 与 API 是重点入口，各自独立成顶部 Tab（同 docs.peec.ai 的 MCP Server / Customer API）
    tab: { en: 'MCP Server', zh: 'MCP Server' },
    icon: 'plug',
    groups: [
      {
        name: { en: 'MCP Server', zh: 'MCP Server' },
        icon: 'plug',
        dir: 'developers',
        slugs: ['mcp'],
      },
      {
        name: { en: 'CLI', zh: 'CLI' },
        icon: 'terminal',
        dir: 'developers',
        slugs: ['cli'],
      },
    ],
  },
  {
    // 菜单名用业界通用的 API Reference（AthenaHQ / Otterly / Mintlify 惯例）；
    // 页面标题保留 "GEOly Data API"，与 App 的 OpenAPI 规格标题一致
    tab: { en: 'API Reference', zh: 'API Reference' },
    icon: 'square-terminal',
    groups: [
      {
        name: { en: 'Data API', zh: 'Data API' },
        icon: 'code',
        dir: 'developers',
        slugs: ['data-api'],
      },
    ],
  },
];

/** slug → 所属目录 */
const SLUG_DIR = Object.fromEntries(
  TABS.flatMap((t) => t.groups.flatMap((g) => g.slugs.map((slug) => [slug, g.dir])))
);

/** 生成某语言下页面的路径（不含扩展名、无前导斜杠） */
const pagePath = (locale, slug) =>
  `${locale === 'en' ? '' : `${locale}/`}${SLUG_DIR[slug]}/${slug}`;

/**
 * 主流程：拉取 → 转换 → 写文件 → 输出导航与重定向映射。
 */
async function main() {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`Payload API ${res.status}`);
  const { docs } = await res.json();

  const published = new Map(); // `${locale}:${slug}` → doc
  const skipped = [];
  for (const doc of docs) {
    if (!doc.markdownContent?.trim()) continue; // de/jp 空壳
    if (!LOCALES.includes(doc.locale) || !SLUG_DIR[doc.slug]) {
      skipped.push(`${doc.locale}/${doc.slug}`);
      continue;
    }
    published.set(`${doc.locale}:${doc.slug}`, doc);
  }

  const imageCache = new Map(); // 远程 URL → 本地路径
  for (const doc of published.values()) {
    let body = stripLeadingH1(doc.markdownContent);
    body = await localizeImages(body, doc.slug, imageCache);
    body = rewriteLinks(body, doc.locale, published);
    body = sanitizeMdx(body);
    const file = join(ROOT, `${pagePath(doc.locale, doc.slug)}.mdx`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${frontmatter(doc)}\n${body.trim()}\n`, 'utf8');
  }

  // 导航（供 docs.json 使用）与旧 URL 重定向映射
  const navigation = buildNavigation(published);
  const redirects = {};
  for (const doc of published.values()) {
    const prefix = doc.locale === 'en' ? '' : `/${doc.locale}`;
    redirects[`${prefix}/docs/${doc.slug}`] = `/${pagePath(doc.locale, doc.slug)}`;
  }
  await writeFile(
    join(ROOT, 'scripts/navigation.generated.json'),
    `${JSON.stringify(navigation, null, 2)}\n`
  );
  await writeFile(
    join(ROOT, 'scripts/redirects-map.json'),
    `${JSON.stringify(redirects, null, 2)}\n`
  );

  console.log(`exported ${published.size} pages, ${imageCache.size} images`);
  if (skipped.length) console.log(`SKIPPED (not exported): ${skipped.join(', ')}`);
}

/**
 * 按 TABS 生成 navigation.languages 的 tabs 部分；首页 index 作为第一个分组的首篇。
 */
function buildNavigation(published) {
  return LOCALES.map((locale) => {
    const prefix = locale === 'en' ? '' : `${locale}/`;
    const tabs = [];
    for (const t of TABS) {
      const groups = t.groups
        .map((g) => ({
          group: g.name[locale],
          icon: g.icon,
          pages: [
            ...(g.leading ?? []).map((page) => `${prefix}${page}`),
            ...g.slugs
              .filter((slug) => published.has(`${locale}:${slug}`))
              .map((slug) => pagePath(locale, slug)),
          ],
        }))
        .filter((g) => g.pages.length);
      if (groups.length) tabs.push({ tab: t.tab[locale], icon: t.icon, groups });
    }
    return { language: locale, tabs };
  });
}

/** 生成 YAML frontmatter；用 JSON 字符串保证引号/冒号/全角符号安全 */
function frontmatter(doc) {
  const lines = ['---', `title: ${JSON.stringify(doc.title.trim())}`];
  if (doc.description?.trim()) {
    lines.push(`description: ${JSON.stringify(doc.description.trim())}`);
  }
  // 不导出 Payload 的单页 icon：侧栏只在分组标题上显示图标（同 docs.peec.ai），保持统一
  if (doc.full) lines.push('mode: "wide"');
  lines.push('---', '');
  return lines.join('\n');
}

/** frontmatter 的 title 会渲染成 H1，去掉正文开头重复的 H1 */
function stripLeadingH1(md) {
  return md.replace(/^\s*# [^\n]*\n/, '');
}

/**
 * 把 Supabase Storage 上的图片下载到 /images/<slug>/<hash>.<ext>，并改写为站内绝对路径。
 * 支持 `](url)`、`](<url> "title")` 两种写法；cdn.shopify.com 的视频保持远程。
 */
async function localizeImages(md, slug, cache) {
  const re = /!\[([^\]]*)\]\(\s*<?(https:\/\/[^\s>)]+supabase\.co\/storage\/[^\s>)]+)>?/g;
  const urls = [...new Set([...md.matchAll(re)].map((m) => m[2]))];
  for (const url of urls) {
    if (!cache.has(url)) cache.set(url, await downloadImage(url, slug));
  }
  return md.replace(re, (_, alt, url) => `![${alt}](${cache.get(url)}`);
}

/** 下载单张图片，扩展名取自 Content-Type（原文件名如 Z-3.Z 不可靠） */
async function downloadImage(url, slug) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}: ${url}`);
  const type = res.headers.get('content-type') || '';
  const ext =
    { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }[
      type.split(';')[0].trim()
    ] || 'png';
  const name = `${createHash('sha1').update(url).digest('hex').slice(0, 10)}.${ext}`;
  const rel = `/images/${slug}/${name}`;
  const file = join(ROOT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return rel;
}

/**
 * 改写内链：
 * - /docs/<slug>、/zh/docs/<slug>（含 https://www.geoly.ai 前缀）→ 新文档路径
 * - 目标未发布（如 agent-api 草稿）→ 保留官网绝对地址
 * - 其他站内相对链接（/pricing 等）→ 官网绝对地址
 */
function rewriteLinks(md, locale, published) {
  return md.replace(
    /\]\((?:https:\/\/(?:www\.)?geoly\.ai)?(\/[^)\s]*)/g,
    (match, path) => {
      if (path.startsWith('/images/')) return match;
      const m = path.match(/^(?:\/(zh))?\/docs\/([^/#?]+)(.*)$/);
      if (m) {
        // 中文文档里写的 /docs/<slug> 优先指向中文版本
        const target =
          m[1] || (locale !== 'en' && published.has(`${locale}:${m[2]}`) ? locale : 'en');
        if (SLUG_DIR[m[2]] && published.has(`${target}:${m[2]}`)) {
          return `](/${pagePath(target, m[2])}${m[3]}`;
        }
      }
      return `](${SITE}${path}`;
    }
  );
}

/**
 * MDX 安全转义：只处理代码块/行内代码之外的文本。
 * - `<` 后面不是白名单 HTML 标签时转义（如 <问题>、<brand_id> 占位符）
 * - `{` `}` 转义，避免被当成 JSX 表达式
 * - <br> 补成自闭合
 */
function sanitizeMdx(md) {
  const ALLOWED = /^<\/?(video|img|br|source)\b/i;
  const out = [];
  let fence = null;
  for (const line of md.split('\n')) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      out.push(line);
      continue;
    }
    // 按行内代码切分，奇数段是代码
    const parts = line.split(/(`+[^`]*?`+)/);
    out.push(
      parts
        .map((part, i) => {
          if (i % 2 === 1) return part;
          return part
            .replace(/<br\s*\/?>/gi, '<br />')
            .replace(/[{}]/g, (c) => `\\${c}`)
            .replace(/<(?=[^\s=])/g, (lt, offset, str) =>
              ALLOWED.test(str.slice(offset)) ? lt : '\\<'
            );
        })
        .join('')
    );
  }
  return out.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
