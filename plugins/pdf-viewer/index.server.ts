import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listPdfs, pdfInfo, renderPdfPage } from "./server/pdf";
import { listPdfsRpc, pdfInfoRpc, renderPageRpc } from "./shared/pdf";

export default function contribute(server: PluginServerContext) {
  server.handle(listPdfsRpc, listPdfs);
  server.handle(pdfInfoRpc, pdfInfo);
  server.handle(renderPageRpc, renderPdfPage);
  return () => {};
}
