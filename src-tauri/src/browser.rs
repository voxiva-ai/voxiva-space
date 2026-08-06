//! Embedded WebView2 browser and visual element inspector.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl,
};

#[derive(Default)]
pub struct BrowserRegistry {
    /// label → allowed to show (false after hide; set_bounds must not re-show)
    labels: Mutex<HashMap<String, bool>>,
}

#[derive(Clone, Serialize)]
struct BrowserLoadPayload {
    label: String,
    url: String,
    state: &'static str,
}

const INSPECTOR_SCRIPT: &str = r#"
(() => {
  if (window.__voxivaInspector) return;

  const state = {
    enabled: false,
    hovered: null,
    selected: null,
    pending: null,
    pendingAction: null,
    agents: [],
    files: []
  };
  const root = document.createElement("div");
  root.id = "__voxiva-inspector";
  root.style.cssText = "all:initial;display:none;position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,Segoe UI,sans-serif;color:#eef2ff";

  const box = document.createElement("div");
  box.style.cssText = "display:none;position:fixed;pointer-events:none;border:1px solid rgba(100,168,255,.55);background:rgba(77,157,255,.06);box-sizing:border-box;border-radius:3px";

  const badge = document.createElement("div");
  badge.style.cssText = "display:none;position:fixed;pointer-events:none;padding:3px 7px;border-radius:5px;background:rgba(20,28,42,.92);color:#dce6f5;font:600 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;border:1px solid rgba(100,168,255,.28);box-shadow:none;white-space:nowrap";

  const panel = document.createElement("div");
  panel.style.cssText = "display:none;position:fixed;right:12px;bottom:12px;width:min(340px,calc(100vw - 24px));max-height:min(420px,calc(100vh - 24px));overflow:auto;pointer-events:auto;padding:12px;border:1px solid rgba(100,168,255,.22);border-radius:14px;background:rgba(7,9,13,.97);color:#f4f7fb;box-shadow:0 18px 55px rgba(0,0,0,.5);font:13px/1.4 Inter,Segoe UI,sans-serif";

  root.append(box, badge, panel);

  function mount() {
    if (!document.documentElement) {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
      return;
    }
    if (!document.documentElement.contains(root)) document.documentElement.appendChild(root);
  }

  function elementName(el) {
    if (!el) return "";
    let component = "";
    try {
      const key = Object.keys(el).find((name) => name.startsWith("__reactFiber$"));
      let fiber = key ? el[key] : null;
      while (fiber && !component) {
        const type = fiber.type;
        if (typeof type === "function") component = type.displayName || type.name || "";
        else if (type && typeof type === "object") component = type.displayName || type.render?.displayName || type.render?.name || "";
        fiber = fiber.return;
      }
    } catch (_) {}
    return component || el.tagName?.toLowerCase() || "element";
  }

  function selector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      const classes = [...node.classList].slice(0, 3);
      if (classes.length) part += "." + classes.map((name) => CSS.escape(name)).join(".");
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((item) => item.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  function contextFor(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const styles = {};
    for (const name of ["display","position","width","height","margin","padding","gap","color","background","font-family","font-size","font-weight","line-height","border","border-radius","box-shadow","align-items","justify-content","grid-template-columns"]) {
      styles[name] = style.getPropertyValue(name);
    }
    return {
      pageUrl: location.href,
      component: elementName(el),
      selector: selector(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      classes: [...el.classList],
      text: (el.innerText || el.textContent || "").trim().slice(0, 800),
      boundingBox: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      computedStyles: styles,
      html: el.outerHTML.slice(0, 20000)
    };
  }

  function position(el) {
    if (!el || !el.isConnected) {
      box.style.display = badge.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    badge.textContent = `${elementName(el)}  ${Math.round(rect.width)}×${Math.round(rect.height)}`;
    badge.style.display = "block";
    badge.style.left = `${Math.max(4, Math.min(rect.left, innerWidth - badge.offsetWidth - 4))}px`;
    badge.style.top = `${rect.top > 28 ? rect.top - 26 : Math.min(innerHeight - 24, rect.bottom + 4)}px`;
  }

  function showSelection(el) {
    state.selected = el;
    state.files = [];
    const data = contextFor(el);
    state.pending = data;
    panel.innerHTML = "";
    const heading = document.createElement("div");
    heading.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px";
    const title = document.createElement("strong");
    title.style.cssText = "font:700 14px/1.3 Inter,Segoe UI,sans-serif;color:#fff";
    title.textContent = data.component;
    const close = document.createElement("button");
    close.textContent = "×";
    close.title = "Close";
    close.style.cssText = "all:initial;cursor:pointer;color:#8b93a7;font:22px/1 Inter,Segoe UI,sans-serif;padding:2px 5px";
    close.onclick = () => {
      state.selected = null;
      panel.style.display = box.style.display = badge.style.display = "none";
    };
    heading.append(title, close);

    const meta = document.createElement("div");
    meta.style.cssText = "color:#8b93a7;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;margin-bottom:10px";
    meta.textContent = data.selector;

    const size = document.createElement("div");
    size.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;color:#c8d0e0;font:12px/1.35 Inter,Segoe UI,sans-serif";
    size.textContent = `${data.boundingBox.width} × ${data.boundingBox.height}  ·  ${data.tag}`;

    const files = document.createElement("div");
    files.id = "__voxiva-inspector-files";
    files.style.cssText = "margin-bottom:9px;color:#8b93a7;font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-word";
    files.textContent = state.files.length ? state.files.join(" · ") : "Finding related file…";

    const prompt = document.createElement("textarea");
    prompt.placeholder = "What should change in this component?";
    prompt.style.cssText = "all:initial;display:block;box-sizing:border-box;width:100%;min-height:64px;padding:9px 10px;border:1px solid rgba(100,168,255,.28);border-radius:10px;background:#0c1017;color:#f4f7fb;font:13px/1.4 Inter,Segoe UI,sans-serif;resize:vertical";

    const actions = document.createElement("div");
    actions.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px";
    const agent = document.createElement("select");
    agent.style.cssText = "box-sizing:border-box;min-width:0;height:34px;padding:0 10px;border:1px solid rgba(100,168,255,.28);border-radius:9px;background:#0c1017;color:#f4f7fb;font:12px Inter,Segoe UI,sans-serif";
    const renderAgents = () => {
      agent.innerHTML = "";
      for (const item of state.agents) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        agent.append(option);
      }
    };
    renderAgents();
    state.renderAgents = renderAgents;
    const send = document.createElement("button");
    send.textContent = "Send";
    send.style.cssText = "all:initial;cursor:pointer;padding:9px 14px;border-radius:9px;background:#2d5bff;color:white;font:600 12px/1 Inter,Segoe UI,sans-serif;box-shadow:none";
    send.onclick = () => {
      const instruction = prompt.value.trim();
      if (!instruction || !agent.value) {
        prompt.focus();
        return;
      }
      state.pendingAction = { selection: data, instruction, agentId: agent.value };
      send.textContent = "Sent";
      setTimeout(() => { send.textContent = "Send"; }, 1200);
    };
    const copy = document.createElement("button");
    copy.textContent = "Copy context";
    copy.style.cssText = "all:initial;grid-column:1/-1;cursor:pointer;color:#64a8ff;font:600 11px/1 Inter,Segoe UI,sans-serif";
    copy.onclick = async () => {
      const payload = JSON.stringify({ ...data, instruction: prompt.value.trim() }, null, 2);
      try {
        await navigator.clipboard.writeText(payload);
        copy.textContent = "Copied";
      } catch (_) {
        prompt.value = payload;
        prompt.select();
        document.execCommand("copy");
        copy.textContent = "Copied";
      }
      setTimeout(() => { copy.textContent = "Copy context"; }, 1200);
    };
    actions.append(agent, send, copy);
    panel.append(heading, meta, size, files, prompt, actions);
    panel.style.display = "block";
    prompt.focus();
  }

  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && !root.contains(el) ? el : null;
  }

  function onMove(event) {
    if (!state.enabled || panel.contains(event.target)) return;
    if (state.selected) return;
    state.hovered = targetAt(event.clientX, event.clientY);
    position(state.hovered);
  }

  function onClick(event) {
    if (!state.enabled || panel.contains(event.target)) return;
    const el = targetAt(event.clientX, event.clientY);
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    position(el);
    showSelection(el);
  }

  function onKey(event) {
    if (event.key === "F12") {
      event.preventDefault();
      event.stopPropagation();
      api.toggle();
      return;
    }
    if (state.enabled && event.key === "Escape") api.setEnabled(false);
  }

  const api = {
    setEnabled(enabled) {
      mount();
      state.enabled = Boolean(enabled);
      root.style.display = state.enabled ? "block" : "none";
      if (!state.enabled) {
        state.hovered = state.selected = null;
        box.style.display = badge.style.display = panel.style.display = "none";
      }
      return state.enabled;
    },
    toggle() { return api.setEnabled(!state.enabled); },
    configure(agents, files) {
      state.agents = Array.isArray(agents) ? agents : state.agents;
      state.files = Array.isArray(files) ? files : state.files;
      if (state.renderAgents) state.renderAgents();
      const filesNode = document.getElementById("__voxiva-inspector-files");
      if (filesNode) {
        filesNode.textContent = state.files.length
          ? state.files.join(" · ")
          : "Related file not found";
      }
    },
    takeEvent() {
      if (!state.pending && !state.pendingAction) return null;
      const value = { selection: state.pending, action: state.pendingAction };
      state.pending = null;
      state.pendingAction = null;
      return value;
    }
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  addEventListener("scroll", () => position(state.selected || state.hovered), true);
  addEventListener("resize", () => position(state.selected || state.hovered), true);
  window.__voxivaInspector = api;
  mount();
})();
"#;

fn parse_external_url(raw: &str) -> Result<url::Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("URL is empty".into());
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("file:") {
        return trimmed
            .parse::<url::Url>()
            .map_err(|e| format!("Invalid file URL: {e}"));
    }
    let has_scheme = lower.starts_with("http://") || lower.starts_with("https://");
    let with_scheme = if has_scheme {
        trimmed.to_string()
    } else {
        let host = trimmed.split('/').next().unwrap_or(trimmed);
        let host_only = host.split(':').next().unwrap_or(host);
        let local = matches!(host_only, "localhost" | "127.0.0.1" | "[::1]" | "::1");
        format!("{}://{trimmed}", if local { "http" } else { "https" })
    };
    let parsed = with_scheme
        .parse::<url::Url>()
        .map_err(|e| format!("Invalid URL: {e}"))?;
    Ok(parsed)
}

fn mark_visible(registry: &BrowserRegistry, label: &str, visible: bool) -> Result<(), String> {
    registry
        .labels
        .lock()
        .map_err(|e| e.to_string())?
        .insert(label.to_string(), visible);
    Ok(())
}

#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    registry: State<'_, BrowserRegistry>,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    navigate: Option<bool>,
) -> Result<(), String> {
    let parsed = parse_external_url(&url)?;
    let should_navigate = navigate.unwrap_or(true);
    let position = LogicalPosition::new(x, y);
    let size = LogicalSize::new(width.max(1.0), height.max(1.0));

    if let Some(existing) = app.get_webview(&label) {
        existing.set_position(position).map_err(|e| e.to_string())?;
        existing.set_size(size).map_err(|e| e.to_string())?;
        if should_navigate {
            existing
                .navigate(parsed)
                .map_err(|e| format!("Navigate failed: {e}"))?;
        }
        mark_visible(&registry, &label, true)?;
        existing.show().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let main = app
        .get_window("main")
        .ok_or_else(|| "Main window missing".to_string())?;
    let load_app = app.clone();
    let load_label = label.clone();
    let popup_app = app.clone();
    let popup_label = label.clone();
    let webview = main
        .add_child(
            WebviewBuilder::new(&label, WebviewUrl::External(parsed))
                .initialization_script(INSPECTOR_SCRIPT)
                // Real Chromium DevTools (separate OS window). In-app side panel
                // is the Simux-style dock; WebView2 cannot embed DevTools UI.
                .devtools(true)
                // Allow about:/data: — WebView2 uses about:blank during load; blocking it = white page.
                .on_navigation(|nav_url| {
                    matches!(
                        nav_url.scheme(),
                        "http"
                            | "https"
                            | "file"
                            | "about"
                            | "data"
                            | "blob"
                            | "edge-error"
                            | "chrome-error"
                            | "res"
                    )
                })
                .on_new_window(move |url, _features| {
                    let _ = popup_app.emit(
                        "browser://new-window",
                        BrowserLoadPayload {
                            label: popup_label.clone(),
                            url: url.to_string(),
                            state: "started",
                        },
                    );
                    NewWindowResponse::Deny
                })
                .on_page_load(move |_webview, payload| {
                    let state = match payload.event() {
                        PageLoadEvent::Started => "started",
                        PageLoadEvent::Finished => "finished",
                    };
                    let _ = load_app.emit(
                        "browser://load",
                        BrowserLoadPayload {
                            label: load_label.clone(),
                            url: payload.url().to_string(),
                            state,
                        },
                    );
                }),
            position,
            size,
        )
        .map_err(|e| format!("Failed to embed browser: {e}"))?;

    mark_visible(&registry, &label, true)?;
    webview.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_set_bounds(
    app: AppHandle,
    registry: State<'_, BrowserRegistry>,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let Some(webview) = app.get_webview(&label) else {
        return Ok(());
    };
    let visible = registry
        .labels
        .lock()
        .map_err(|e| e.to_string())?
        .get(&label)
        .copied()
        .unwrap_or(false);
    if !visible {
        return Ok(());
    }
    if width < 8.0 || height < 8.0 {
        webview.hide().map_err(|e| e.to_string())?;
        return Ok(());
    }
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    let parsed = parse_external_url(&url)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open".to_string())?;
    webview
        .navigate(parsed)
        .map_err(|e| format!("Navigate failed: {e}"))
}

#[tauri::command]
pub async fn browser_reload(app: AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open".to_string())?;
    webview.reload().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_hide(
    app: AppHandle,
    registry: State<'_, BrowserRegistry>,
    label: String,
) -> Result<(), String> {
    mark_visible(&registry, &label, false)?;
    if let Some(webview) = app.get_webview(&label) {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_close(
    app: AppHandle,
    registry: State<'_, BrowserRegistry>,
    label: String,
) -> Result<(), String> {
    mark_visible(&registry, &label, false)?;
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    registry
        .labels
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&label);
    Ok(())
}

#[tauri::command]
pub async fn browser_open_devtools(app: AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open — open a site first".to_string())?;
    webview.open_devtools();
    Ok(())
}

#[tauri::command]
pub async fn browser_toggle_inspector(
    app: AppHandle,
    label: String,
    enabled: bool,
) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open — open a site first".to_string())?;
    let script = format!(
        "window.__voxivaInspector?.setEnabled({});",
        if enabled { "true" } else { "false" }
    );
    webview.eval(&script).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_take_selection(
    app: AppHandle,
    label: String,
) -> Result<Option<serde_json::Value>, String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open".to_string())?;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    webview
        .eval_with_callback(
            "window.__voxivaInspector?.takeEvent?.() ?? null",
            move |value| {
                let _ = sender.send(value);
            },
        )
        .map_err(|e| e.to_string())?;
    let raw = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(std::time::Duration::from_millis(600))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "Element selection timed out".to_string())?;
    if raw.len() > 100_000 {
        return Err("Selected element context is too large".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Invalid element context: {e}"))?;
    Ok((!value.is_null()).then_some(value))
}

#[tauri::command]
pub async fn browser_configure_inspector(
    app: AppHandle,
    label: String,
    agents: serde_json::Value,
    files: Vec<String>,
) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open".to_string())?;
    let agents = serde_json::to_string(&agents).map_err(|e| e.to_string())?;
    let files = serde_json::to_string(&files).map_err(|e| e.to_string())?;
    webview
        .eval(format!(
            "window.__voxivaInspector?.configure?.({agents}, {files})"
        ))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_hide_all(
    app: AppHandle,
    registry: State<'_, BrowserRegistry>,
) -> Result<(), String> {
    {
        let mut map = registry.labels.lock().map_err(|e| e.to_string())?;
        for visible in map.values_mut() {
            *visible = false;
        }
    }
    for (label, webview) in app.webviews() {
        if !label.starts_with("browser-") {
            continue;
        }
        let _ = webview.set_position(LogicalPosition::new(0.0, 0.0));
        let _ = webview.set_size(LogicalSize::new(1.0, 1.0));
        let _ = webview.hide();
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_close_all(
    app: AppHandle,
    registry: State<'_, BrowserRegistry>,
    except: Option<String>,
) -> Result<(), String> {
    let keep = except.unwrap_or_default();
    {
        let mut map = registry.labels.lock().map_err(|e| e.to_string())?;
        if keep.is_empty() {
            map.clear();
        } else {
            map.retain(|label, _| label == &keep);
            if let Some(visible) = map.get_mut(&keep) {
                // keep current visibility flag
                let _ = visible;
            }
        }
    }
    let labels: Vec<String> = app
        .webviews()
        .into_keys()
        .filter(|label| label.starts_with("browser-") && label != &keep)
        .collect();
    for label in labels {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.hide();
            let _ = webview.close();
        }
        let _ = registry.labels.lock().map(|mut m| m.remove(&label));
    }
    Ok(())
}
