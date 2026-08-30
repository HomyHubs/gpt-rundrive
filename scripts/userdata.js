// Everything this server writes for a user — config and secrets alike — lives in one directory outside the repo, the same way a CLI keeps its settings under the home directory. A clone stays exactly as it was checked out.
// The setup runs at import, not on a call: oauth.js reads its files while loading, so ordering has to come from the dependency graph rather than from someone remembering to call a function first.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_HOME = path.join(os.homedir(), '.andymcp');
export const LEGACY_APP_HOME = path.join(os.homedir(), '.aki');
export const USER_DIR = path.join(APP_HOME, 'mcpsv');
export const RULES_DIR = path.join(APP_HOME, 'rules');
export const RULES_CLONE_DIR = path.join(APP_HOME, 'rules-src');

export const SETTINGS_PATH = path.join(USER_DIR, 'setting.json');
export const CLIENT_PATH = path.join(USER_DIR, 'oauth-client.json');
export const DCR_CLIENTS_PATH = path.join(USER_DIR, 'oauth-dcr-clients.json');
export const PASSPHRASE_PATH = path.join(USER_DIR, 'passphrase.txt');
export const TOKENS_PATH = path.join(USER_DIR, 'tokens.json');
export const INGRESS_CONFIG_PATH = path.join(USER_DIR, 'ingress.json');
export const CLOUDFLARED_CRED_PATH = path.join(USER_DIR, 'cloudflared-cred.json');

mkdirSync(APP_HOME, { recursive: true, mode: 0o700 });

// Preserve existing installations without deleting or overwriting their legacy data. Each known
// directory is copied once; OAuth credentials, tokens, passphrase, ingress and settings therefore
// keep working after the namespace changes from ~/.aki to ~/.andymcp.
const legacyDirs = [
  [path.join(LEGACY_APP_HOME, 'mcpsv'), USER_DIR],
  [path.join(LEGACY_APP_HOME, 'akidevrule'), RULES_DIR],
  [path.join(LEGACY_APP_HOME, 'akidevrule-src'), RULES_CLONE_DIR],
];
for (const [source, destination] of legacyDirs) {
  if (!existsSync(destination) && existsSync(source)) {
    cpSync(source, destination, { recursive: true });
    console.log(`[userdata] copied legacy data: ${source} → ${destination}`);
  }
}
mkdirSync(USER_DIR, { recursive: true, mode: 0o700 });

const absoluteMigrationPairs = legacyDirs.map(([source, destination]) => [source, destination])
  .concat([[LEGACY_APP_HOME, APP_HOME]]);

function pathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function remapLegacyPath(value) {
  if (typeof value !== 'string') return value;

  const normalized = value.replaceAll('\\', '/');
  const tildePairs = [
    ['~/.aki/akidevrule-src', '~/.andymcp/rules-src'],
    ['~/.aki/akidevrule', '~/.andymcp/rules'],
    ['~/.aki/mcpsv', '~/.andymcp/mcpsv'],
    ['~/.aki', '~/.andymcp'],
  ];
  for (const [source, destination] of tildePairs) {
    if (normalized.toLowerCase() === source || normalized.toLowerCase().startsWith(`${source}/`)) {
      return destination + normalized.slice(source.length);
    }
  }

  if (!path.isAbsolute(value)) return value;
  const candidate = path.resolve(value);
  for (const [source, destination] of absoluteMigrationPairs) {
    if (pathInside(candidate, source)) return path.join(destination, path.relative(source, candidate));
  }
  return value;
}

// A copied setting.json can contain absolute Windows paths or tilde paths into ~/.aki. Rewrite only
// the two path-bearing fields; all unrelated user settings and command permissions stay untouched.
function migrateStoredPaths() {
  if (!existsSync(SETTINGS_PATH)) return;
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
    const before = JSON.stringify(settings);
    if (Array.isArray(settings.folders)) settings.folders = settings.folders.map(remapLegacyPath);
    if (Array.isArray(settings.shell?.allowlistDirs)) {
      settings.shell.allowlistDirs = settings.shell.allowlistDirs.map(remapLegacyPath);
    }
    if (JSON.stringify(settings) === before) return;
    const tmp = `${SETTINGS_PATH}.migrate-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, SETTINGS_PATH);
    console.log(`[userdata] updated stored paths for ${APP_HOME}`);
  } catch (error) {
    console.error(`[userdata] could not migrate paths in ${SETTINGS_PATH}: ${error.message}`);
  }
}
migrateStoredPaths();

// Single reader for the panel-picked ingress (panel.js writes it, start.js reads it as the default when no --tunnel flag/PUBLIC_ORIGIN is set) — one shape, read the same way by both.
export function readIngressConfig() {
  if (!existsSync(INGRESS_CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(INGRESS_CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}
