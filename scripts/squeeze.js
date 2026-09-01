// Central output budget for every MCP tool result.
//
// Why it lives here and not in each tool: tools-server.js already proxies registerTool() to prefix
// names, so it is the single point every tool result flows through. Wrapping the handler there means
// read_text_file, run_cmd, run_test, search_content and anything added later all inherit the same cap
// without a per-tool edit, and without any tool changing its own logic.
//
// Two stages, in order:
//   1. headroom-ai's compress() when it is installed (optional — `npm i headroom-ai`). Content-aware:
//      AST-level for code, structural for JSON. Never required; its absence is not an error.
//   2. A hard head+tail clamp. Compression alone cannot *guarantee* a bound, and the whole point of
//      this module is a bound the caller's context window can rely on.
//
// Budget is settings-driven: setting.json -> { "output": { "maxChars": 12000 } }.
import { readSettings } from './allowlist.js';

const FALLBACK_MAX_CHARS = 12_000; // ~3k tokens: enough for a real file or stack trace, not a whole build log
const MIN_MAX_CHARS = 500; // below this a clamp marker would dominate the payload; treat as misconfiguration
const HEAD_SHARE = 0.6; // failures cluster at the end of a log, but the head is what names the command that ran

// undefined = never looked; null = looked, unavailable. Resolved at most once per process.
let compressor;

async function getCompressor() {
  if (compressor !== undefined) return compressor;
  compressor = null;
  try {
    const mod = await import('headroom-ai');
    const fn = mod?.compress ?? mod?.default?.compress ?? mod?.default;
    if (typeof fn === 'function') compressor = fn;
  } catch {
    // Not installed. The clamp below is then the entire safety net, which is by design — the server
    // must keep working with zero new dependencies.
  }
  return compressor;
}

export function maxChars() {
  const configured = readSettings().output?.maxChars;
  return Number.isFinite(configured) && configured >= MIN_MAX_CHARS ? Math.floor(configured) : FALLBACK_MAX_CHARS;
}

export function clamp(text, limit = maxChars()) {
  if (typeof text !== 'string' || text.length <= limit) return text;
  const head = Math.floor(limit * HEAD_SHARE);
  const tail = limit - head;
  const omitted = text.length - head - tail;
  // The marker is addressed to the model, not to a human: it must say what to do next, or the model
  // simply re-runs the same oversized call.
  return (
    `${text.slice(0, head)}\n\n` +
    `… [${omitted} characters cut by the output budget — do NOT re-run this call unchanged. ` +
    `Narrow it instead: read_lines with offset/limit, search_content instead of a full read, or a tighter grep] …\n\n` +
    `${text.slice(-tail)}`
  );
}

export async function squeeze(text) {
  const limit = maxChars();
  if (typeof text !== 'string' || text.length <= limit) return text;
  const compress = await getCompressor();
  if (compress) {
    try {
      const out = await compress(text);
      const compressed = typeof out === 'string' ? out : (out?.content ?? out?.text);
      // Only accept a genuine win — a compressor that grew the payload is a bug we route around.
      if (typeof compressed === 'string' && compressed.length < text.length) return clamp(compressed, limit);
    } catch {
      // A compressor failure must never turn a working tool call into a failed one.
    }
  }
  return clamp(text, limit);
}

// Wraps an MCP tool handler so every text part of its result respects the budget. isError and any
// non-text content (images, resources) pass through untouched.
export function withSqueeze(handler) {
  return async (...args) => {
    const result = await handler(...args);
    if (!result || !Array.isArray(result.content)) return result;
    const content = await Promise.all(
      result.content.map(async (part) =>
        part?.type === 'text' && typeof part.text === 'string' ? { ...part, text: await squeeze(part.text) } : part,
      ),
    );
    return { ...result, content };
  };
}
