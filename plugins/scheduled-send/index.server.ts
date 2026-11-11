import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createQueue } from "./server/queue";
import { cancelRpc, createRpc, listRpc } from "./shared/schedule";

export default function contribute(server: PluginServerContext) {
  const queue = createQueue();
  server.handle(listRpc, (_input, context) => {
    queue.attach(context);
    return queue.list();
  });
  server.handle(createRpc, (input, context) => {
    queue.attach(context);
    return queue.create(input);
  });
  server.handle(cancelRpc, (input, context) => {
    queue.attach(context);
    return queue.cancel(input.id);
  });
  // Any chat activity on this host also hands over the API, so a restarted daemon can catch up
  // on due messages without waiting for an app to connect.
  const stopHooks = [
    server.addHook("agent.turn.before", async (_payload, context) => queue.attach(context)),
    server.addHook("agent.create.after", async (_payload, context) => queue.attach(context)),
  ];
  return async () => {
    for (const stop of stopHooks) stop();
    await queue.dispose();
  };
}
