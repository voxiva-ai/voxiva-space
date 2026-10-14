import { useCallback, useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ArrowLeft, Flashlight, FlashlightOff } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { pair, parsePairUrl } from "../api";
import { IconButton, TopChrome } from "../components/ui";
import { useI18n } from "../i18n";
import { upsertDevice, loadDevices } from "../lib/devices";
import type { Device } from "../lib/devices";
import { radius, space, useTheme } from "../theme";

type Props = {
  onBack: () => void;
  onPaired: (devices: Device[], activeId: string) => void;
};

export function ScanScreen({ onBack, onPaired }: Props) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleScan = useCallback(
    async (data: string) => {
      if (locked.current || busy) return;
      const next = parsePairUrl(data);
      if (!next) {
        setError(t("scan.badQr"));
        return;
      }
      locked.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await pair(next);
        const device = await upsertDevice(next, next.name || result.lanIp || undefined);
        const list = await loadDevices();
        onPaired(list, device.id);
      } catch (e) {
        locked.current = false;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, onPaired, t],
  );

  const cameraReady = permission?.granted && Platform.OS !== "web";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopChrome
        left={
          <IconButton onPress={onBack}>
            <ArrowLeft size={18} color={colors.text} />
          </IconButton>
        }
        title={t("scan.title")}
        right={
          cameraReady ? (
            <IconButton onPress={() => setTorch((v) => !v)}>
              {torch ? (
                <Flashlight size={18} color={colors.text} />
              ) : (
                <FlashlightOff size={18} color={colors.textSecondary} />
              )}
            </IconButton>
          ) : (
            <View style={{ width: 40 }} />
          )
        }
      />

      <View
        style={{
          flex: 1,
          marginHorizontal: space.lg,
          marginBottom: space.lg,
          borderRadius: radius.xl,
          overflow: "hidden",
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}
      >
        {cameraReady ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              void handleScan(data);
            }}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: space.xl,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 17,
                fontWeight: "700",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {!permission?.granted ? t("scan.web") : t("scan.web")}
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 14,
                lineHeight: 20,
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              {t("scan.webHint")}
            </Text>
            {!permission?.granted ? (
              <Pressable
                style={{
                  backgroundColor: colors.text,
                  borderRadius: 14,
                  paddingVertical: 14,
                  paddingHorizontal: 22,
                }}
                onPress={() => void requestPermission()}
              >
                <Text style={{ color: colors.bg, fontWeight: "700", fontSize: 15 }}>
                  Camera
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {cameraReady ? (
          <View
            style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}
            pointerEvents="none"
          >
            <View
              style={{
                width: 220,
                height: 220,
                borderRadius: 24,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.85)",
              }}
            />
            <Text
              style={{
                marginTop: 20,
                color: "#fff",
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {busy ? "…" : "QR"}
            </Text>
          </View>
        ) : null}
      </View>

      {error ? (
        <Text
          style={{
            color: colors.danger,
            textAlign: "center",
            paddingHorizontal: space.lg,
            paddingBottom: space.lg,
            fontSize: 13,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
