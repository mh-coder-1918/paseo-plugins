import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";

function opener(): string {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "explorer";
  return "xdg-open";
}

export async function openInFileManager({ path }: { path: string }) {
  if (!(await stat(path)).isDirectory()) throw new Error(`Not a directory: ${path}`);
  await new Promise<void>((resolve, reject) => {
    // explorer.exe exits with 1 even when it opens the folder.
    execFile(opener(), [path], (error) =>
      error && process.platform !== "win32" ? reject(error) : resolve(),
    );
  });
  return { opened: true };
}
