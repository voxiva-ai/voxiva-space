import { invoke } from "@/platform/desktop";

export function browserOpen(args: {
  label: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  navigate?: boolean;
}) {
  return invoke("browser_open", {
    label: args.label,
    url: args.url,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    navigate: args.navigate ?? true,
  });
}

export function browserSetBounds(args: {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return invoke("browser_set_bounds", args);
}

export function browserNavigate(label: string, url: string) {
  return invoke("browser_navigate", { label, url });
}

export function browserReload(label: string) {
  return invoke("browser_reload", { label });
}

export function browserHide(label: string) {
  return invoke("browser_hide", { label });
}

export function browserClose(label: string) {
  return invoke("browser_close", { label });
}

export function browserHideAll() {
  return invoke("browser_hide_all");
}

export function browserCloseAll(except?: string) {
  return invoke("browser_close_all", { except: except ?? null });
}

export function browserOpenDevtools(label: string) {
  return invoke("browser_open_devtools", { label });
}

export type BrowserPageMeta = {
  title: string;
  favicon: string;
};

export function browserPageMeta(label: string) {
  return invoke<BrowserPageMeta>("browser_page_meta", { label });
}

export function browserToggleInspector(label: string, enabled: boolean) {
  return invoke<boolean>("browser_toggle_inspector", { label, enabled });
}

export type BrowserSelection = {
  pageUrl: string;
  component: string;
  selector: string;
  tag: string;
  id: string;
  classes: string[];
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  computedStyles: Record<string, string>;
  html: string;
  xpath?: string;
};

export type BrowserInspectorAction = {
  selection: BrowserSelection;
  instruction: string;
  agentId: string;
};

export type BrowserInspectorEvent = {
  selection: BrowserSelection | null;
  action: BrowserInspectorAction | null;
  /** True when the in-page brush turned itself off (second press on active mode). */
  disabled?: boolean;
};

export function browserTakeInspectorEvent(label: string) {
  return invoke<BrowserInspectorEvent | null>("browser_take_selection", { label });
}

export type BrushSnapshotSelection = {
  id: string;
  index: number;
  letter: string;
  color: string;
  label: string;
  selection: BrowserSelection;
  files: string[];
};

export type BrushSnapshot = {
  v?: number;
  enabled: boolean;
  mode?: string;
  open?: boolean;
  note?: string;
  lastError?: string;
  paste?: string;
  selections: BrushSnapshotSelection[];
};

export function browserInspectorSnapshot(label: string) {
  return invoke<BrushSnapshot>("browser_inspector_snapshot", { label });
}

export function browserConfigureInspector(
  label: string,
  agents: Array<{ id: string; name: string }>,
  files: string[] = [],
) {
  return invoke("browser_configure_inspector", { label, agents, files });
}

export function writeAnnotateContext(content: string) {
  return invoke<string>("write_annotate_context", { content });
}

export type CookieImportSource = {
  id: string;
  label: string;
};

export type BrowserImportCookiesResult = {
  imported: number;
  skipped: number;
  source: string;
};

export function browserListCookieSources() {
  return invoke<CookieImportSource[]>("browser_list_cookie_sources");
}

export function browserImportCookies(from: string, domains?: string[]) {
  return invoke<BrowserImportCookiesResult>("browser_import_cookies", {
    request: {
      from,
      domains: domains?.length ? domains : null,
    },
  });
}

export function browserPasskeySupport() {
  return invoke<Record<string, boolean>>("browser_passkey_support");
}

export function findComponentFiles(
  workspaceRoot: string,
  selection: Pick<BrowserSelection, "component" | "classes" | "text">,
) {
  return invoke<string[]>("find_component_files", {
    workspaceRoot,
    component: selection.component,
    classes: selection.classes,
    text: selection.text,
  });
}
