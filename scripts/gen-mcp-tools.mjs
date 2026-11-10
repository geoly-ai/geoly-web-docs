#!/usr/bin/env node
/**
 * Generate the MCP Tools Reference pages from the exported tool surface.
 *
 *   node scripts/gen-mcp-tools.mjs
 *
 * Input:  scripts/mcp-surface.json (exported from geoly-app, see scripts/mcp-surface.probe.test.ts)
 * Output: developers/mcp/tools.mdx and zh/developers/mcp/tools.mdx
 *
 * Every parameter table is rendered from the tool's real input schema and every description from the
 * tool's own description, so the reference never drifts from what clients see in `tools/list`.
 * Do not edit the generated pages by hand — change the tool in geoly-app, re-export, re-run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const surface = JSON.parse(readFileSync(join(ROOT, 'scripts/mcp-surface.json'), 'utf8'));

/** Parameters every brand-scoped tool accepts; documented once at the top of the page. */
const COMMON_PARAMS = new Set(['org_id', 'brand_id', 'context']);

/** Tool groups, in page order. Every exported tool must belong to exactly one group. */
const GROUPS = [
  {
    key: 'discovery',
    en: 'Discovery and context',
    zh: '发现与上下文',
    tools: [
      'list_organizations',
      'list_brands',
      'get_brand_context',
      'resolve_page_context',
      'get_current_date',
      'get_quota',
      'resolve_my_brand_public',
    ],
  },
  {
    key: 'visibility',
    en: 'Visibility and KPIs',
    zh: '可见度与核心指标',
    tools: [
      'get_brand_overview',
      'get_daily_trend',
      'get_brand_board',
      'get_platform_matrix',
      'get_topic_analytics',
    ],
  },
  {
    key: 'prompts',
    en: 'Prompts and AI answers',
    zh: '提示词与 AI 回答',
    tools: [
      'get_topic_list',
      'get_prompt_list',
      'get_prompt_detail',
      'list_prompt_records',
      'list_brand_answers',
      'get_prompt_record_detail',
      'get_prompt_citations',
      'get_brand_search_queries',
    ],
  },
  {
    key: 'citations',
    en: 'Citations and sources',
    zh: '引用与信源',
    tools: ['get_citation_overview', 'get_domain_detail', 'get_url_detail'],
  },
  {
    key: 'competitors',
    en: 'Competitors and perception',
    zh: '竞品与 AI 评价',
    tools: [
      'get_competitor_list',
      'get_competitor_cooccurrence',
      'get_verdict',
      'get_sentiment_dashboard',
    ],
  },
  {
    key: 'shopping',
    en: 'AI shopping',
    zh: 'AI 购物',
    tools: ['get_shopping_performance'],
  },
  {
    key: 'website',
    en: 'Your website: audits, agent readiness, AI traffic',
    zh: '你的网站：诊断、Agent 就绪度、AI 流量',
    tools: ['get_audit_list', 'get_audit_detail', 'get_agent_ready_scans', 'get_traffic_data'],
  },
  {
    key: 'write',
    en: 'Write tools',
    zh: '写入工具',
    tools: [
      'create_brand',
      'create_topic',
      'create_prompt',
      'update_prompt_tags',
      'move_prompts_to_topic',
      'archive_prompt',
      'create_competitor',
      'trigger_prompt',
    ],
  },
  {
    key: 'public-sources',
    en: 'Public source intelligence (free)',
    zh: '公开信源情报（免费）',
    tools: [
      'get_public_sources_overview',
      'get_public_source_domain_detail',
      'get_public_source_brand_conduit',
    ],
  },
  {
    key: 'public',
    en: 'Public industry intelligence (Grow and above)',
    zh: '公开行业情报（Grow 及以上）',
    tools: [
      'search_public_entities',
      'list_public_topics',
      'get_public_coverage',
      'get_public_topic',
      'get_public_topic_prompt_detail',
      'get_public_topic_record_detail',
      'get_public_brand',
      'get_public_category',
      'get_category_whitespace',
      'get_category_brand_momentum',
      'get_public_search_queries',
      'list_public_shopping_products',
      'get_public_shopping_product_detail',
    ],
  },
];

