import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, Terminal } from "lucide-react-native";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchSessionTail, fetchSnapshot, renameSession, sendInput } from "../api";
import { KeyToolbar } from "../components/KeyToolbar";
import { RenameModal } from "../components/RenameModal";
import { IconButton, TopChrome } from "../components/ui";
import { isDemoDevice } from "../lib/demo";
import type { Device } from "../lib/devices";
import { radius, useTheme } from "../theme";
import type { SessionItem } from "../types";

type Props = {
  device: Device;
  session: SessionItem;
  onBack: () => void;
  onTitleChange?: (title: string) => void;
};

function stripAnsi(text: string) {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\x1b[()]./g, "")
    .replace(/\r/g, "");
}

function displayTitle(title: string | undefined) {
  return (title || "").trim() || "Shell";
}

export function SessionScreen({ device, session, onBack, onTitleChange }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const [title, setTitle] = useState(displayTitle(session.title));
  const [renameOpen, setRenameOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [output, setOutput] = useState(
    isDemoDevice(device)
      ? `$ ${displayTitle(session.title)}\n\n# Demo preview — pair Space via QR to stream a real PTY.\n`
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const sinceRef = useRef(0);
  const pollingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const termBg = scheme === "light" ? "#0f172a" : "#05070b";

  useEffect(() => {
    setTitle(displayTitle(session.title));
  }, [session.id, session.title]);

  useEffect(() => {
    if (isDemoDevice(device)) {
      setOnline(true);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const snap = await fetchSnapshot(device);
        if (cancelled) return;
        const live = snap.sessions.find((s) => s.id === session.id);
        if (live) {
          const next = displayTitle(live.title);
          setTitle((prev) => (prev === next ? prev : next));
        }
      } catch {
        // ignore title sync errors
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 2800);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [device, session.id]);

  useEffect(() => {
    if (isDemoDevice(device)) {
      setOnline(true);
      return;
    }
    let cancelled = false;
    sinceRef.current = 0;
    setOutput("");
    const tick = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const tail = await fetchSessionTail(device, session.id, sinceRef.current);
        if (cancelled) return;
        setOnline(true);
        if (tail.chunks.length) {
          const chunk = tail.chunks.map((c) => c.text).join("");
          setOutput((prev) => {
            const next = `${prev}${stripAnsi(chunk)}`;
            return next.length > 60_000 ? next.slice(-50_000) : next;
          });
          sinceRef.current = tail.next;
          requestAnimationFrame(() => {
            scrollRef.current?.scrollToEnd({ animated: false });
          });
        } else if (tail.next > sinceRef.current) {
          sinceRef.current = tail.next;
        }
      } catch {
        if (!cancelled) setOnline(false);
      } finally {
        pollingRef.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 700);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [device, session.id]);

  async function send(text: string) {
    if (!text || isDemoDevice(device)) {
      if (isDemoDevice(device) && text) {
        setOutput((prev) => `${prev}${text}`);
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendInput(device, session.id, text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await send(text.endsWith("\n") ? text : `${text}\n`);
  }

  async function commitRename(next: string) {
    const clean = next.trim() || "Shell";
    setRenameOpen(false);
    setTitle(clean);
    onTitleChange?.(clean);
    if (isDemoDevice(device)) return;
    try {
      await renameSession(device, session.id, clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={8}
    >
      <TopChrome
        left={
          <View>
            <IconButton onPress={onBack}>
              <ArrowLeft size={18} color={colors.text} />
            </IconButton>
            {session.needsAttention ? (
              <View
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.brand,
                }}
              />
            ) : null}
          </View>
        }
        title={title}
        subtitle={online ? undefined : "offline"}
        right={
          <IconButton onPress={() => setRenameOpen(true)}>
            <Terminal size={16} color={colors.textSecondary} />
          </IconButton>
        }
      />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: termBg }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {output ? (
          <Text
            style={{
              color: "#d7deea",
              fontFamily: Platform.select({
                ios: "Menlo",
                android: "monospace",
                default: "monospace",
              }),
              fontSize: 12.5,
              lineHeight: 18,
            }}
          >
            {output}
          </Text>
        ) : (
          <Text style={{ color: colors.textTertiary, fontSize: 13, lineHeight: 18 }}>…</Text>
        )}
        {error ? (
          <Text style={{ color: colors.danger, marginTop: 8, fontSize: 13 }}>{error}</Text>
        ) : null}
      </ScrollView>

      <KeyToolbar onKey={(payload) => void send(payload)} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.bg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}
      >
        <TextInput
          style={{
            flex: 1,
            minHeight: 40,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: 15,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          }}
          placeholder="›"
          placeholderTextColor={colors.textTertiary}
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
          onSubmitEditing={() => void onSend()}
          returnKeyType="send"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: colors.text,
            alignItems: "center",
            justifyContent: "center",
            opacity: !draft.trim() || busy ? 0.35 : 1,
          }}
          disabled={!draft.trim() || busy}
          onPress={() => void onSend()}
        >
          <ArrowUp size={18} color={colors.bg} />
        </Pressable>
      </View>

      <RenameModal
        visible={renameOpen}
        initial={title}
        onClose={() => setRenameOpen(false)}
        onSave={(next) => void commitRename(next)}
      />
    </KeyboardAvoidingView>
  );
}
