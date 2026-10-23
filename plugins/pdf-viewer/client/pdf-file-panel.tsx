import { type PluginFilePanelProps, useFileUrl } from "@getpaseo/plugin/client";
import { DocumentFrame, Loading } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";

/** Paseo 0.13+: opens .pdf files from Files in the browser's PDF viewer. */
export function PdfFilePanel({ theme, layout, file }: PluginFilePanelProps) {
  const url = useFileUrl(file);
  if (url.status === "loading") return <Loading />;
  if (url.status === "error") {
    return (
      <View style={{ flex: 1, padding: layout.compact ? 16 : 24, backgroundColor: theme.colors.surface0 }}>
        <Text style={{ color: theme.colors.statusDanger }}>{url.error.message}</Text>
      </View>
    );
  }
  return <DocumentFrame url={url.url} testID="pdf-viewer-document" />;
}
