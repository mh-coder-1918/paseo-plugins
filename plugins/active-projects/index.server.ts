import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createLaterStore } from "./server/later-store";
import { openInFileManager } from "./server/open-in-file-manager";
import { bringBackRpc, setAsideRpc, watchLaterSubscription } from "./shared/later";
import { openInFileManagerRpc, pluginHostRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  const later = createLaterStore();
  server.handle(openInFileManagerRpc, openInFileManager);
  server.handle(pluginHostRpc, async (_input, { paseo }) => {
    const { self } = await paseo.hosts.list();
    return { serverId: self.serverId };
  });
  // Returns without a promise: a settled promise would close the subscription.
  server.handle(watchLaterSubscription, (_input, { push, signal }) => {
    const stop = later.watch((entries) => void push({ entries }));
    signal.addEventListener("abort", stop, { once: true });
    void later.list().then(push);
  });
  server.handle(setAsideRpc, (input) => later.setAside(input));
  server.handle(bringBackRpc, (input) => later.bringBack(input));
  return () => later.dispose();
}
