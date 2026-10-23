import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Text, View } from "react-native";
import type { Workspace } from "./active-projects";
import { type SidebarPalette, projectColor, projectInitial } from "./look";

// Sizes from Paseo's status indicator: 6px dots, a 12px ring with a 1.5px stroke, one turn per 900ms.
const DOT = 6;
const RING = 12;
const RING_STROKE = 1.5;
const RING_PERIOD_MS = 900;
export const ICON_BOX = 16;

function StatusRing({ color }: { color: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: RING_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const ring = {
    position: "absolute" as const,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: RING_STROKE,
  };
  return (
    <View style={{ width: RING + 2, height: RING + 2, alignItems: "center", justifyContent: "center" }}>
      <View style={[ring, { borderColor: color, opacity: 0.3 }]} />
      <Animated.View
        style={[
          ring,
          { borderColor: "transparent", borderTopColor: color, opacity: 0.9, transform: [{ rotate }] },
        ]}
      />
      <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }} />
    </View>
  );
}

function Dot({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color, opacity }} />;
}

function Alert({ palette }: { palette: SidebarPalette }) {
  return (
    <View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: palette.warning,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: palette.menu, fontSize: 9, fontWeight: "700", lineHeight: 12 }}>!</Text>
    </View>
  );
}

/** The leading status of a workspace row, as in Paseo's project grouping. */
export function WorkspaceStatusIndicator({
  status,
  palette,
}: {
  status: Workspace["status"];
  palette: SidebarPalette;
}) {
  let content;
  switch (status) {
    case "running":
      content = <StatusRing color={palette.running} />;
      break;
    case "needs_input":
      content = <Alert palette={palette} />;
      break;
    case "attention":
      content = <Dot color={palette.success} />;
      break;
    case "failed":
      content = <Dot color={palette.danger} />;
      break;
    case "done":
      content = <Dot color={palette.foregroundExtraMuted} opacity={0.3} />;
      break;
  }
  return (
    <View style={{ width: ICON_BOX, height: 20, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
      {content}
    </View>
  );
}

export function ProjectAvatar({ viewKey, name }: { viewKey: string; name: string }) {
  return (
    <View
      style={{
        width: ICON_BOX,
        height: ICON_BOX,
        borderRadius: Math.round(ICON_BOX * 0.25),
        backgroundColor: projectColor(viewKey),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: "600" }}>{projectInitial(name)}</Text>
    </View>
  );
}
