import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, type ColorTokens } from "./tokens";

export type ThemePreference = "system" | "dark" | "light";
export type ResolvedScheme = "dark" | "light";

const THEME_KEY = "voxiva.space.theme";

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ResolvedScheme;
  colors: ColorTokens;
  setPreference: (next: ThemePreference) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function loadPreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (raw === "system" || raw === "dark" || raw === "light") return raw;
  } catch {
    // ignore
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadPreference().then((next) => {
      setPreferenceState(next);
      setReady(true);
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(THEME_KEY, next);
  }, []);

  const scheme: ResolvedScheme =
    preference === "system" ? (system === "light" ? "light" : "dark") : preference;

  const colors = scheme === "light" ? lightColors : darkColors;

  const value = useMemo(
    () => ({ preference, scheme, colors, setPreference, ready }),
    [preference, scheme, colors, setPreference, ready],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
