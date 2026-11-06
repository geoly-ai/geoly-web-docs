/**
 * Export the live GEOly MCP tool surface to `scripts/mcp-surface.json` (input of `gen-mcp-tools.mjs`).
 *
 * Runs inside the geoly-app repository — it lists tools through the real MCP server over an in-memory
 * transport, so no database or network is touched:
 *
 *   1. copy this file to geoly-app `src/__tests__/_probe/mcp-surface.probe.test.ts`
 *      (check out the branch that is deployed — today `pre-release`);
 *   2. SURFACE_OUT=<path to this repo>/scripts/mcp-surface.json \
 *        npx vitest run src/__tests__/_probe/mcp-surface.probe.test.ts
 *   3. delete the copied file, then run `node scripts/gen-mcp-tools.mjs` here.
 *
 * Three connection shapes are listed: single organization + several brands with every write grant
 * (the largest surface), all organizations read-only (adds `list_organizations`), and single brand read-only.
 */
import { writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const BASE = {
  orgId: 'org_1',
  brandId: 'brand_1',
  tokenId: 'tok_1',
  requestId: 'req_1',
  userId: 'user_1',
  accessibleOrgIds: ['org_1'],
  authTrack: 'oauth',
};
const ALL_WRITE = Object.fromEntries(
  [
    'brand',
    'topic',
    'prompt',
    'competitor',
    'citation',
    'sentiment',
    'platform',
    'audit',
    'analytics',
    'source',
    'monitoring_trigger',
    'public',
  ].map((k) => [k, { read: true, write: true }])
);

/** tools/list + prompts/list for one connection shape */
async function list(context: Record<string, unknown>, permissions?: Record<string, unknown>) {
  const { createMcpServer } = await import('@/mcp/server');
  const server = createMcpServer(context as never, {
    publicToolsEnabled: true,
    ...(permissions ? { permissions: permissions as never } : {}),
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mcp-surface-export', version: '0.0.0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  try {
    const { tools } = await client.listTools();
    const { prompts } = await client.listPrompts();
    return { tools, prompts };
  } finally {
    await client.close();
  }
}

it('exports the MCP surface', async () => {
  const largest = await list({ ...BASE, mode: 'multi-brand' }, ALL_WRITE);
  const multiOrg = await list({ ...BASE, mode: 'multi-org', accessibleOrgIds: ['org_1', 'org_2'] });
  const single = await list({ ...BASE, mode: 'single' });
  const extra = multiOrg.tools.filter((t) => !largest.tools.some((x) => x.name === t.name));
  writeFileSync(
    process.env.SURFACE_OUT!,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString().slice(0, 10),
        tools: [...largest.tools, ...extra],
        prompts: largest.prompts,
        availability: {
          singleOrgSingleBrandRead: single.tools.map((t) => t.name),
          multiOrgRead: multiOrg.tools.map((t) => t.name),
          singleOrgMultiBrandWrite: largest.tools.map((t) => t.name),
        },
      },
      null,
      1
    )
  );
}, 120_000);
