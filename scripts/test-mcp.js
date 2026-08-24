// Dedicated MCP tool for running a project's pre-configured test suite. Modeled on agy-mcp.js /
// kiro-mcp.js: the command is passed to execFile as separate args (no shell tokenizing), the working
// directory is validated against the allowed roots, and nothing runs unless it was explicitly
// configured in setting.json under test.commands. This is deliberately NOT the generic run_cmd shell
// tool — shell-mcp.js caps npm to list/ls/outdated and kills any command after 10s with a 1MB output
// buffer, useless for a real test run. Here the timeout is 5 min and the buffer 8MB.
//
// Purpose: lets a web AI (ChatGPT/Claude/…) drive a run-tests → read-failure → edit_file → re-run loop
// against a local repo entirely from the chat, without ever widening the shell allowlist.
import { execFile } from 'node:child_process';
import { z } from 'zod';
import { readSettings } from './allowlist.js';
import { resolveOrFail } from './roots.js';
import { ok, err, fail } from './mcp-tool.js';

const DEFAULT_TIMEOUT_MS = 300_000; // 5 min — real suites need far more than shell-mcp's 10s cap
const MAX_BUFFER = 8 * 1024 * 1024; // 8MB — test output is verbose; 1MB truncates it

// setting.json -> { "test": { "commands": { "<name>": ["bin", "arg", ...] } } }. An owner-configured
// map is the only source of runnable commands, so a prompt can never invent an arbitrary command line.
function loadCommands() {
  const c = readSettings().test?.commands;
  return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
}

function run(bin, args, cwd, timeout) {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, timeout, maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout, stderr) => {
      const out = [stdout, stderr].filter(Boolean).join('\n').trim() || '(no output)';
      if (error) {
        const why = error.killed ? `timed out after ${timeout}ms` : `exit code ${error.code ?? 'n/a'}`;
        return resolve(err(`FAIL (${why})\n\n${out}`));
      }
      resolve(ok(`PASS\n\n${out}`));
    });
  });
}

export function register(server) {
  server.registerTool(
    'run_test',
    {
      title: 'Run Test Suite',
      description:
        "Run a project's pre-configured test command and return PASS/FAIL plus the full output. " +
        'The command name maps to setting.json -> test.commands; nothing runs unless it was configured there ' +
        '(e.g. {"test":{"commands":{"myproj":["npm","test"]}}}). Use this in a run -> read failure -> edit_file -> ' +
        're-run loop to fix failing tests. Longer timeout (5 min) and a bigger output buffer than run_cmd.',
      inputSchema: {
        name: z.string().describe('key under setting.json test.commands'),
        cwd: z.string().describe('project directory; must be under an allowed root'),
        timeoutMs: z.number().optional().describe(`override the default ${DEFAULT_TIMEOUT_MS}ms timeout`),
      },
    },
    async ({ name, cwd, timeoutMs }) => {
      const commands = loadCommands();
      const entry = commands[name];
      if (!Array.isArray(entry) || !entry.length) {
        const have = Object.keys(commands).join(', ') || 'none configured';
        return err(`rejected: test command "${name}" is not configured in setting.json test.commands (available: ${have})`);
      }
      const r = resolveOrFail(cwd);
      if (!r.ok) return fail(r.error);
      const [bin, ...args] = entry;
      return run(bin, args, r.dir, timeoutMs ?? DEFAULT_TIMEOUT_MS);
    },
  );
}
