import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const openInFileManagerRpc = defineRpc({
  name: "workspace.open-in-file-manager",
  input: z.object({ path: z.string().min(1) }),
  output: z.object({ opened: z.boolean() }),
});
