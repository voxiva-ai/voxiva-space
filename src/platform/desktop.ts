type ElectronBridge = {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  listen: (event: string, callback: (payload: unknown) => void) => () => void;
  getPathForFile: (file: File) => string;
};

type DesktopWindow = {
  show: () => Promise<void>;
  unminimize: () => Promise<void>;
  setFocus: () => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  close: () => Promise<void>;
  startDragging: () => Promise<void>;
  isFullscreen: () => Promise<boolean>;
  setFullscreen: (value: boolean) => Promise<void>;
  setTitle: (value: string) => Promise<void>;
  clearEffects: () => Promise<void>;
  scaleFactor: () => Promise<number>;
  onResized: (callback: () => void) => Promise<() => void>;
};

declare global { interface Window { voxiva?: ElectronBridge } }

export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.voxiva) return Promise.reject(new Error("Voxiva Space desktop bridge is unavailable"));
  return window.voxiva.invoke(command, args) as Promise<T>;
}

export function listen<T>(event: string, callback: (event: { payload: T }) => void): Promise<() => void> {
  if (!window.voxiva) return Promise.resolve(() => undefined);
  return Promise.resolve(window.voxiva.listen(event, (payload) => callback({ payload: payload as T })));
}

export function getCurrentWindow(): DesktopWindow {
  const call = <T,>(method: string, ...args: unknown[]) => invoke<T>(`window_${method}`, { args });
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
    setFullscreen: (value) => call("set_fullscreen", value),
    setTitle: (value) => call("set_title", value),
    clearEffects: async () => undefined,
    scaleFactor: async () => window.devicePixelRatio || 1,
    onResized: (callback) => listen("window://resized", callback),
  };
}

export function convertFileSrc(path: string): string {
  return window.voxiva ? `voxiva-media://preview/${encodeURIComponent(path)}` : "";
}

export function getNativeFilePath(file: File): string {
  try { return window.voxiva?.getPathForFile(file) || (file as File & { path?: string }).path || ""; }
  catch { return ""; }
}
