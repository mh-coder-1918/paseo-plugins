import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const scheduledMessageSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  text: z.string().min(1),
  /** ISO timestamp. The app turns the local time the user picked into this. */
  sendAt: z.string(),
  createdAt: z.string(),
  status: z.enum(["pending", "sending", "failed"]),
  /** Why the last attempt failed, for a failed message. */
  error: z.string().nullable(),
});

export type ScheduledMessage = z.infer<typeof scheduledMessageSchema>;

const messagesOutput = z.object({ messages: z.array(scheduledMessageSchema) });

/** The messages waiting on this host, soonest first. Sent messages leave the list. */
export const listRpc = defineRpc({
  name: "schedule.list",
  input: z.object({}),
  output: messagesOutput,
});

export const createRpc = defineRpc({
  name: "schedule.create",
  input: z.object({
    agentId: z.string().min(1),
    text: z.string().min(1),
    sendAt: z.string(),
  }),
  output: messagesOutput,
});

/** Drops a waiting message before it goes out, or clears a failed one. */
export const cancelRpc = defineRpc({
  name: "schedule.cancel",
  input: z.object({ id: z.string().min(1) }),
  output: messagesOutput,
});
