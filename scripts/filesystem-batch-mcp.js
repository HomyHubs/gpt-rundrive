// Batch + windowed filesystem tools, added as a separate module on purpose: filesystem-mcp.js is a
// security-sensitive file (atomic writes, symlink-safe path resolution) and this change is purely
// additive, so it should not touch it.
//
// What this fixes, in quota terms: the existing tools are one-file-per-call. A refactor touching five
// files costs five edit_file calls plus five read_text_file calls; on ChatGPT's agentic branch each
// one is billed. edit_files/write_files/read_lines make that a single call each.
//
// read_lines exists because read_text_file returns a whole file. head/tail cover the two ends, but not
// "the 60 lines around the function I am editing", which is the actual common case.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';
import { resolveRealUnderRoot } from './roots.js';
import { ok, err, fail } from './mcp-tool.js';

const DEFAULT_WINDOW = 400; // lines
const MAX_FILES_PER_CALL = 30; // a batch larger than this is a sign the model is guessing, not editing

// Same normalization filesystem-mcp.js applies: CRLF files must not make every edit fail to match.
const normalizeLineEndings = (text) => text.replace(/\r\n/g, '\n');

// write-new-then-rename: a crash mid-write leaves the original intact, and the 'wx' flag means we can
// never clobber a file someone else created between our check and our write.
async function writeFileAtomic(filePath, content) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, content, { encoding: 'utf-8', flag: 'wx' });
    await fs.rename(tmp, filePath);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

// Ambiguity is an error, not something to resolve by picking the first hit: silently editing the wrong
// one of three identical lines is the worst possible outcome for an unattended agent.
function applyEdits(original, edits, label) {
  let content = normalizeLineEndings(original);
  for (const [i, edit] of edits.entries()) {
    const oldText = normalizeLineEndings(edit.oldText);
    const newText = normalizeLineEndings(edit.newText);
    if (!oldText) throw new Error(`${label}: edit #${i + 1} has an empty oldText`);
    const first = content.indexOf(oldText);
    if (first === -1) throw new Error(`${label}: edit #${i + 1} did not match anything`);
    if (!edit.replaceAll && content.indexOf(oldText, first + 1) !== -1) {
      throw new Error(`${label}: edit #${i + 1} matched more than once — extend oldText, or set replaceAll: true`);
    }
    content = edit.replaceAll
      ? content.split(oldText).join(newText)
      : content.slice(0, first) + newText + content.slice(first + oldText.length);
  }
  return content;
}

const diffOf = (rel, before, after) => createTwoFilesPatch(rel, rel, before, after, 'before', 'after');

function tooMany(files) {
  return files.length > MAX_FILES_PER_CALL
    ? `rejected: ${files.length} files in one call exceeds the ${MAX_FILES_PER_CALL}-file limit`
    : null;
}

