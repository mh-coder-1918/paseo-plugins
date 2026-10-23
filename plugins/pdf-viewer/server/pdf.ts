import type { RpcInput } from "@getpaseo/plugin";
import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { listPdfsRpc, pdfInfoRpc, renderPageRpc } from "../shared/pdf";
import { readPageCount, renderPage } from "./renderer";

const MAX_FILES = 500;
const MAX_DEPTH = 6;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "Library", "build", "dist", "target", "vendor"]);

function resolvePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "~" || trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(1));
  if (!isAbsolute(trimmed)) throw new Error("Use an absolute path or a path starting with ~/");
  return resolve(trimmed);
}

async function requirePdf(path: string): Promise<string> {
  const absolute = resolvePath(path);
  const info = await stat(absolute).catch(() => null);
  if (!info?.isFile()) throw new Error(`File not found: ${absolute}`);
  if (!absolute.toLowerCase().endsWith(".pdf")) throw new Error("Only .pdf files can be opened");
  return absolute;
}

export async function listPdfs({ root }: RpcInput<typeof listPdfsRpc>) {
  const base = resolvePath(root);
  const files: { path: string; relativePath: string }[] = [];
  let truncated = false;

  async function walk(directory: string, depth: number): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      if (entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIPPED_DIRECTORIES.has(entry.name)) await walk(path, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        files.push({ path, relativePath: relative(base, path) });
      }
    }
  }

  await walk(base, 0);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { files, truncated };
}

export async function pdfInfo({ path }: RpcInput<typeof pdfInfoRpc>) {
  const absolute = await requirePdf(path);
  return { path: absolute, pageCount: await readPageCount(absolute) };
}

export async function renderPdfPage({ path, page, width }: RpcInput<typeof renderPageRpc>) {
  return renderPage(await requirePdf(path), page, width);
}
