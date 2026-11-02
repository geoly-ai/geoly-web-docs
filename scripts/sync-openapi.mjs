#!/usr/bin/env node
/**
 * 同步 GEOly Data API 的 OpenAPI 规格到本仓库，并生成/更新 API Reference 接口页面。
 *
 * 用法：node scripts/sync-openapi.mjs
 *
 * - 规格来源：App 公开的 https://app.geoly.ai/openapi/data-api-v1.json
 *   （源码 geoly-app/src/lib/data-api/openapi.ts）。Mintlify 不会因远程规格变化自动重新部署，
 *   所以规格以仓库内 api-reference/openapi.json 为准，App 改了 API 后运行本脚本再提 PR。
 * - 接口页面（api-reference/<group>/<slug>.mdx 及 zh/ 版本）只含 frontmatter，
 *   参数 / 请求体 / 响应 / 示例 / Playground 由 Mintlify 从规格自动生成。
 * - 规格新增了 ENDPOINTS 里没有登记的接口时，脚本会报出来，需要在下面补上标题再运行。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_URL = 'https://app.geoly.ai/openapi/data-api-v1.json';
const SPEC_FILE = 'api-reference/openapi.json';

/** 接口分组与页面标题：唯一事实源（顺序即侧栏顺序） */
export const API_GROUPS = [
  {
    dir: 'account',
    name: { en: 'Account', zh: '账号' },
    icon: 'user',
    endpoints: [
      ['GET /api/v1/brand', 'get-brand', 'Get brand', '获取品牌'],
      ['GET /api/v1/quota', 'get-quota', 'Get quota', '查询额度'],
    ],
  },
  {
    dir: 'catalog',
    name: { en: 'Catalog', zh: '目录' },
    icon: 'list',
    endpoints: [
      ['GET /api/v1/topics', 'list-topics', 'List topics', '列出主题'],
      ['GET /api/v1/prompts', 'list-prompts', 'List prompts', '列出提示词'],
      ['GET /api/v1/prompts/{prompt_id}', 'get-prompt', 'Get prompt', '获取提示词'],
      ['POST /api/v1/prompts', 'create-prompt', 'Create prompt', '创建提示词'],
    ],
  },
  {
    dir: 'records',
    name: { en: 'Records', zh: '监测记录' },
    icon: 'database',
    endpoints: [
      ['GET /api/v1/prompts/{prompt_id}/records', 'list-prompt-records', 'List prompt records', '列出提示词的监测记录'],
      ['GET /api/v1/prompts/{prompt_id}/records/latest', 'get-latest-records', 'Get latest records', '获取各平台最新记录'],
      ['GET /api/v1/records/{record_id}', 'get-record', 'Get record', '获取单条监测记录'],
      ['GET /api/v1/records', 'sync-records', 'Sync records', '增量同步记录'],
      ['POST /api/v1/prompts/{prompt_id}/runs', 'trigger-run', 'Trigger run', '触发监测'],
    ],
  },
  {
    dir: 'reports',
    name: { en: 'Reports', zh: '报表' },
    icon: 'chart-column',
    endpoints: [
      ['POST /api/v1/reports/overview', 'overview', 'Overview report', '品牌可见度概览'],
      ['POST /api/v1/reports/analytics', 'analytics', 'Analytics report', '每日可见度指标'],
      ['POST /api/v1/reports/brand-board', 'brand-board', 'Brand board', '品牌榜'],
      ['POST /api/v1/reports/citations', 'citations', 'Citations report', '引用来源榜'],
      ['POST /api/v1/reports/prompts', 'prompts', 'Prompts report', '提示词表现表'],
      ['POST /api/v1/reports/prompt-overview', 'prompt-overview', 'Prompt overview', '单条提示词概览'],
    ],
  },
];

/**
 * 主流程：下载规格 → 校对接口清单 → 生成中英文接口页面 → 输出 docs.json 用的导航片段。
 */
async function main() {
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`OpenAPI spec ${res.status}`);
  const spec = await res.json();
  await writeFile(join(ROOT, SPEC_FILE), `${JSON.stringify(spec, null, 2)}\n`);

  checkCoverage(spec);

  for (const locale of ['en', 'zh']) {
    for (const group of API_GROUPS) {
      for (const [operation, slug, enTitle, zhTitle] of group.endpoints) {
        const title = locale === 'zh' ? zhTitle : enTitle;
        const file = join(ROOT, pagePath(locale, group.dir, slug) + '.mdx');
        await mkdir(dirname(file), { recursive: true });
        await writeFile(
          file,
          `---\ntitle: ${JSON.stringify(title)}\nopenapi: "${SPEC_FILE} ${operation}"\n---\n`
        );
      }
    }
  }

  await writeFile(
    join(ROOT, 'scripts/api-navigation.generated.json'),
    `${JSON.stringify(buildGroups(), null, 2)}\n`
  );
  console.log(`synced ${SPEC_FILE} (${spec.info?.version}) and ${API_GROUPS.flatMap((g) => g.endpoints).length * 2} pages`);
}

/** 页面路径（不含扩展名、无前导斜杠） */
function pagePath(locale, dir, slug) {
  return `${locale === 'en' ? '' : `${locale}/`}api-reference/${dir}/${slug}`;
}

/** 规格里的接口与 API_GROUPS 双向校对，避免新接口漏页或旧接口残留 */
function checkCoverage(spec) {
  const inSpec = new Set();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        inSpec.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  const listed = new Set(API_GROUPS.flatMap((g) => g.endpoints.map((e) => e[0])));
  const missing = [...inSpec].filter((op) => !listed.has(op));
  const stale = [...listed].filter((op) => !inSpec.has(op));
  if (missing.length || stale.length) {
    throw new Error(
      `API_GROUPS out of sync with spec.\n  not listed: ${missing.join(', ') || '-'}\n  not in spec: ${stale.join(', ') || '-'}`
    );
  }
}

/** docs.json 中 API Reference Tab 的接口分组（概览页由 docs.json 手工放在最前） */
function buildGroups() {
  return Object.fromEntries(
    ['en', 'zh'].map((locale) => [
      locale,
      API_GROUPS.map((g) => ({
        group: g.name[locale],
        icon: g.icon,
        pages: g.endpoints.map(([, slug]) => pagePath(locale, g.dir, slug)),
      })),
    ])
  );
}

// 仅在直接运行时执行（被 import 读取 API_GROUPS 时不触发同步）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
