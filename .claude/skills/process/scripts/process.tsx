#!/usr/bin/env tsx
/**
 * Scans raw/ and processes PDFs into parsed/<stem>/:
 *   output.md               (LiteParse XML-page format)   — always
 *   extracted_metadata.json (Claude-compatible API)        — only with --metadata
 *
 * Usage:
 *   tsx process.tsx                      # parse all missing output.md
 *   tsx process.tsx --metadata           # parse + extract metadata
 *   tsx process.tsx 5                    # first 5 PDFs (alphabetical)
 *   tsx process.tsx 5 --metadata         # first 5 PDFs, parse + metadata
 *   tsx process.tsx myfile.pdf           # one specific file
 *   tsx process.tsx myfile.pdf --metadata
 */

import { LiteParse, type ParseResult } from "@llamaindex/liteparse";
import { readdir, readFile, writeFile, mkdir, access } from "fs/promises";
import { join, basename, extname, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const RAW_DIR = join(ROOT, "raw");
const PARSED_DIR = join(ROOT, "parsed");

// ── .env loader ──────────────────────────────────────────────────────────────

async function loadEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  try {
    const raw = await readFile(join(ROOT, ".env"), "utf-8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  } catch {}
  return env;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function buildMarkdown(file: string, parsed: ParseResult): string {
  const lines = [
    "---",
    `source: ${basename(file)}`,
    `pages: ${parsed.pages.length}`,
    "---",
    "",
    "<pages>",
  ];
  for (const page of parsed.pages) {
    lines.push(`<page number="${page.pageNum}">`);
    lines.push(page.text.trim());
    lines.push("</page>");
    lines.push("");
  }
  lines.push("</pages>");
  return lines.join("\n");
}

function extractFirstPages(md: string, n = 3): string {
  const matches = [...md.matchAll(/<page number="\d+">([\s\S]*?)<\/page>/g)];
  return matches
    .slice(0, n)
    .map((m) => m[1].trim())
    .join("\n\n---\n\n");
}

// ── metadata extraction via Claude-compatible API ────────────────────────────

async function extractMetadata(
  pageText: string,
  env: Record<string, string>
): Promise<object> {
  const baseUrl = (env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  const apiKey = env.ANTHROPIC_AUTH_TOKEN ?? env.ANTHROPIC_API_KEY ?? "";
  const model = (env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001").replace(/\[.*\]$/, "");

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Extract metadata from the first pages of this academic paper and return it as a JSON object with exactly these fields:
- main_title (string)
- sub_title (string or null)
- authors (comma-separated string)
- published_at (year or date string)
- stakeholder_orgs (array of org name strings involved in producing the paper)
- abstract (string or null)
- keywords (array of strings or null)

Paper text:
${pageText}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const raw = data.content?.find((b) => b.type === "text")?.text ?? "";
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();
  return JSON.parse(jsonStr);
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const WITH_METADATA = args.includes("--metadata");
const rest = args.filter((a) => a !== "--metadata");

const [arg1] = rest;
let LIMIT = Infinity;
let SPECIFIC: string | null = null;

if (arg1 && !isNaN(Number(arg1))) {
  LIMIT = Number(arg1);
} else if (arg1?.toLowerCase().endsWith(".pdf")) {
  SPECIFIC = arg1;
}

// ── main ──────────────────────────────────────────────────────────────────────

const env = WITH_METADATA ? await loadEnv() : {};
await mkdir(PARSED_DIR, { recursive: true });

let pdfs: string[];
if (SPECIFIC) {
  pdfs = [SPECIFIC];
} else {
  const entries = await readdir(RAW_DIR);
  pdfs = entries
    .filter((f) => extname(f).toLowerCase() === ".pdf")
    .sort()
    .slice(0, LIMIT === Infinity ? undefined : LIMIT);
}

// determine what each file needs
const queue: Array<{ file: string; needsParse: boolean; needsMeta: boolean }> = [];
for (const file of pdfs) {
  const stem = basename(file, ".pdf");
  const dir = join(PARSED_DIR, stem);
  const needsParse = !(await exists(join(dir, "output.md")));
  const needsMeta = WITH_METADATA && !(await exists(join(dir, "extracted_metadata.json")));
  if (needsParse || needsMeta) queue.push({ file, needsParse, needsMeta });
}

if (queue.length === 0) {
  console.log("Everything is up to date.");
  process.exit(0);
}

console.log(`\nProcessing ${queue.length} PDF(s):`);
console.log(`  ${queue.filter((p) => p.needsParse).length} need parsing`);
if (WITH_METADATA) {
  console.log(`  ${queue.filter((p) => p.needsMeta).length} need metadata extraction`);
} else {
  console.log(`  metadata extraction skipped (pass --metadata to enable)`);
}
console.log();

const parser = new LiteParse({ ocrEnabled: false, quiet: true });

for (const { file, needsParse, needsMeta } of queue) {
  const stem = basename(file, ".pdf");
  const dir = join(PARSED_DIR, stem);
  await mkdir(dir, { recursive: true });

  let md: string | null = null;

  if (needsParse) {
    process.stdout.write(`[parse]  ${stem}\n         → `);
    try {
      const result: ParseResult = await parser.parse(join(RAW_DIR, basename(file)));
      md = buildMarkdown(file, result);
      await writeFile(join(dir, "output.md"), md, "utf-8");
      console.log(`✓  ${result.pages.length} pages`);
    } catch (e) {
      console.log(`✗  ${(e as Error).message}`);
      continue;
    }
  }

  if (needsMeta) {
    process.stdout.write(`[meta]   ${stem}\n         → `);
    try {
      if (!md) md = await readFile(join(dir, "output.md"), "utf-8");
      const excerpt = extractFirstPages(md!, 3);
      const metadata = await extractMetadata(excerpt, env);
      await writeFile(join(dir, "extracted_metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");
      console.log("✓");
    } catch (e) {
      console.log(`✗  ${(e as Error).message}`);
    }
  }
}

console.log("\nDone!");
