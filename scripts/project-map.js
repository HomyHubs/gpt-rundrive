// One call that replaces the list-a-directory → list-the-next-directory → read-package.json chain a
// chat otherwise walks through every time it opens an unfamiliar repo. Each of those round trips is a
// separate tool call billed against the ChatGPT agentic quota, so collapsing ~6 calls into 1 is the
// single biggest win available on the client side.
//
// Deliberately NOT a search tool: search-mcp.js already owns find_path/search_content. This answers
// "what is this project and where do things live", then hands off to those.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getRoots, resolveOrFail } from './roots.js';
import { ok, fail } from './mcp-tool.js';

// Same skip set as search-mcp.js: generated/vendored trees carry no information about the project
// and would blow the entry budget on their own.
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', '.next', '.nuxt', '.output', '.cache',
  'vendor', '.venv', 'venv', '__pycache__', 'target', 'Pods', 'DerivedData',
  '.Spotlight-V100', '.Trashes', '.fseventsd', '.TemporaryItems',
]);

const MAX_DEPTH = 6;
const DEFAULT_LIMIT = 250;

const human = (bytes) => (bytes >= 1024 ? `${Math.round(bytes / 1024)}k` : `${bytes}b`);

// Recursive rather than an explicit stack: an indented tree only reads correctly if children are
// emitted immediately after their parent, which a LIFO stack does not give you.
// `total` keeps counting past the print limit so the footer can state what was withheld.
function walk(dir, depth, limit, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable dir is a fact about the tree, not a reason to fail the whole map
  }
  entries.sort((a, b) => {
    const ad = a.isDirectory();
    const bd = b.isDirectory();
    return ad === bd ? a.name.localeCompare(b.name) : ad ? -1 : 1;
  });
  for (const entry of entries) {
    const isDir = entry.isDirectory();
    if (isDir && SKIP_DIRS.has(entry.name)) continue;
    out.total += 1;
    const full = path.join(dir, entry.name);
    if (out.rows.length < limit) {
      let size = '';
      if (!isDir) {
        try {
          size = `  ${human(statSync(full).size)}`;
        } catch {
          size = '';
        }
      }
      out.rows.push(`${'  '.repeat(depth)}${entry.name}${isDir ? '/' : size}`);
    }
    if (isDir && depth + 1 <= MAX_DEPTH) walk(full, depth + 1, limit, out);
  }
}

// package.json is the cheapest high-signal summary of a JS project: what it is, how to run it, what
// it depends on. Absent or malformed is normal (non-JS projects) and must stay silent.
function summarize(base) {
  const lines = [];
  try {
    const pkg = JSON.parse(readFileSync(path.join(base, 'package.json'), 'utf-8'));
    lines.push(`package: ${pkg.name ?? '(unnamed)'}@${pkg.version ?? '?'}${pkg.type ? ` [${pkg.type}]` : ''}`);
    if (pkg.engines?.node) lines.push(`node: ${pkg.engines.node}`);
    const scripts = Object.keys(pkg.scripts ?? {});
    if (scripts.length) lines.push(`npm scripts: ${scripts.join(', ')}`);
    const deps = Object.keys(pkg.dependencies ?? {});
    if (deps.length) lines.push(`dependencies: ${deps.join(', ')}`);
  } catch {
    // not a Node project, or package.json is not readable/valid — the tree alone is still useful
  }
  return lines;
}

export function register(server) {
  const roots = getRoots();
  server.registerTool(
    'project_map',
    {
      title: 'Project Map',
      description:
        `Orient yourself in a project in ONE call instead of several directory listings. Returns the ` +
        `file tree (depth <= ${MAX_DEPTH}, with node_modules/.git/dist/build and other generated dirs skipped) ` +
        `plus package.json name, node engine, npm scripts and dependencies. Call this FIRST when you open ` +
        `an unfamiliar repo, then jump straight to search_content or find_path for the specific file — ` +
        `do not browse directory by directory. Pass path as an absolute path under one of ` +
        `${roots.join(', ')}, or relative to ${roots[0]}.`,
      inputSchema: {
        path: z.string().optional().describe('project directory; defaults to the first allowed root'),
        limit: z.number().optional().describe(`max entries to print (default ${DEFAULT_LIMIT})`),
      },
    },
    ({ path: target, limit }) => {
      const resolved = resolveOrFail(target);
      if (!resolved.ok) return fail(resolved.error);
      const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;
      const out = { rows: [], total: 0 };
      walk(resolved.dir, 0, cap, out);
      const shown = out.rows.length;
      const footer =
        shown < out.total
          ? [`\n… ${out.total - shown} more entries not shown — use find_path for a targeted lookup, or raise limit`]
          : [];
      return ok(
        [
          `root: ${resolved.dir}`,
          ...summarize(resolved.dir),
          '',
          `tree (${shown} of ${out.total} entries, depth <= ${MAX_DEPTH}):`,
          ...out.rows,
          ...footer,
        ].join('\n'),
      );
    },
  );
}
