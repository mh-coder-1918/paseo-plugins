import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginWorkspacePanelProps, useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  type LayoutChangeEvent,
  PixelRatio,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { listPdfsRpc, pdfInfoRpc, renderPageRpc } from "../shared/pdf";
import { setSelectedPdf, useSelectedPdf } from "./selection";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function createStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    toolbar: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 8,
      padding: compact ? 8 : 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface1,
    },
    input: {
      flex: 1,
      minWidth: 160,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderRadius: 6,
      borderColor: colors.border,
      backgroundColor: colors.surface0,
      color: colors.foreground,
    },
    button: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.surface2,
    },
    primaryButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.accent,
    },
    buttonText: { color: colors.foreground },
    primaryButtonText: { color: colors.accentForeground },
    disabled: { opacity: 0.4 },
    title: { flex: 1, minWidth: 80, color: colors.foreground, fontWeight: "600" as const },
    label: { color: colors.foregroundMuted },
    message: { padding: compact ? 16 : 24, gap: 8 },
    error: { color: colors.statusDanger },
    row: {
      paddingHorizontal: compact ? 12 : 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowTitle: { color: colors.foreground },
    rowSubtitle: { color: colors.foregroundMuted, fontSize: 12 },
    page: { padding: compact ? 8 : 16, alignItems: "center" as const },
    pageImage: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: colors.border },
  };
}

type Styles = ReturnType<typeof createStyles>;

function ToolbarButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  styles,
}: {
  label: string;
  accessibilityLabel: string;
  onPress(): void;
  disabled?: boolean;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function FilePicker({
  directory,
  onOpen,
  styles,
}: {
  directory: string | null;
  onOpen(path: string): void;
  styles: Styles;
}) {
  const listPdfs = useRpc(listPdfsRpc);
  const [path, setPath] = useState("");
  const files = useQuery({
    queryKey: ["pdf.list", directory],
    queryFn: () => listPdfs({ root: directory ?? "" }),
    enabled: Boolean(directory),
  });

  const submit = () => {
    if (path.trim()) onOpen(path.trim());
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <TextInput
          accessibilityLabel="PDF path"
          placeholder="/absolute/path/to/file.pdf or ~/Documents/file.pdf"
          placeholderTextColor={styles.label.color}
          value={path}
          onChangeText={setPath}
          onSubmitEditing={submit}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open PDF at path"
          disabled={!path.trim()}
          onPress={submit}
          style={[styles.primaryButton, !path.trim() && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>Open</Text>
        </Pressable>
        <ToolbarButton
          label="Refresh"
          accessibilityLabel="Rescan workspace for PDFs"
          onPress={() => void files.refetch()}
          styles={styles}
        />
      </View>
      {files.isPending && directory ? (
        <View style={styles.message}>
          <ActivityIndicator color={styles.label.color} />
        </View>
      ) : files.isError ? (
        <View style={styles.message}>
          <Text style={styles.error}>{errorMessage(files.error)}</Text>
        </View>
      ) : (
        <FlatList
          data={files.data?.files ?? []}
          keyExtractor={(file) => file.path}
          ListHeaderComponent={
            <View style={styles.message}>
              <Text style={styles.label}>
                {files.data?.files.length
                  ? `PDFs in ${directory}${files.data.truncated ? " (first 500)" : ""}`
                  : `No PDFs found in ${directory ?? "this workspace"}. Enter a path above.`}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.relativePath}`}
              onPress={() => onOpen(item.path)}
              style={styles.row}
            >
              <Text style={styles.rowTitle}>{item.relativePath.split("/").pop()}</Text>
              <Text style={styles.rowSubtitle}>{item.relativePath}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Document({
  path,
  onClose,
  styles,
}: {
  path: string;
  onClose(): void;
  styles: Styles;
}) {
  const pdfInfo = useRpc(pdfInfoRpc);
  const renderPage = useRpc(renderPageRpc);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1));
  const [viewportWidth, setViewportWidth] = useState(0);

  const info = useQuery({ queryKey: ["pdf.info", path], queryFn: () => pdfInfo({ path }) });
  const pageCount = info.data?.pageCount ?? 0;
  const zoom = ZOOM_STEPS[zoomIndex];
  const displayWidth = Math.max(200, Math.floor(viewportWidth * zoom));
  // Round the bitmap width so small resizes reuse cached renders.
  const renderWidth = Math.min(3000, Math.max(200, Math.ceil((displayWidth * PixelRatio.get()) / 100) * 100));

  const pageQuery = (index: number) => ({
    queryKey: ["pdf.page", path, index, renderWidth],
    queryFn: () => renderPage({ path, page: index, width: renderWidth }),
    staleTime: Infinity,
  });
  const image = useQuery({ ...pageQuery(page), enabled: Boolean(info.data) && viewportWidth > 0 });

  useEffect(() => {
    if (image.data && page + 1 < pageCount) void queryClient.prefetchQuery(pageQuery(page + 1));
  }, [image.data, page, pageCount]);

  const onLayout = (event: LayoutChangeEvent) => {
    const padding = 32;
    setViewportWidth(Math.max(0, event.nativeEvent.layout.width - padding));
  };

  const name = path.split("/").pop() ?? path;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <ToolbarButton label="‹ Files" accessibilityLabel="Back to PDF list" onPress={onClose} styles={styles} />
        <Text style={styles.title} numberOfLines={1}>
          {name}
        </Text>
        <ToolbarButton
          label="‹"
          accessibilityLabel="Previous page"
          disabled={page <= 0}
          onPress={() => setPage((value) => Math.max(0, value - 1))}
          styles={styles}
        />
        <Text style={styles.label}>{pageCount ? `${page + 1} / ${pageCount}` : "–"}</Text>
        <ToolbarButton
          label="›"
          accessibilityLabel="Next page"
          disabled={page + 1 >= pageCount}
          onPress={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          styles={styles}
        />
        <ToolbarButton
          label="−"
          accessibilityLabel="Zoom out"
          disabled={zoomIndex <= 0}
          onPress={() => setZoomIndex((value) => Math.max(0, value - 1))}
          styles={styles}
        />
        <Text style={styles.label}>{Math.round(zoom * 100)}%</Text>
        <ToolbarButton
          label="+"
          accessibilityLabel="Zoom in"
          disabled={zoomIndex >= ZOOM_STEPS.length - 1}
          onPress={() => setZoomIndex((value) => Math.min(ZOOM_STEPS.length - 1, value + 1))}
          styles={styles}
        />
      </View>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        {info.isError || image.isError ? (
          <View style={styles.message}>
            <Text style={styles.error}>{errorMessage(info.error ?? image.error)}</Text>
          </View>
        ) : !image.data ? (
          <View style={styles.message}>
            <ActivityIndicator color={styles.label.color} />
          </View>
        ) : (
          <ScrollView>
            <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
              <View style={styles.page}>
                <Image
                  accessibilityLabel={`${name}, page ${page + 1}`}
                  source={{ uri: `data:image/jpeg;base64,${image.data.jpeg}` }}
                  style={[
                    styles.pageImage,
                    { width: displayWidth, height: Math.round((displayWidth * image.data.height) / image.data.width) },
                  ]}
                />
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

export function PdfViewerPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const path = useSelectedPdf(workspaceId);
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);

  return (
    <View style={styles.screen}>
      {path ? (
        <Document key={path} path={path} onClose={() => setSelectedPdf(workspaceId, null)} styles={styles} />
      ) : (
        <FilePicker directory={directory} onOpen={(next) => setSelectedPdf(workspaceId, next)} styles={styles} />
      )}
    </View>
  );
}

/** The Explorer list: picking a PDF opens it in the viewer tab of the main pane. */
export function createPdfFilesPanel(openViewer: (workspaceId: string) => void) {
  return function PdfFilesPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
    const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);
    const styles = useMemo(() => createStyles(theme, true), [theme]);

    return (
      <View style={styles.screen}>
        <FilePicker
          directory={directory}
          onOpen={(path) => {
            setSelectedPdf(workspaceId, path);
            openViewer(workspaceId);
          }}
          styles={styles}
        />
      </View>
    );
  };
}
