// Factory for the one shared McpServer hosting every in-house tool (shell, agy, kiro, search,
// filesystem, test) — replaces local-tools-mcp.js's role as a separately spawned stdio child now that
// mcp-hub is gone (docs/plan/2.0.0-improve.md #7, Stage 2 phase 2). Each domain's logic stays in
// its own register(server) module behind a stable contract, unchanged from Stage 1.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { register as registerShell } from './shell-mcp.js';
import { register as registerAgy } from './agy-mcp.js';
import { register as registerKiro } from './kiro-mcp.js';
import { register as registerSearch } from './search-mcp.js';
import { register as registerFilesystem } from './filesystem-mcp.js';
import { register as registerFilesystemBatch } from './filesystem-batch-mcp.js';
import { register as registerProjectMap } from './project-map.js';
import { register as registerTest } from './test-mcp.js';
import { readSettings } from './allowlist.js';
import { withSqueeze } from './squeeze.js';

// Sent once in the MCP initialize response and shown to the model before it picks a tool. This is the
// cheapest lever there is: it is paid for one time per session, whereas a bad tool-choice habit is paid
// for on every single turn. The first ~500 characters must stand alone — some clients truncate.
const INSTRUCTIONS = [
  'Tools for one developer machine: filesystem, code search, allowlisted shell, tests.',
  'Orient with local__project_map first, then local__search_content or local__find_path.',
  'Never browse directory by directory.',
  'Read large files with local__read_lines (offset/limit), not local__read_text_file.',
  'Put every change to one file into a single local__edit_file call, and any change spanning several',
  'files into a single local__edit_files call — never one call per file.',
  'Tool output is capped; an "omitted by the output budget" marker means re-run narrower, not re-read the whole file.',
  '\n\nThese tools act on real files on a real machine. Prefer reading before writing, prefer edits over',
  'whole-file rewrites, and state which absolute path you are touching. run_cmd is restricted to a',
  'read-only allowlist and cannot chain or redirect; run_test only runs suites pre-configured by the owner.',
].join(' ');

// setting.json -> { "tools": { "disabled": ["agy_run", "kiro_read"] } }
// Every tool a client can see is tool-definition text in the model's context on every request, and past
// roughly a few dozen tools selection accuracy drops as well. Turning a tool off is therefore a real
// saving, but which tools are dead weight is owner-specific — so this is opt-in configuration rather
// than tools deleted from the tree. Accepts bare or prefixed names.
function disabledTools() {
  const configured = readSettings().tools?.disabled;
  return new Set(Array.isArray(configured) ? configured.filter((n) => typeof n === 'string') : []);
}

// mcp-hub used to prefix every tool from this server's config entry (key "local") with
// `local__` when aggregating backends. Now that the bridge talks to this server directly, that
// prefixing layer is gone — reproduce it here as the one place doing it, so served tool names
// (local__run_cmd, local__find_path, …) stay exactly what README.md and CLAUDE.md already tell
// every connected AI to call.
//
// The same interception point now also (a) drops disabled tools and (b) wraps each handler in the
// output budget. Doing both here keeps every register() module free of cross-cutting concerns.
function prefixedServer(server, prefix, disabled) {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== 'registerTool') return Reflect.get(target, prop, receiver);
      return (name, config, handler, ...rest) => {
        const full = `${prefix}${name}`;
        // Returning undefined is safe: no register() module uses registerTool's return value.
        if (disabled.has(name) || disabled.has(full)) return undefined;
        const wrapped = typeof handler === 'function' ? withSqueeze(handler) : handler;
        return target.registerTool(full, config, wrapped, ...rest);
      };
    },
  });
}

export function createToolsServer() {
  const server = new McpServer(
    { name: 'local', version: '1.0.0', title: 'Local Tools' },
    { instructions: INSTRUCTIONS },
  );
  const prefixed = prefixedServer(server, 'local__', disabledTools());
  for (const register of [
    registerProjectMap, // first so it is the first tool the model sees in the list
    registerShell,
    registerAgy,
    registerKiro,
    registerSearch,
    registerFilesystem,
    registerFilesystemBatch,
    registerTest,
  ]) {
    register(prefixed);
  }
  return server;
}
