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
    pub(crate) labels: Mutex<HashMap<String, bool>>,
}

#[derive(Clone, Serialize)]
struct BrowserLoadPayload {
    label: String,
    url: String,
    state: &'static str,
}

#[derive(Clone, Serialize)]
pub struct BrowserPageMeta {
    pub title: String,
    pub favicon: String,
}

const INSPECTOR_SCRIPT: &str = include_str!("inspector/inject.js");
/// Bump when inject.js ships a behavior change so cargo always relinks.
const INSPECTOR_VERSION: u32 = 34;
const _INSPECTOR_FORCE_RELINK: &str = "brush-v34-exclusive-modes";

/// WebView2 is Chromium (Edge). Args keep panes snappy like cmux/Simux browser hosts.
#[cfg(windows)]
const WEBVIEW2_CHROMIUM_ARGS: &str = concat!(
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection ",
    "--enable-features=msEdgeFluentOverlayScrollbar ",
    "--disable-backgrounding-occluded-windows ",
    "--disable-renderer-backgrounding"
);

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
        let host_only = host
            .split(':')
            .next()
            .unwrap_or(host)
            .trim_matches(|c| c == '[' || c == ']');
        let local = host_only.eq_ignore_ascii_case("localhost")
            || host_only == "127.0.0.1"
            || host_only == "::1"
            || host_only.to_ascii_lowercase().ends_with(".localhost")
            || host_only.starts_with("127.");
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
    // Start on about:blank then navigate — more reliable for localhost on WebView2
    // than creating the child already pointed at a loopback URL.
    let blank = url::Url::parse("about:blank").map_err(|e| e.to_string())?;
    let profile_dir = browser_profile_dir(&app)?;
    std::fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;
    // Child WebView2 = Chromium engine (same class of stack cmux/Simux use on Windows).
    let mut builder = WebviewBuilder::new(&label, WebviewUrl::External(blank))
                .data_directory(profile_dir)
                // Real Chromium DevTools (separate OS window).
                .devtools(true)
                // Preload Brush before page CSP can block eval — works on YouTube etc.
                .initialization_script(INSPECTOR_SCRIPT);
    #[cfg(windows)]
    {
        builder = builder.additional_browser_args(WEBVIEW2_CHROMIUM_ARGS);
    }
    let webview = main
        .add_child(
            builder
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
                    // Allow OS popup — VS Code / OAuth / account sign-in need a real window.
                    let _ = popup_app.emit(
                        "browser://new-window",
                        BrowserLoadPayload {
                            label: popup_label.clone(),
                            url: url.to_string(),
                            state: "started",
                        },
                    );
                    NewWindowResponse::Allow
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
    webview.set_position(position).map_err(|e| e.to_string())?;
    webview.set_size(size).map_err(|e| e.to_string())?;
    webview.show().map_err(|e| e.to_string())?;
    if should_navigate {
        webview
            .navigate(parsed)
            .map_err(|e| format!("Navigate failed: {e}"))?;
    }
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
pub async fn browser_page_meta(app: AppHandle, label: String) -> Result<BrowserPageMeta, String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open".to_string())?;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    webview
        .eval_with_callback(
            r#"(function(){
              try {
                const icon = document.querySelector('link[rel="icon"]')
                  || document.querySelector('link[rel="shortcut icon"]')
                  || document.querySelector('link[rel*="icon"]');
                return JSON.stringify({
                  title: (document.title || "").trim(),
                  favicon: icon && icon.href ? String(icon.href) : ""
                });
              } catch (e) {
                return JSON.stringify({ title: "", favicon: "" });
              }
            })()"#,
            move |value| {
                let _ = sender.send(value);
            },
        )
        .map_err(|e| e.to_string())?;
    let raw = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(std::time::Duration::from_millis(800))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "Page meta timed out".to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Invalid page meta: {e}"))?;
    Ok(BrowserPageMeta {
        title: value
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        favicon: value
            .get("favicon")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

async fn eval_js_bool(webview: &tauri::Webview, script: &str) -> Result<bool, String> {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    webview
        .eval_with_callback(script, move |value| {
            let _ = sender.send(value);
        })
        .map_err(|e| e.to_string())?;
    let raw = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(std::time::Duration::from_millis(4000))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "Inspector script timed out".to_string())?;
    let trimmed = raw.trim().trim_matches('"');
    Ok(trimmed == "true" || trimmed == "1")
}

pub(crate) fn browser_profile_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .resolve(
            "browser-profile",
            tauri::path::BaseDirectory::AppLocalData,
        )
        .map_err(|e| e.to_string())
}

