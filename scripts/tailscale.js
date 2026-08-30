// Funnel state, read one way for everyone. `AllowFunnel` is keyed by the public port (443), never by the local
// port being proxied, so matching the gatekeeper port against that key silently never matches — the proxy
// target under `Web` is the only place the local port appears.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function executableCandidates() {
  const candidates = [];
  const add = (value) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  add(process.env.TAILSCALE_BIN?.trim());
  add(process.platform === 'win32' ? 'tailscale.exe' : 'tailscale');

  if (process.platform === 'win32') {
    for (const root of [
      process.env.ProgramW6432,
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA,
    ]) {
      if (root) add(path.join(root, 'Tailscale', 'tailscale.exe'));
    }
  }

  return candidates;
}

const execute = (command, args) =>
  new Promise((resolve) =>
    execFile(command, args, { timeout: 8000, windowsHide: true }, (err, stdout = '', stderr = '') => {
      const missing = err?.code === 'ENOENT';
      const out = (err ? stderr || stdout || err.message : stdout || stderr).trim();
      resolve({ ok: !err, missing, out, stdout, command });
    }),
  );

async function run(args) {
  let lastMissing = null;
  for (const command of executableCandidates()) {
    if (path.isAbsolute(command) && !existsSync(command)) continue;
    const result = await execute(command, args);
    if (!result.missing) return result;
    lastMissing = result;
  }
  return {
    ok: false,
    missing: true,
    out: lastMissing?.out || 'tailscale executable was not found',
    stdout: '',
    command: null,
  };
}

function jsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const shortError = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240) || null;

export async function funnelStatus(gatePort) {
  const statusResult = await run(['status', '--json']);
  if (statusResult.missing) {
    return { installed: false, running: false, host: null, funnel: false, command: null, error: statusResult.out };
  }

  // A non-zero status can mean the Windows service is stopped or the user is not signed in.
  // The executable still exists, so do not misreport that state as "Tailscale is not installed".
  const status = jsonOrNull(statusResult.stdout);
  if (!status) {
    return {
      installed: true,
      running: false,
      host: null,
      funnel: false,
      command: statusResult.command,
      error: shortError(statusResult.out),
    };
  }

  const host = (status.Self?.DNSName || '').replace(/\.$/, '') || null;
  const running = status.BackendState === 'Running';
  const funnelResult = await run(['funnel', 'status', '--json']);
  const funnel = jsonOrNull(funnelResult.stdout);
  const served = Object.entries(funnel?.Web ?? {}).some(
    ([target, cfg]) =>
      funnel.AllowFunnel?.[target] &&
      Object.values(cfg.Handlers ?? {}).some((h) => h.Proxy?.endsWith(`:${gatePort}`)),
  );
  return {
    installed: true,
    running,
    host,
    funnel: served,
    command: statusResult.command,
    error: running && !funnelResult.ok ? shortError(funnelResult.out) : null,
  };
}

export const enableFunnel = (gatePort) => run(['funnel', '--bg', String(gatePort)]);

export const bringUp = () => run(['up']);
