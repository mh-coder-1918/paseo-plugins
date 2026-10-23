import type { PluginServerContext } from "@getpaseo/plugin/server";
import { openInFileManager } from "./server/open-in-file-manager";
import { openInFileManagerRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  server.handle(openInFileManagerRpc, openInFileManager);
  return () => {};
}