/// Inject Brush runtime and WAIT until it reports a version (`eval` alone races setEnabled).
/// Fast path: skip the ~64KB payload when the page already has the current VERSION.
async fn ensure_inspector_script(webview: &tauri::Webview) -> Result<bool, String> {
    let probe = format!(
        "(function(){{ try {{ return Boolean(window.__voxivaInspector && window.__voxivaInspector.v === {INSPECTOR_VERSION}); }} catch(e) {{ return false; }} }})()"
    );
    if eval_js_bool(webview, &probe).await.unwrap_or(false) {
        return Ok(true);
    }
    let script = String::from("(function(){ try {\n")
        + INSPECTOR_SCRIPT
        + "\n; return Boolean(window.__voxivaInspector && window.__voxivaInspector.v); } catch (e) { console.error('[voxiva-brush]', e); return false; } })()";
    eval_js_bool(webview, &script).await
}

#[tauri::command]
pub async fn browser_toggle_inspector(
    app: AppHandle,
    label: String,
    enabled: bool,
) -> Result<bool, String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open — open a site first".to_string())?;

    for attempt in 0..5 {
        if attempt > 0 {
            let delay = 80 + attempt * 90;
            tauri::async_runtime::spawn_blocking(move || {
                std::thread::sleep(std::time::Duration::from_millis(delay));
            })
            .await
            .map_err(|e| e.to_string())?;
        }
        let injected = ensure_inspector_script(&webview).await.unwrap_or(false);
        if enabled && !injected {
            continue;
        }

        let script = if enabled {
            "(function(){ try { if (!window.__voxivaInspector?.setEnabled) return false; window.__voxivaInspector.setEnabled(true); return Boolean(window.__voxivaInspector.enabled); } catch(e) { return false; } })()".to_string()
        } else {
            // Always report success after force-off — a false return left the hit-layer forever.
            "(function(){ try { const api = window.__voxivaInspector; if (!api) return true; try { if (api.forceOff) api.forceOff(); else api.setEnabled(false); } catch (_) {} try { const h = document.getElementById('__voxiva-inspector-host'); if (h) h.style.display = 'none'; } catch (_) {} return true; } catch(e) { return true; } })()".to_string()
        };

        match eval_js_bool(&webview, &script).await {
            Ok(ok) if enabled && ok => return Ok(true),
            Ok(_) if !enabled => return Ok(true),
            Err(_) if !enabled => return Ok(true),
            _ => {}
        }
    }
    Ok(false)
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
    if raw.len() > 250_000 {
        return Err("Selected element context is too large".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Invalid element context: {e}"))?;
    Ok((!value.is_null()).then_some(value))
}

/// Live Brush state for the React chrome (optional). Inject chat is primary — cmux-style fly-in.
#[tauri::command]
pub async fn browser_inspector_snapshot(
    app: AppHandle,
    label: String,
) -> Result<serde_json::Value, String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Browser not open".to_string())?;
    let _ = ensure_inspector_script(&webview).await;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    webview
        .eval_with_callback(
            "(function(){ try { const s = window.__voxivaInspector?.snapshot?.(); return s || { enabled: false, selections: [] }; } catch (e) { return { enabled: false, selections: [], lastError: String(e) }; } })()",
            move |value| {
                let _ = sender.send(value);
            },
        )
        .map_err(|e| e.to_string())?;
    let raw = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(std::time::Duration::from_millis(800))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "Inspector snapshot timed out".to_string())?;
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or_else(|_| {
        serde_json::json!({ "enabled": false, "selections": [], "raw": raw })
    });
    Ok(value)
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
    let _ = ensure_inspector_script(&webview).await;
    let agents = serde_json::to_string(&agents).map_err(|e| e.to_string())?;
    let files = serde_json::to_string(&files).map_err(|e| e.to_string())?;
    webview
        .eval(format!(
            "(function(){{ if (!window.__voxivaInspector) return; window.__voxivaInspector.configure({agents}, {files}); }})()"
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
        .filter(|label| {
            label.starts_with("browser-")
                && label != &keep
                && !crate::browser_cookies::is_cookie_seed_label(label)
        })
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

/// Persist a design-mode handoff (cmux-style Details file) and return its path.
#[tauri::command]
pub fn write_annotate_context(content: String) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err("Empty annotation".into());
    }
    if content.len() > 500_000 {
        return Err("Annotation too large".into());
    }
    let dir = std::env::temp_dir().join("voxiva-annotate");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create annotate dir: {e}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("annotate-{stamp}.md"));
    std::fs::write(&path, content).map_err(|e| format!("Failed to write annotation: {e}"))?;
    Ok(path.display().to_string())
}
