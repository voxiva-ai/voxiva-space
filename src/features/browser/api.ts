import { invoke } from "@tauri-apps/api/core";

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

export function browserToggleInspector(label: string, enabled: boolean) {
  return invoke("browser_toggle_inspector", { label, enabled });
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
};

export type BrowserInspectorAction = {
  selection: BrowserSelection;
  instruction: string;
  agentId: string;
};

export type BrowserInspectorEvent = {
  selection: BrowserSelection | null;
  action: BrowserInspectorAction | null;
};

export function browserTakeInspectorEvent(label: string) {
  return invoke<BrowserInspectorEvent | null>("browser_take_selection", { label });
}

export function browserConfigureInspector(
  label: string,
  agents: Array<{ id: string; name: string }>,
  files: string[] = [],
) {
  return invoke("browser_configure_inspector", { label, agents, files });
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
