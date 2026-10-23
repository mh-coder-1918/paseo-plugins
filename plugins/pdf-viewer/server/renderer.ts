import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// Rasterizes pages with macOS PDFKit, so no third-party PDF library is needed.
const SWIFT_SOURCE = String.raw`
import AppKit
import PDFKit

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments
guard args.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[2])) else { fail("Cannot open PDF") }

switch args[1] {
case "info":
  print("{\"pageCount\":\(doc.pageCount)}")
case "page":
  guard args.count >= 5, let index = Int(args[3]), let width = Double(args[4]),
        let page = doc.page(at: index) else { fail("Invalid page") }
  let bounds = page.bounds(for: .cropBox)
  let rotated = page.rotation % 180 != 0
  let pageSize = rotated ? CGSize(width: bounds.height, height: bounds.width) : bounds.size
  let scale = width / pageSize.width
  let size = CGSize(width: (pageSize.width * scale).rounded(), height: (pageSize.height * scale).rounded())
  guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height),
                                   bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                   colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
        let context = NSGraphicsContext(bitmapImageRep: rep) else { fail("Cannot allocate bitmap") }
  let cg = context.cgContext
  cg.setFillColor(NSColor.white.cgColor)
  cg.fill(CGRect(origin: .zero, size: size))
  cg.scaleBy(x: scale, y: scale)
  page.draw(with: .cropBox, to: cg)
  guard let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else { fail("Cannot encode page") }
  print("{\"width\":\(Int(size.width)),\"height\":\(Int(size.height)),\"jpeg\":\"\(jpeg.base64EncodedString())\"}")
default:
  fail("Unknown command")
}
`;

const CACHE_DIR = join(homedir(), "Library", "Caches", "paseo-pdf-viewer");
const BINARY = join(CACHE_DIR, `pdf-render-${createHash("sha256").update(SWIFT_SOURCE).digest("hex").slice(0, 12)}`);

let compiling: Promise<string> | null = null;

async function ensureBinary(): Promise<string> {
  try {
    await access(BINARY);
    return BINARY;
  } catch {}
  if (process.platform !== "darwin") throw new Error("The PDF viewer renders with macOS PDFKit and needs a macOS daemon");
  compiling ??= (async () => {
    await mkdir(CACHE_DIR, { recursive: true });
    const source = `${BINARY}.swift`;
    await writeFile(source, SWIFT_SOURCE);
    try {
      await run("swiftc", ["-O", source, "-o", BINARY], { timeout: 120_000 });
    } catch (error) {
      throw new Error(`Compiling the PDF renderer failed; install Xcode Command Line Tools (xcode-select --install). ${String(error)}`);
    }
    return BINARY;
  })().finally(() => {
    compiling = null;
  });
  return compiling;
}

async function runRenderer(args: string[]): Promise<unknown> {
  const binary = await ensureBinary();
  try {
    const { stdout } = await run(binary, args, { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
    return JSON.parse(stdout);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || String(error));
  }
}

export async function readPageCount(path: string): Promise<number> {
  const result = (await runRenderer(["info", path])) as { pageCount: number };
  return result.pageCount;
}

export async function renderPage(path: string, page: number, width: number) {
  return (await runRenderer(["page", path, String(page), String(width)])) as {
    width: number;
    height: number;
    jpeg: string;
  };
}
