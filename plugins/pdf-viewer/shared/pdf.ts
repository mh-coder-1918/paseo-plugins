import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const listPdfsRpc = defineRpc({
  name: "pdf.list",
  input: z.object({ root: z.string() }),
  output: z.object({
    files: z.array(z.object({ path: z.string(), relativePath: z.string() })),
    truncated: z.boolean(),
  }),
});

export const pdfInfoRpc = defineRpc({
  name: "pdf.info",
  input: z.object({ path: z.string() }),
  output: z.object({ path: z.string(), pageCount: z.number().int().nonnegative() }),
});

export const renderPageRpc = defineRpc({
  name: "pdf.render-page",
  input: z.object({
    path: z.string(),
    page: z.number().int().nonnegative(),
    width: z.number().int().min(200).max(3000),
  }),
  output: z.object({ width: z.number(), height: z.number(), jpeg: z.string() }),
});
