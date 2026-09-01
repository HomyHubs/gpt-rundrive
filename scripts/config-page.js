// Renders the control panel page. Served only by panel.js on loopback; credentials never travel over the Funnel.
import os from 'node:os';
import path from 'node:path';
import { esc } from './html.js';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const ANDY_DIR = path.join(os.homedir(), '.andymcp');
const PANEL_TITLE = 'Andy MCP Server';
const MCP_NAME = 'Andy MCP Server Access Files on Local Disk';
const SETTINGS_URL = 'https://claude.ai/new#settings/general';
const GROK_SETTINGS_URL = 'https://grok.com/?_s=personality';
const CHATGPT_SETTINGS_URL = 'https://chatgpt.com/#settings/Personalization';
const GEMINI_SETTINGS_URL = 'https://gemini.google.com/saved-info';
const CONNECTOR_URL = 'https://claude.ai/new?modal=add-custom-connector#settings/customize-connectors';
const CHATGPT_DEVMODE_URL = 'https://chatgpt.com/plugins#settings/Security?section=developer-mode';
const CHATGPT_CONNECTOR_URL = 'https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins';
const GEMINI_CONNECTOR_URL = 'https://support.google.com/g/answer/17106276';
const GROK_CONNECTOR_URL = 'https://grok.com/connectors';
const TOKENIZER_URL = 'https://chromewebstore.google.com/detail/claude-token-counter/bioobpobpbeohjoefndgkiaakboimpch';
const GROK_USAGE_URL = 'https://chromewebstore.google.com/detail/grok-usage-watch-%E2%80%93-rate-l/bmpboaihdkpkjehbceegdmndkonlpdge';
const MCP_REPO_URL = 'https://github.com/HomyHubs/gpt-rundrive';
const TAILSCALE_DOWNLOAD_URL = 'https://tailscale.com/download';
const TAILSCALE_FUNNEL_URL = 'https://tailscale.com/docs/features/tailscale-funnel';
const WIDEN_SNIPPET = "document.querySelectorAll('.max-w-3xl').forEach(el => el.classList.replace('max-w-3xl', 'max-w-7xl'));";
const DEFAULT_RULES = ['index.md', 'RULE-agent-behavior.md', 'RULE-coding.md', 'RULE-pattern-core.md'];

// GitHub mark used by the top-right repository link.
const GITHUB_ICON = 'M12 .3a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0012 .3';

// The one copyable-code primitive (ui.A1 Tier-2 pattern class): every command/value/inline code renders as `.copy` and click-copies. `.mono` is plain monospace text, never a copy chip — the two roles stay visually distinct so nothing masquerades as copyable.
const copyEl = (value, hl = false) => `<code class="copy${hl ? ' hl' : ''}" title="click to copy"><span class="txt">${esc(value)}</span></code>`;

function field(label, value, hl = false) {
  return `<div class="row"><label>${esc(label)}</label>${copyEl(value, hl)}</div>`;
}