const byName = new Map(surface.tools.map((t) => [t.name, t]));
const grouped = GROUPS.flatMap((g) => g.tools);
const missing = surface.tools.map((t) => t.name).filter((n) => !grouped.includes(n));
const unknown = grouped.filter((n) => !byName.has(n));
if (missing.length || unknown.length) {
  throw new Error(`group mismatch — not grouped: [${missing}] / not exported: [${unknown}]`);
}

const L = {
  en: {
    params: 'Parameters',
    details: 'Details',
    none: 'Only the common parameters.',
    access: 'Access',
    cost: 'Cost',
    timeout: 'Timeout',
    readOnly: 'Read-only',
    write: 'Write — your client asks you to confirm',
    destructive: 'Write, changes or replaces existing data — your client asks you to confirm',
    yes: 'Yes',
    no: 'No',
    head: ['Parameter', 'Type', 'Required', 'Description'],
    oneOf: 'One of',
    def: 'Default',
    items: 'items',
    chars: 'characters',
    availability: 'Availability',
  },
  zh: {
    params: '参数',
    details: '说明',
    none: '只有通用参数。',
    access: '读写',
    cost: '费用',
    timeout: '超时',
    readOnly: '只读',
    write: '写入（客户端会先请你确认）',
    destructive: '写入，会修改或替换已有数据（客户端会先请你确认）',
    yes: '是',
    no: '否',
    head: ['参数', '类型', '必填', '说明'],
    oneOf: '可选值',
    def: '默认',
    items: '项',
    chars: '个字符',
    availability: '可用范围',
  },
};

/** Escape text for MDX outside code spans: braces and angle brackets would start JSX. */
function mdx(text) {
  return text
    .split(/(`[^`]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\\/g, '\\\\').replace(/[{}]/g, (c) => `\\${c}`).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    )
    .join('');
}

/** A table cell: MDX-escaped, pipes escaped, line breaks kept as <br />. */
function cell(text) {
  return mdx(String(text).trim())
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, '<br />');
}

/** JSON-schema type of one property, e.g. `string`, `string[]`, `integer`. */
function typeOf(schema) {
  if (!schema) return 'any';
  if (schema.anyOf || schema.oneOf) {
    const types = [...new Set((schema.anyOf ?? schema.oneOf).map(typeOf))];
    return types.join(' \\| ');
  }
  if (schema.type === 'array') return `${typeOf(schema.items)}[]`;
  if (Array.isArray(schema.type)) return schema.type.join(' \\| ');
  return schema.type ?? (schema.enum ? 'string' : 'object');
}

/** Constraint notes appended to a parameter description (enum, default, ranges). */
function constraints(schema, l) {
  const notes = [];
  const enumValues = schema.enum ?? schema.items?.enum;
  if (enumValues) notes.push(`${l.oneOf}: ${enumValues.map((v) => `\`${v}\``).join(', ')}.`);
  if (schema.default !== undefined) notes.push(`${l.def}: \`${JSON.stringify(schema.default)}\`.`);
  const range = (min, max, unit) => {
    if (min === undefined && max === undefined) return null;
    if (min !== undefined && max !== undefined) return `${min}–${max}${unit}`;
    return min !== undefined ? `≥ ${min}${unit}` : `≤ ${max}${unit}`;
  };
  const num = range(schema.minimum, schema.maximum, '');
  if (num) notes.push(`${num}.`);
  const len = range(schema.minLength, schema.maxLength, ` ${l.chars}`);
  if (len) notes.push(`${len}.`);
  const count = range(schema.minItems, schema.maxItems, ` ${l.items}`);
  if (count) notes.push(`${count}.`);
  return notes;
}

