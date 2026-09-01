# gpt-rundrive

Give **ChatGPT web** (and Claude / Grok / Gemini) read/edit access to files and a whitelisted shell on your own machine over an OAuth 2.1–gated remote MCP server — plus a dedicated **`run_test`** tool so a chat can run your project's test suite, read failures, edit the code, and re-run until it's green.

> Fork of [`lacvietanh/aki-mcp-sv`](https://github.com/lacvietanh/aki-mcp-sv) (MIT © Lạc Việt Anh / AkiTao). This fork keeps the full runtime and adds the `local__run_test` tool for a run → fix → re-run loop driven from the chat web UI. All credit for the base server, OAuth gatekeeper, Tailscale/Cloudflare ingress, filesystem/shell/search tooling, and control panel goes upstream.

---

## What you get

- **One `npm start`** boots a single Node process: an OAuth 2.1 authorization server + Streamable HTTP `/mcp` endpoint (public, port 9999) and a loopback-only control panel (127.0.0.1, port 9998).
- **Public ingress** via Tailscale Funnel by default (free), or your own Cloudflare tunnel / `PUBLIC_ORIGIN` HTTPS edge.
- **Tools** exposed to the connected AI (all prefixed `local__`):
  - Filesystem: `read_text_file`, `write_file`, `edit_file`, `create_directory`, `move_file`, `get_file_info`, `list_allowed_directories`
  - Search: `find_path`, `search_content`
  - Shell: `run_cmd` (whitelisted binaries/subcommands only)
  - Assistants: `agy_run`, `kiro_read`
  - **`run_test`** — new in this fork (see below)
- **Control panel** at `http://127.0.0.1:9998` to manage allowed folders, the shell allowlist, trusted script dirs, ingress, and to copy the connector values / instruction prompt.

---

## Quick start

```bash
npm install
npm start
```

`npm start` prints the MCP URL, the OAuth Client ID/Secret (for Claude), the Registration URL (for ChatGPT), and a one-time **passphrase**, then opens the control panel in your browser. Requires Node 22+.

---

## The `run_test` tool

`run_cmd` deliberately caps `npm` to read-only subcommands and kills anything after 10s — useless for a real test run. `run_test` is the dedicated path: a longer timeout (5 min default) and a bigger output buffer (8 MB), and it will **only** run commands you have pre-configured. Nothing arbitrary can be executed.

### 1. Configure your test commands

Edit `setting.json` in the server's user-data dir (`~/.andymcp/mcpsv/setting.json`) and add a `test.commands` map. Each key is a name; each value is the command as an array of `[binary, ...args]`:

```json
{
  "test": {
    "commands": {
      "vlxd": ["npm", "test"],
      "ftrack": ["npx", "vitest", "run"]
    }
  }
}
```

On Windows you may need the `.cmd` shim, e.g. `["npm.cmd", "test"]`.

### Legacy data migration

On the first start after this update, Andy MCP copies existing config, OAuth credentials, tokens, passphrase, ingress settings, and installed rules from `~/.aki` into `~/.andymcp`. Stored folder and trusted-directory paths are rewritten to the new root. The old `~/.aki` data is left untouched as a rollback copy, and existing files under `~/.andymcp` are never overwritten.

### 2. Call it from the chat

The AI calls `local__run_test` with:

- `name` — a key from `test.commands` above (e.g. `vlxd`)
- `cwd` — the absolute project directory (must be under an allowed folder from the panel)
- `timeoutMs` — optional override of the 5-minute default

It returns `PASS` or `FAIL` plus the full combined stdout/stderr.

### 3. The auto-fix loop

Paste something like this into the AI's instructions (or just ask it in chat) so it self-corrects:

> When I ask you to fix failing tests: call `local__run_test`. If it PASSES, stop. If it FAILS, read the output, make the **smallest** code change with `local__edit_file`, then run `local__run_test` again. Repeat, at most 5 times. Never edit the tests themselves just to make them pass.

---

## Connect from ChatGPT web

1. Settings → Connectors → Advanced → turn on **Developer mode**.
2. **Create a connector**. Icon (optional): `public/favicon/icon-48.png`.
3. **Server URL** = the MCP URL from `npm start` (`https://<your-host>/mcp`). **Authentication** = OAuth.
4. Open **Advanced OAuth settings** and set the **Registration URL** to `https://<your-host>/register`; the other endpoints auto-fill. Registration = DCR, token endpoint auth method = none (ChatGPT registers itself via PKCE — do **not** paste Claude's Client ID/Secret here).
5. Tick **I understand and want to continue**, then **Create**.
6. On connect, enter the **passphrase** on the confirmation page.

The control panel (section 1) has copy-buttons for every value, plus tabs for Claude / Grok / Gemini.

> Note: ChatGPT may restrict which tools it will call depending on OpenAI's current connector policy; read tools and `run_test` generally work.

---

## Exposing to the internet

- **Tailscale Funnel** (default): install Tailscale, sign in; `npm start` enables Funnel automatically and prints a one-time approval link if needed.
- **Cloudflare tunnel**: `npm start --tunnel /path/to/cred.json --origin https://your-host`, or save it in the panel (section 0).
- **Your own HTTPS edge**: set `PUBLIC_ORIGIN=https://your-host` in `.env` (copy from `.env.example`) or inline before `npm start`.

---

## Security notes

- The control panel binds to `127.0.0.1` only and is token-gated; it is never reachable through the public Funnel.
- File tools are scoped to the folders you allow in the panel; shell binaries/subcommands are whitelisted; trusted script dirs that overlap a writable root are auto-disabled (write + run = RCE).
- The public `/mcp` endpoint is gated by OAuth 2.1 + a passphrase confirmation you approve in the browser.

---

## Differences from upstream `aki-mcp-sv`

- **Added** `scripts/test-mcp.js` (the `run_test` tool) and wired it into `scripts/tools-server.js`.
- **Omitted** the release builder (`scripts/build/`) and binary assets under `public/` (favicons, provider/QR/screenshot images) — the server runs fine with `npm start`; the panel just shows a few broken images. Copy those from upstream if you want them.
- Update checks still point at upstream (`lacvietanh/aki-mcp-sv` + `lacvietanh/akidevrule`) so you get notified of new base releases.

## License

MIT. Base work © Lạc Việt Anh (AkiTao); see `LICENSE`.
