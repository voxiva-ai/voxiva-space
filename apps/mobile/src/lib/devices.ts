import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PairSession } from "../types";

export type Device = PairSession & {
  id: string;
  name: string;
};

const DEVICES_KEY = "voxiva.space.devices";
const ACTIVE_KEY = "voxiva.space.activeDevice";

export async function loadDevices(): Promise<Device[]> {
  try {
    const raw = await AsyncStorage.getItem(DEVICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Device[];
    return Array.isArray(parsed) ? parsed.filter((d) => d?.host && d?.token) : [];
  } catch {
    return [];
  }
}

export async function saveDevices(devices: Device[]) {
  await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

export async function loadActiveDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_KEY);
}

export async function saveActiveDeviceId(id: string | null) {
  if (!id) await AsyncStorage.removeItem(ACTIVE_KEY);
  else await AsyncStorage.setItem(ACTIVE_KEY, id);
}

export async function upsertDevice(session: PairSession, name?: string): Promise<Device> {
  const devices = await loadDevices();
  const existing = devices.find((d) => d.host === session.host && d.token === session.token);
  const hostLabel = (() => {
    try {
      return new URL(session.host).hostname;
    } catch {
      return "Space";
    }
  })();
  if (existing) {
    const next = {
      ...existing,
      ...session,
      name: name || existing.name || hostLabel,
      pairedAt: Date.now(),
    };
    await saveDevices(devices.map((d) => (d.id === existing.id ? next : d)));
    await saveActiveDeviceId(next.id);
    return next;
  }
  const device: Device = {
    ...session,
    id: `dev-${Date.now()}`,
    name: name || hostLabel,
    pairedAt: Date.now(),
  };
  await saveDevices([...devices, device]);
  await saveActiveDeviceId(device.id);
  return device;
}

export async function removeDevice(id: string) {
  const devices = (await loadDevices()).filter((d) => d.id !== id);
  await saveDevices(devices);
  const active = await loadActiveDeviceId();
  if (active === id) await saveActiveDeviceId(devices[0]?.id ?? null);
}

/** Migrate old single-session key if present. */
export async function migrateLegacySession(): Promise<Device | null> {
  try {
    const raw = await AsyncStorage.getItem("voxiva.space.pair");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PairSession;
    if (!parsed?.host || !parsed?.token) return null;
    const device = await upsertDevice(parsed, "My Space");
    await AsyncStorage.removeItem("voxiva.space.pair");
    return device;
  } catch {
    return null;
  }
}
