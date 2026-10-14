import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PairSession } from "../types";

const SESSION_KEY = "voxiva.space.pair";

export async function loadSession(): Promise<PairSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PairSession;
    if (!parsed?.host || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession(session: PairSession | null) {
  if (!session) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
