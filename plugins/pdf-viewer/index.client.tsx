import type { PluginClientContext } from "@getpaseo/plugin/client";
import { PdfFilePanel } from "./client/pdf-file-panel";
import { createPdfFilesPanel, PdfViewerPanel } from "./client/pdf-viewer-panel";

export default function contribute(client: PluginClientContext) {
  // Paseo 0.13+ opens PDFs straight from Files; older hosts lack addFilePanel.
  if (typeof client.addFilePanel === "function") {
    client.addFilePanel({
      id: "pdf",
      title: "PDF",
      icon: "FileText",
      files: { extensions: ["pdf"] },
      Component: PdfFilePanel,
    });
  }
  client.addWorkspacePanel({
    id: "pdf-viewer",
    title: "PDF viewer",
    icon: "FileText",
    context: "workspace",
    locations: ["workspace"],
    Component: PdfViewerPanel,
  });
  client.addWorkspacePanel({
    id: "pdf-files",
    title: "PDFs",
    icon: "FileText",
    context: "workspace",
    locations: ["explorer"],
    Component: createPdfFilesPanel((workspaceId) =>
      client.openPanel("pdf-viewer", { workspaceId, location: "workspace" }),
    ),
  });
  client.addCommandCenterItem({
    id: "open-pdf-viewer",
    title: "Open PDF viewer",
    icon: "FileText",
    context: "workspace",
    keywords: ["pdf", "document", "viewer"],
    onSelect({ openPanel }) {
      openPanel("pdf-viewer");
    },
  });
  client.addCommandCenterItem({
    id: "open-pdf-files",
    title: "Show PDFs in Explorer",
    icon: "FileText",
    context: "workspace",
    keywords: ["pdf", "files", "explorer", "sidebar"],
    onSelect({ openPanel }) {
      openPanel("pdf-files", { location: "explorer" });
    },
  });
  return () => {};
}
