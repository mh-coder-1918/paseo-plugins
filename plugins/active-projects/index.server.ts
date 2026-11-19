import type { PluginServerContext } from "@getpaseo/plugin/server";
import { openInFileManager } from "./server/open-in-file-manager";
import { openInFileManagerRpc, pluginHostRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  server.handle(openInFileManagerRpc, openInFileManager);
  server.handle(pluginHostRpc, async (_input, { paseo }) => {
    const { self } = await paseo.hosts.list();
    return { serverId: self.serverId };
  });
  return () => {};
}