export function register(server) {
  server.registerTool(
    'read_lines',
    {
      title: 'Read Line Ranges',
      description:
        'Read a specific line window from one or more files in a single call. Prefer this over read_text_file ' +
        'for anything large: pass offset (1-based first line) and limit (how many lines). Every result is labelled ' +
        'with the range and the file\'s total line count, so you can page through a big file deliberately instead of ' +
        'pulling all of it into context. Use search_content first to find the line number worth reading.',
      inputSchema: {
        files: z
          .array(
            z.object({
              path: z.string(),
              offset: z.number().optional().describe('1-based first line (default 1)'),
              limit: z.number().optional().describe(`how many lines (default ${DEFAULT_WINDOW})`),
            }),
          )
          .describe('one entry per file/range to read'),
      },
    },
    async ({ files }) => {
      const reject = tooMany(files);
      if (reject) return err(reject);
      const chunks = [];
      for (const spec of files) {
        try {
          const abs = await resolveRealUnderRoot(spec.path);
          const lines = normalizeLineEndings(await fs.readFile(abs, 'utf-8')).split('\n');
          const start = Math.max(0, (spec.offset ?? 1) - 1);
          const count = Number.isFinite(spec.limit) && spec.limit > 0 ? Math.floor(spec.limit) : DEFAULT_WINDOW;
          const end = Math.min(lines.length, start + count);
          const more = end < lines.length ? ` — ${lines.length - end} lines remain, re-read with offset ${end + 1}` : '';
          chunks.push(`===== ${spec.path} [lines ${start + 1}-${end} of ${lines.length}]${more}\n${lines.slice(start, end).join('\n')}`);
        } catch (e) {
          // One unreadable file must not discard the files that were read successfully.
          chunks.push(`===== ${spec.path} [ERROR] ${e.message}`);
        }
      }
      return ok(chunks.join('\n\n'));
    },
  );

  server.registerTool(
    'write_files',
    {
      title: 'Write Multiple Files',
      description:
        'Create or overwrite several whole files in ONE call. Use this instead of calling write_file repeatedly. ' +
        'Overwrites without warning, so for an existing file prefer edit_files unless you really are replacing all ' +
        'of it. Missing parent directories are created.',
      inputSchema: {
        files: z.array(z.object({ path: z.string(), content: z.string() })),
      },
    },
    async ({ files }) => {
      const reject = tooMany(files);
      if (reject) return err(reject);
      const written = [];
      try {
        for (const file of files) {
          const abs = await resolveRealUnderRoot(file.path);
          await fs.mkdir(path.dirname(abs), { recursive: true });
          await writeFileAtomic(abs, file.content);
          written.push(`${file.path} (${file.content.length} chars)`);
        }
      } catch (e) {
        // Report what already landed — a caller that believes nothing happened will retry and double-apply.
        return err(`wrote ${written.length}/${files.length} file(s) before failing: ${e.message}\n\n${written.join('\n')}`);
      }
      return ok(`wrote ${written.length} file(s):\n${written.join('\n')}`);
    },
  );

  server.registerTool(
    'edit_files',
    {
      title: 'Edit Multiple Files',
      description:
        'Apply find/replace edits across SEVERAL files in ONE call, returning a unified diff per file. This is the ' +
        'preferred way to make any multi-file change — do not call edit_file once per file. oldText must match exactly ' +
        'and must be unique in the file unless you set replaceAll. All files are read and computed before anything is ' +
        'written, so a bad edit in the last file aborts the whole batch instead of leaving it half-applied. ' +
        'Set dryRun to preview the diffs without writing.',
      inputSchema: {
        files: z.array(
          z.object({
            path: z.string(),
            edits: z.array(
              z.object({
                oldText: z.string().describe('exact text to find'),
                newText: z.string().describe('replacement text'),
                replaceAll: z.boolean().optional().describe('replace every occurrence instead of requiring uniqueness'),
              }),
            ),
          }),
        ),
        dryRun: z.boolean().optional().describe('return the diffs without writing'),
      },
    },
    async ({ files, dryRun }) => {
      const reject = tooMany(files);
      if (reject) return err(reject);
      // Phase 1 — resolve, read and compute everything. Nothing is written yet, so any failure here is
      // a clean no-op across the whole batch. This is the entire reason edit_files is safer than a
      // sequence of edit_file calls.
      const planned = [];
      try {
        for (const file of files) {
          const abs = await resolveRealUnderRoot(file.path);
          const before = normalizeLineEndings(await fs.readFile(abs, 'utf-8'));
          const after = applyEdits(before, file.edits, file.path);
          planned.push({ abs, rel: file.path, before, after });
        }
      } catch (e) {
        return fail(e);
      }

      const diffs = planned
        .map(({ rel, before, after }) => (before === after ? `${rel}: no change` : diffOf(rel, before, after)))
        .join('\n');

      if (dryRun) return ok(`dry run — nothing written\n\n${diffs}`);

      // Phase 2 — write. A failure here is genuinely partial, so say exactly how far it got.
      const done = [];
      try {
        for (const item of planned) {
          if (item.before !== item.after) await writeFileAtomic(item.abs, item.after);
          done.push(item.rel);
        }
      } catch (e) {
        return err(`applied ${done.length}/${planned.length} file(s) before failing: ${e.message}\n\napplied: ${done.join(', ')}`);
      }
      return ok(`edited ${planned.length} file(s)\n\n${diffs}`);
    },
  );
}