/** Parameter table (common parameters left out). */
function paramTable(tool, l) {
  const props = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const rows = Object.entries(props).filter(([name]) => !COMMON_PARAMS.has(name));
  if (rows.length === 0) return l.none;
  const lines = [
    `| ${l.head.join(' | ')} |`,
    '| - | - | - | - |',
    ...rows.map(([name, schema]) => {
      // Notes are added after escaping so their code spans stay intact
      let base = cell(schema.description ?? '');
      if (base && !/[.!?。)）`]$/.test(base)) base += '.';
      const desc = [base, ...constraints(schema, l).map(cell)].filter(Boolean).join(' ');
      return `| \`${name}\` | ${typeOf(schema)} | ${required.has(name) ? l.yes : l.no} | ${desc} |`;
    }),
  ];
  return lines.join('\n');
}

/** Split a tool description into summary, detail body and cost line. */
function splitDescription(description) {
  const lines = description.split('\n');
  const costIndex = lines.findIndex((line) => line.startsWith('Cost:'));
  const cost = costIndex >= 0 ? lines.splice(costIndex).join(' ').replace(/^Cost:\s*/, '') : null;
  const [summary, ...rest] = lines;
  return { summary: summary.trim(), body: rest.join('\n').trim(), cost };
}

/** Render the detail body: keep "- " bullets as a list, other lines as paragraphs. */
function body(text) {
  const out = [];
  let inList = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-•]\s+/.test(line);
    if (bullet !== inList && out.length) out.push('');
    out.push(bullet ? `- ${mdx(line.replace(/^[-•]\s+/, ''))}` : mdx(line));
    if (!bullet) out.push('');
    inList = bullet;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function accessOf(tool, l) {
  const a = tool.annotations ?? {};
  if (a.readOnlyHint !== false) return l.readOnly;
  return a.destructiveHint ? l.destructive : l.write;
}

/** Where a tool shows up, from the three exported connection shapes. */
function availabilityOf(name, lang) {
  const { singleOrgSingleBrandRead: single, multiOrgRead: multiOrg } = surface.availability;
  const zh = lang === 'zh';
  if (name === 'list_organizations') return zh ? '仅限覆盖多个组织的连接。' : 'Only on connections that span several organizations.';
  if (name === 'list_brands') return zh ? '组织里有多个项目（list_brands 列出的是项目）、或连接覆盖多个组织时出现。' : 'When the organization has several projects (list_brands lists projects), or the connection spans several organizations.';
  if (!multiOrg.includes(name)) {
    return zh
      ? '需要在授权时给对应资源写入权限，且连接只选一个组织（选「全部组织」时不提供写入）。'
      : 'Needs a write grant for its resource on a connection scoped to one organization (connections to all organizations are read-only).';
  }
  if (!single.includes(name)) return null;
  return null;
}

function toolSection(tool, lang) {
  const l = L[lang];
  const { summary, body: detail, cost } = splitDescription(tool.description);
  const timeoutMs = tool._meta?.['geoly/timeoutMs'];
  const meta = [`**${l.access}:** ${accessOf(tool, l)}`];
  if (cost) meta.push(`**${l.cost}:** ${mdx(cost)}`);
  if (timeoutMs) meta.push(`**${l.timeout}:** ${Math.round(timeoutMs / 1000)}s`);
  const availability = availabilityOf(tool.name, lang);
  const parts = [
    `## ${tool.name}`,
    '',
    `**${mdx(tool.title ?? tool.name)}.** ${mdx(summary)}`,
    '',
    meta.join(' · '),
  ];
  if (availability) parts.push('', `**${l.availability}:** ${availability}`);
  parts.push('', `### ${l.params}`, '', paramTable(tool, l));
  if (detail) parts.push('', `### ${l.details}`, '', body(detail));
  parts.push('', '***', '');
  return parts.join('\n');
}

const counts = {
  total: surface.tools.length,
  write: surface.tools.filter((t) => t.annotations?.readOnlyHint === false).length,
  largest: surface.availability.singleOrgMultiBrandWrite.length,
  multiOrg: surface.availability.multiOrgRead.length,
};
counts.read = counts.total - counts.write;

const INTRO = {
  en: `---
title: "Tools reference"
description: "Every tool the GEOly MCP server exposes, with parameters, cost, and what each one returns."
---

{/* Generated by scripts/gen-mcp-tools.mjs from scripts/mcp-surface.json (exported ${surface.exportedAt}). Do not edit by hand. */}

The GEOly MCP server exposes ${counts.total} tools: **${counts.read} read tools** and **${counts.write} write tools**. One connection sees at most ${counts.largest} of them (a read-only connection to all your organizations sees ${counts.multiOrg}).

Your AI assistant picks the tools itself from your question, so you never have to call them by name. This page shows what is available and what each tool returns.

${GROUPS.map((g) => `- **${g.en}**: ${g.tools.map((n) => `\`${n}\``).join(', ')}`).join('\n')}

## Which tools you see

The server only lists tools your connection can use. A missing tool means it is outside your connection's scope, not that the connection failed.

| What decides it | Effect |
| - | - |
| Organization scope | Connecting to all organizations adds \`list_organizations\` and turns off every write tool. |
| Projects | \`list_brands\` (it lists projects) appears when there is more than one project to choose from. |
| Read grants | Each resource you leave unchecked during sign-in (brands, prompts, competitors, citations, analytics, audits, sources, public data) hides the tools that read it. |
| Write grants | Write tools appear only for resources you grant write access to. |
| Plan | Public industry intelligence needs Grow or above. The three public source tools are free for every plan. |

## Common parameters

A project is GEOly's monitoring unit: it tracks one own brand plus its competitors. For historical reasons a project's id is passed as \`brand_id\`, and tools such as \`list_brands\` list projects. Own-monitoring \`brand_id\` is never a \`public_brand.id\`.

Project-scoped tools accept these parameters. They are left out of the tables below.

| Parameter | Type | Required | Description |
| - | - | - | - |
| \`brand_id\` | string | No | The project to query, by its id. Omit it to use the project bound to your connection, or the only project of your organization. Get ids from \`list_brands\`, which lists projects. |
| \`org_id\` | string | No | The organization to query. Needed only when your connection spans several organizations; get ids from \`list_organizations\`. |
| \`context\` | string | No | One sentence on what you are trying to find out. It is recorded with the call and never changes the result. |

## Response format

Every tool returns one JSON object as text. A few conventions apply across tools:

- **Windows are echoed.** Tools that take a time range return the exact window they read (\`window\`, with business days in UTC+8). Quote that window, not the one you asked for.
- **Not ready is not zero.** \`status: "not-ready"\`, \`kpiState: "computing"\` or a \`null\` rate means there is nothing to measure yet. It never means 0%.
- **Long results are cut, and say so.** When a page does not fit, the response carries \`_truncated: true\` with \`_totalCount\`, \`_shownCount\` and a \`_message\` on how to get the rest.
- **Errors explain the next step.** An invalid value returns an error that lists the valid ones (for example the project's countries or topic ids). Errors and timeouts are not charged.
- **Credits.** A metered call returns a \`_quota\` receipt with the cost and your remaining balance. MCP clients can also read it from \`_meta["geoly/quota"]\`, and the outcome from \`_meta["geoly/outcome"]\`.

## Cost

The cost line under each tool is the price of one call. "Per call" prices don't depend on page size, so request the largest page you need. "Per row" prices charge the rows returned. Some tools cost double for windows over 90 days. Check your balance with \`get_quota\` (free). [Plans and MCP Credits](/developers/mcp/introduction#plans-and-mcp-credits) explains the monthly allowance.

`,
  zh: `---
title: "工具参考"
description: "GEOly MCP 服务器提供的全部工具：参数、费用，以及每个工具返回什么。"
---

{/* 由 scripts/gen-mcp-tools.mjs 根据 scripts/mcp-surface.json（导出于 ${surface.exportedAt}）生成，不要手改。 */}

GEOly MCP 服务器共提供 ${counts.total} 个工具：**${counts.read} 个读取工具**、**${counts.write} 个写入工具**。单个连接最多能看到其中 ${counts.largest} 个（只读并覆盖全部组织的连接能看到 ${counts.multiOrg} 个）。

AI 助手会根据你的问题自己挑工具，你不需要点名调用。这一页列出有哪些工具、每个工具返回什么。工具名、参数名和字段名保持英文，与客户端里看到的一致；参数说明直接取自工具本身。

${GROUPS.map((g) => `- **${g.zh}**：${g.tools.map((n) => `\`${n}\``).join('、')}`).join('\n')}

## 你能看到哪些工具

服务器只列出当前连接能用的工具。少了某个工具，说明它不在这次连接的范围内，不代表连接失败。

| 取决于 | 影响 |
| - | - |
| 组织范围 | 连接「全部组织」时多出 \`list_organizations\`，并关闭所有写入工具。 |
| 项目数 | 有多个项目可选时才出现 \`list_brands\`（它列出的是项目）。 |
| 读取授权 | 登录授权时没勾选的资源（品牌、提示词、竞品、引用、分析、诊断、信源、公开数据），读取它的工具就不出现。 |
| 写入授权 | 只有授予了写入权限的资源，才会出现对应的写入工具。 |
| 套餐 | 公开行业情报需要 Grow 及以上。三个公开信源工具所有套餐都免费。 |

## 通用参数

项目（Project）是 GEOly 的监测单元：一个项目监测一个自有品牌及其竞品。由于历史原因，项目 id 通过 \`brand_id\` 参数传递，\`list_brands\` 等工具列出的是项目。自有监测用的 \`brand_id\` 永远不是 \`public_brand.id\`。

项目维度的工具都接受下面三个参数，下文各工具的参数表不再重复。

| 参数 | 类型 | 必填 | 说明 |
| - | - | - | - |
| \`brand_id\` | string | 否 | 要查询的项目，传项目 id。不填时用连接绑定的项目，或组织里唯一的项目。项目 id 用 \`list_brands\` 获取（它列出的是项目）。 |
| \`org_id\` | string | 否 | 要查询的组织。只在连接覆盖多个组织时需要，组织 id 用 \`list_organizations\` 获取。 |
| \`context\` | string | 否 | 用一句话说明你想弄清楚什么。只随调用记录下来，不影响结果。 |

## 返回格式

每个工具都以文本形式返回一个 JSON 对象，以下约定对所有工具通用：

- **回显窗口**：带时间范围的工具会返回实际读取的窗口（\`window\`，业务日按 UTC+8）。引用数字时以它为准。
- **没准备好不等于 0**：\`status: "not-ready"\`、\`kpiState: "computing"\` 或某个比率为 \`null\`，都表示暂时没有可算的数据，绝不是 0%。
- **结果太长会截断并注明**：一页放不下时返回 \`_truncated: true\`，附 \`_totalCount\`、\`_shownCount\` 和告诉你怎么取剩余部分的 \`_message\`。
- **报错会说明下一步**：传了非法值时，报错里会列出合法值（比如项目已有的国家或 topic id）。报错和超时都不扣费。
- **额度**：计费调用会返回 \`_quota\` 回执，含本次费用和剩余额度。MCP 客户端也可以从 \`_meta["geoly/quota"]\` 读到它，从 \`_meta["geoly/outcome"]\` 读到调用结果。

## 费用

每个工具下的「费用」是单次调用的价格。按次计费的工具不受每页条数影响，需要多少就一次取够；按行计费的工具按返回的行数收费；部分工具在窗口超过 90 天时价格翻倍。剩余额度用 \`get_quota\`（免费）查询，每月额度见 [MCP 介绍](/zh/developers/mcp/introduction) 里的「套餐与 MCP 额度」。

`,
};

for (const lang of ['en', 'zh']) {
  const sections = GROUPS.map((g) => {
    const heading = `# ${lang === 'zh' ? g.zh : g.en}`;
    return [heading, '', ...g.tools.map((n) => toolSection(byName.get(n), lang))].join('\n');
  });
  const file = lang === 'zh' ? 'zh/developers/mcp/tools.mdx' : 'developers/mcp/tools.mdx';
  writeFileSync(join(ROOT, file), `${INTRO[lang]}${sections.join('\n')}`.replace(/\n{3,}/g, '\n\n'));
  console.log(`wrote ${file}`);
}
