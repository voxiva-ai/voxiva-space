import { invoke as tauriInvoke, convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { getCurrentWindow as tauriWindow } from "@tauri-apps/api/window";

type ElectronBridge = {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  listen: (event: string, callback: (payload: unknown) => void) => () => void;
  getPathForFile: (file: File) => string;
};

declare global { interface Window { voxiva?: ElectronBridge } }

export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return window.voxiva ? window.voxiva.invoke(command, args) as Promise<T> : tauriInvoke<T>(command, args);
}

export function listen<T>(event: string, callback: (event: { payload: T }) => void): Promise<() => void> {
  return window.voxiva
    ? Promise.resolve(window.voxiva.listen(event, (payload) => callback({ payload: payload as T })))
    : tauriListen<T>(event, callback);
}

export function getCurrentWindow(): ReturnType<typeof tauriWindow> {
  if (!window.voxiva) return tauriWindow();
  const call = (method: string, ...args: unknown[]) => window.voxiva!.invoke(`window_${method}`, { args });
  return {
    show: () => call("show"),
    unminimize: () => call("unminimize"),
    setFocus: () => call("set_focus"),
    minimize: () => call("minimize"),
    toggleMaximize: () => call("toggle_maximize"),
    isMaximized: () => call("is_maximized"),
    close: () => call("close"),
    startDragging: () => call("start_dragging"),
    isFullscreen: () => call("is_fullscreen"),
    setFullscreen: (value: boolean) => call("set_fullscreen", value),
    setTitle: (value: string) => call("set_title", value),
    clearEffects: () => Promise.resolve(),
    scaleFactor: () => Promise.resolve(window.devicePixelRatio || 1),
    onResized: (callback: () => void) => listen("window://resized", callback),
  } as ReturnType<typeof tauriWindow>;
}

export function convertFileSrc(path: string): string {
  if (window.voxiva) return `voxiva-media://preview/${encodeURIComponent(path)}`;
  return tauriConvertFileSrc(path);
}

export function getNativeFilePath(file: File): string {
  try { return window.voxiva?.getPathForFile(file) || (file as File & { path?: string }).path || ""; }
  catch { return ""; }
}