export function renderPanel({ origin, ingress = 'funnel', client, passphrase, token, repoRoot, rulesDir, userDir, updateInfo = {}, hasGit = false, savedIngress = null }) {
  const url = origin ? `${origin}/mcp` : 'not available yet, see section 0';
  const regUrl = origin ? `${origin}/register` : 'not available yet, see section 0';
  const funnelMode = ingress === 'funnel';
  // Tab 3 (Hosted domain) never becomes the active ingress here — the service it needs is a separate, not-yet-built project.
  const activeIngressTab = funnelMode ? 'tailscale' : 'owned';
  const ingressLabel = funnelMode ? 'Tailscale Funnel' : ingress === 'cloudflared' ? 'Cloudflare tunnel' : 'PUBLIC_ORIGIN (your own edge)';
  const mcpUpd = updateInfo.mcp || {};
  const ruleUpd = updateInfo.rule || {};
  const mcpVer = mcpUpd.current || '?';
  const ruleVer = ruleUpd.current || '?';
  // "Own update on top, rule update below" per the request; the rule row carries the re-paste warning because updating the corpus makes every pasted instruction stale.
  const updateBanner = (mcpUpd.updateAvailable || ruleUpd.updateAvailable) ? `<div class="updbar">
  ${mcpUpd.updateAvailable ? `<div class="updrow"><strong>Andy MCP Server</strong> <span class="mono">${esc(String(mcpUpd.current))} → ${esc(String(mcpUpd.latest))}</span> ${hasGit ? '<button class="primary" data-act="pullUpdate">Pull &amp; restart</button>' : `<a class="btnlink" href="${MCP_REPO_URL}" target="_blank" rel="noopener">Download ↗</a>`}<span class="msg" id="msgUpd"></span></div>` : ''}
  ${ruleUpd.updateAvailable ? `<div class="updrow updrule"><strong>Rules</strong> <span class="mono">${esc(String(ruleUpd.current))} → ${esc(String(ruleUpd.latest))}</span> <button class="primary" data-act="updateRules">Install / update</button><span class="msg" id="msgUpdRule"></span><div class="updwarn">⚠ After updating, RE-PASTE the section-2 Instructions into the custom-instructions setting of EACH AI: Claude / Grok / ChatGPT / Gemini.</div></div>` : ''}
</div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(PANEL_TITLE)} · panel</title>
<link rel="icon" href="/favicon/favicon.ico" sizes="any"><meta name="theme-color" content="#ff4800">
<link rel="stylesheet" href="/panel.css"></head><body><main>
<a class="gh-top" href="${MCP_REPO_URL}" target="_blank" rel="noopener" aria-label="View on GitHub" title="View on GitHub"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="${GITHUB_ICON}"/></svg></a>
<h1>${esc(PANEL_TITLE)}</h1>
<p class="sub">Gives Claude, ChatGPT, Grok, and Gemini read/edit access to files and a whitelisted shell on this machine, over Tailscale Funnel (or your own HTTPS edge / Cloudflare tunnel), gated by OAuth 2.1. Local panel only (127.0.0.1), never reachable through Funnel.</p>
<p class="helptext">Running repo: <span class="mono">${esc(repoRoot)}</span> · Config &amp; keys: <span class="mono">${esc(userDir)}</span></p>
${updateBanner}
<section class="stepper"><h2>Setup steps</h2>
<ol class="steps-nav">
  <li class="step${origin ? ' done' : ''}"><a href="#s0"><span class="step-n">${origin ? '✓' : '0'}</span> Setup</a></li>
  <li class="step"><a href="#s1"><span class="step-n">1</span> Connectors</a></li>
  <li class="step"><a href="#s2"><span class="step-n">2</span> Instructions</a></li>
  <li class="step opt"><a href="#s3"><span class="step-n">3</span> Extension <em>optional</em></a></li>
</ol>
</section>

<section id="s0"><h2>0 · Setup${origin ? ' <span class="done-tag">done</span>' : ''}</h2>
<p class="helptext">Currently serving at ${copyEl(origin || '(origin not resolved)')} via <strong>${esc(ingressLabel)}</strong>. Ingress is decided when ${copyEl('npm start')} boots, not switchable live; restart after picking a different tab below. The Hosted domain tab has nothing to pick or restart, it's a contact link.</p>

<nav class="tabs" role="tablist">
  <button class="tab${activeIngressTab === 'tailscale' ? ' active' : ''}" data-tab="tailscale">Tailscale + Funnel</button>
  <button class="tab${activeIngressTab === 'owned' ? ' active' : ''}" data-tab="owned">Owned public origin</button>
  <button class="tab${activeIngressTab === 'aiobox' ? ' active' : ''}" data-tab="aiobox">Hosted domain</button>
</nav>

<div class="tabpane${activeIngressTab === 'tailscale' ? ' active' : ''}" id="tab-tailscale">
<p>Complete these one-time prerequisites in order.</p>
<p class="helptext">You're viewing this panel, so the first three below are already done; the two Tailscale checks are live.</p>
<ol class="steps">
  <li><span class="dot ok">✓</span> Clone / download the <span class="mono">gpt-rundrive</span> repo.</li>
  <li><span class="dot ok">✓</span> ${copyEl('npm install')}.</li>
  <li><span class="dot ok">✓</span> ${copyEl('npm start')}, running now.</li>
  <li><span class="dot" id="tsInstalled">…</span> <a href="${TAILSCALE_DOWNLOAD_URL}" target="_blank" rel="noopener">Install Tailscale</a> and sign in.</li>
  <li><span class="dot" id="tsFunnel">…</span> Enable <a href="${TAILSCALE_FUNNEL_URL}" target="_blank" rel="noopener">Funnel</a> for your tailnet, free on every plan. ${copyEl('npm start')} enables it automatically; it only prints a link for you to approve once, when the tailnet hasn't allowed it yet.</li>
</ol>
<div class="acts"><button data-act="tailscale">Recheck</button><span class="msg" id="msgTs"></span></div>
<p class="helptext">Connector keeps dropping with <em>"hostname doesn't resolve / isn't reachable"</em>? The Funnel edge desynced, a Tailscale-side issue, not this server. Re-sync in a terminal (needs ${copyEl('sudo')}, so it can't be a button here), then reconnect. Why: <span class="mono">docs/research/claude-ai-oauth-connector.md</span> round 9.</p>
${field('Re-sync command', 'tailscale funnel --https=443 off && tailscale serve reset && tailscale funnel --bg 9999')}
<p class="helptext">Funnel unreliable in your region even after re-syncing? See the "Owned public origin" tab for two ways to bypass it.</p>
</div>

<div class="tabpane${activeIngressTab === 'owned' ? ' active' : ''}" id="tab-owned">
<p class="helptext">Replaces Tailscale entirely; OAuth and the tool suite stay the same.</p>
<h3 class="subh">Have a Cloudflare tunnel credentials JSON?</h3>
<div class="row"><label>cred.json</label><input type="file" id="tunnelCredFile" accept="application/json,.json"></div>
<div class="row"><label>Origin</label><input type="text" id="tunnelOriginInput" placeholder="https://your-host"></div>
<div class="acts"><button class="primary" data-act="saveTunnel">Save ingress</button><span class="msg" id="msgTunnel"></span></div>
<div id="savedIngressBox"></div>
<p class="helptext">No tunnel yet? <a href="${MCP_REPO_URL}#exposing-to-the-internet" target="_blank" rel="noopener">README: Exposing to the internet</a>.</p>
<h3 class="subh">Or: any HTTPS edge you already run</h3>
<p class="helptext">Set <span class="mono">PUBLIC_ORIGIN</span> in <span class="mono">.env</span> (copy from <span class="mono">.env.example</span>), or prefix the start command: ${copyEl('PUBLIC_ORIGIN=https://your-host npm start')}</p>
</div>

<div class="tabpane${activeIngressTab === 'aiobox' ? ' active' : ''}" id="tab-aiobox">
<p>Pick a domain and subdomain, then request it via Messenger; setup is manual, not self-serve yet.</p>
<p class="helptext">Worth it over the free Tailscale + Funnel tab if you want a short, memorable URL instead of Tailscale's auto-generated *.ts.net hostname.</p>
<div class="row"><label>Subdomain</label><div class="domain-pick">
<input type="text" id="subdomainInput" placeholder="yourname" maxlength="20">
<select id="tldSelect">
<option value="akitao.com" data-price="24">akitao.com</option>
<option value="akinet.me" data-price="19">akinet.me</option>
<option value="aiobox.app" data-price="12">aiobox.app</option>
<option value="akimcp.top" data-price="2" selected>akimcp.top</option>
<option value="akimcp.cfd" data-price="1" data-note="EXPIRED AUG 13 2027">akimcp.cfd</option>
</select>
<span class="helptext" id="domainPrice" style="margin:0;flex:0 0 auto;white-space:nowrap"></span>
</div></div>
<div class="acts"><button class="primary" data-act="registerDomain">Request via Messenger ↗</button><span class="msg" id="msgDomain"></span></div>
</div>
</section>

<section id="s1"><h2>1 · Connectors: Claude, Grok, ChatGPT, Gemini</h2>
<p class="helptext">Same Funnel URL for every client. Folders / shell allowlist apply to whoever connects. Fill the three common values below, then open your client's tab.</p>
${field('MCP Name', MCP_NAME)}
${field('MCP URL', url, true)}
${field('Passphrase', passphrase)}

<nav class="tabs" role="tablist">
  <button class="tab active" data-tab="claude"><img src="/img/providers/claude.png" class="provider-icon" alt="">Claude</button>
  <button class="tab" data-tab="grok"><img src="/img/providers/grok.png" class="provider-icon" alt="">Grok</button>
  <button class="tab" data-tab="chatgpt"><img src="/img/providers/gpt.png" class="provider-icon" alt="">ChatGPT</button>
  <button class="tab" data-tab="gemini"><img src="/img/providers/gemini.png" class="provider-icon" alt="">Gemini</button>
</nav>

<div class="tabpane active" id="tab-claude">
  <p class="lnk"><a href="${CONNECTOR_URL}" target="_blank" rel="noopener">↗ Open Add custom connector</a></p>
  <p class="helptext">Paste the three common values above, plus these two Claude-only credentials, into the connector dialog.</p>
  ${field('OAuth Client ID', client.clientId)}
  ${field('OAuth Client Secret', client.clientSecret)}
</div>

<div class="tabpane" id="tab-grok">
  <ol class="steps">
    <li><a href="${esc(GROK_CONNECTOR_URL)}" target="_blank" rel="noopener">Open Connectors</a> → New Connector → Custom.</li>
    <li>Set <strong>Name</strong> = MCP Name above, <strong>Server URL</strong> = MCP URL.</li>
    <li>On connect, enter the <strong>Passphrase</strong>.</li>
  </ol>
  <p class="helptext">Name must match exactly, the paste-in instruction keys off it. Grok self-registers via PKCE, nothing else to paste.</p>
</div>

<div class="tabpane" id="tab-chatgpt">
  <ol class="steps">
    <li>Turn on <a href="${esc(CHATGPT_DEVMODE_URL)}" target="_blank" rel="noopener">Developer mode</a> (Settings → Connectors → Advanced).</li>
    <li><a href="${esc(CHATGPT_CONNECTOR_URL)}" target="_blank" rel="noopener">Create a connector</a>, then pick this repo's icon file for it: <span class="mono">${esc(repoRoot)}/public/favicon/icon-48.png</span>. Name and description are your choice.</li>
    <li><strong>Server URL</strong> = MCP URL, <strong>Authentication</strong> = OAuth.</li>
    <li>Open <strong>Advanced OAuth settings</strong> and set <strong>Registration URL</strong> to the value below; the other endpoints auto-fill.</li>
    <li>Tick <strong>I understand and want to continue</strong>, then <strong>Create</strong>.</li>
    <li>On connect, enter the same <strong>Passphrase</strong>.</li>
  </ol>
  ${field('Registration URL', regUrl)}
  <p class="helptext">Registration method = DCR, Token endpoint auth method = none; ChatGPT registers its own client via PKCE, no secret. Do not paste Claude's Client ID or Secret here. Write tools may be limited depending on OpenAI's current policy.</p>
</div>

<div class="tabpane" id="tab-gemini">
  <p class="helptext">Paid tiers only. Tested 2026-08-09: the connection is healthy, but Gemini web doesn't reliably discover or invoke the MCP tools, use Claude or Grok instead. Not recommended.</p>
  <ol class="steps">
    <li>Open <a href="${esc(GEMINI_CONNECTOR_URL)}" target="_blank" rel="noopener">custom connected apps</a> (Gemini → paid subscriptions → Custom apps).</li>
    <li>Set the <strong>custom app link / Server URL</strong> = MCP URL.</li>
    <li>Open <strong>Advanced Settings</strong> and paste the <strong>Client ID</strong> and <strong>Client secret</strong> from the Claude tab (same confidential client).</li>
    <li>Ignore Gemini's <strong>Copy redirect URI</strong> button; the redirect is already allowlisted server-side.</li>
    <li>On <strong>Continue</strong>, enter the <strong>Passphrase</strong>.</li>
  </ol>
</div>
</section>

<section id="s2"><h2>2 · Instructions: choose rules &amp; copy the prompt</h2>
<p class="helptext">Choose which available rule files load, then copy the Instructions into the custom-instructions setting of each AI (links below). It teaches the AI to use this server's tools and any rules already present in the configured rules directory.</p>
<div class="acts">
  <a class="btnlink" href="${SETTINGS_URL}" target="_blank" rel="noopener"><img src="/img/providers/claude.png" class="provider-icon" alt="">Claude ↗</a>
  <a class="btnlink" href="${esc(GROK_SETTINGS_URL)}" target="_blank" rel="noopener"><img src="/img/providers/grok.png" class="provider-icon" alt="">Grok ↗</a>
  <a class="btnlink" href="${esc(CHATGPT_SETTINGS_URL)}" target="_blank" rel="noopener"><img src="/img/providers/gpt.png" class="provider-icon" alt="">ChatGPT ↗</a>
  <a class="btnlink" href="${esc(GEMINI_SETTINGS_URL)}" target="_blank" rel="noopener"><img src="/img/providers/gemini.png" class="provider-icon" alt="">Gemini ↗</a>
</div>
<label style="display:flex;gap:6px;align-items:center;font-size:13px;margin:12px 0 10px">
  <input type="checkbox" id="loadRules" checked> Require reading rules at the start of every session
</label>
<div class="checks" id="ruleChecks"></div>
<textarea id="prompt" readonly style="min-height:130px"></textarea>
<div class="acts"><button class="primary" onclick="copyText(document.getElementById('prompt').value, this)">copy prompt</button><span class="msg" id="promptCount"></span></div>
</section>

<section id="s3"><h2>3 · Browser utilities <span class="done-tag" style="color:var(--muted);border-color:var(--line)">optional</span></h2>
<p class="helptext"><strong>Claude Token Counter</strong>: a Chrome extension that shows your hourly and weekly usage bar under claude.ai's input box, including on the Free plan, which claude.ai doesn't surface itself.</p>
<div class="acts"><a class="btnlink" href="${esc(TOKENIZER_URL)}" target="_blank" rel="noopener">Install from Chrome Web Store ↗</a></div>
<figure><img src="https://raw.githubusercontent.com/lacvietanh/aki-mcp-sv/38dabcc6d442f36db8279b7652eaf33f6676ef6f/public/extension-claude-usage.png" alt="Token usage bar shown under claude.ai's input box" loading="lazy"></figure>
<p class="helptext" style="margin:14px 0 0"><strong>Grok Usage Watch</strong>: the same idea for grok.com, a rate-limit/usage bar for your Grok quota that the site doesn't show on its own.</p>
<div class="acts"><a class="btnlink" href="${esc(GROK_USAGE_URL)}" target="_blank" rel="noopener">Install from Chrome Web Store ↗</a></div>
<figure><img src="https://raw.githubusercontent.com/lacvietanh/aki-mcp-sv/38dabcc6d442f36db8279b7652eaf33f6676ef6f/public/extension-grok-usage.png" alt="Usage / rate-limit bar shown on grok.com" loading="lazy"></figure>
<p class="helptext" style="margin:14px 0 0">Widen the claude.ai chat pane; paste the snippet below into the browser tab's Console (${copyEl('Cmd/Ctrl ⌥ J')}). Only tweaks CSS in your current tab, nothing account- or security-related, nothing leaves your machine.</p>
${field('Widen command', WIDEN_SNIPPET)}
</section>

<section id="s4"><h2>4 · Folders the connector may reach</h2>
<p class="helptext">These folders scope file tools and the shell's working directory. Allowed shell commands run with your user permissions and may access files outside this list.</p>
<p class="helptext">The default root is your whole home folder: Desktop, Documents, Downloads, Photos, everything under it, not just projects.</p>
<p class="helptext">Save takes effect immediately for every tool (shell, search, and file read/write/edit alike) — no restart needed.</p>
<div class="flist" id="paths"></div>
<div class="acts">
  <button class="primary" data-act="addFolder">+ Add folder…</button>
  <button data-act="savePaths">Save</button>
  <span class="msg" id="msgPaths"></span>
</div>
</section>

<section id="s5"><h2>5 · Allowed shell commands</h2>
<p class="helptext">Commands run as your user, so they can read what you can. Chips allow any subcommand; click a chip to restrict it to specific subcommands. Adding write commands (${copyEl('rm')}, ${copyEl('git commit')}…) widens access.</p>
<input type="text" id="cmdFilter" placeholder="filter commands…">
<div class="chips" id="cmdChips"></div>
<div class="flist" id="cmdRows"></div>
<div class="acts">
  <input type="text" id="newCmd" placeholder="add a command, e.g. docker">
  <button data-act="addCmd">+ Add</button>
  <button class="primary" data-act="saveAllowlist">Save allowlist</button>
  <span class="msg" id="msgAllow"></span>
</div>

<h3 class="subh">Trusted script directories</h3>
<p class="helptext">Scripts under these folders run without a command row above, for Andy MCP-authored skills and scripts. A folder that overlaps a writable folder from section 4 is disabled (write + run = code execution).</p>
<div class="flist" id="trustedDirs"></div>
<div class="acts">
  <button class="primary" data-act="addTrusted">+ Add directory…</button>
  <button data-act="saveTrusted">Save</button>
  <span class="msg" id="msgTrusted"></span>
</div>
</section>


</main>
<nav class="spy" id="spy" aria-label="Sections"></nav>
<button class="to-top" id="toTop" aria-label="Scroll to top" title="Scroll to top">↑</button>
<script>
const TOKEN = ${JSON.stringify(token)};
const RULES_DIR = ${JSON.stringify(rulesDir)};
const CLAUDE_DIR = ${JSON.stringify(CLAUDE_DIR)};
const ANDY_DIR = ${JSON.stringify(ANDY_DIR)};
const USER_DIR = ${JSON.stringify(userDir)};
const REPO_ROOT = ${JSON.stringify(repoRoot)};
const MCP_NAME = ${JSON.stringify(MCP_NAME)};
const DEFAULT_RULES = ${JSON.stringify(DEFAULT_RULES)};
const MCP_VERSION = ${JSON.stringify(mcpVer)};
const RULE_VERSION = ${JSON.stringify(ruleVer)};
const SAVED_INGRESS = ${JSON.stringify(savedIngress)};
</script>
<script src="/panel-client.js"></script>
</body></html>`;
}
