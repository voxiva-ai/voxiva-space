//! Import cookies from Chrome / Edge / Firefox into the embedded browser profile.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::webview::cookie::time::{Duration as CookieDuration, OffsetDateTime};
use tauri::{
    webview::{Cookie, WebviewBuilder},
    AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewUrl,
};

use crate::browser::{browser_profile_dir, BrowserRegistry};

type RookieCookie = rookie::common::enums::Cookie;

const SEED_LABEL: &str = "browser-cookie-seed";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CookieImportSource {
    pub id: String,
    pub label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserImportCookiesRequest {
    /// chrome | edge | firefox | brave | chromium
    pub from: String,
    /// Optional host filters (e.g. "github.com"). Empty = all.
    pub domains: Option<Vec<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserImportCookiesResult {
    pub imported: u32,
    pub skipped: u32,
    pub source: String,
}

#[tauri::command]
pub fn browser_list_cookie_sources() -> Vec<CookieImportSource> {
    vec![
        CookieImportSource {
            id: "chrome".into(),
            label: "Google Chrome".into(),
        },
        CookieImportSource {
            id: "edge".into(),
            label: "Microsoft Edge".into(),
        },
        CookieImportSource {
            id: "firefox".into(),
            label: "Firefox".into(),
        },
        CookieImportSource {
            id: "brave".into(),
            label: "Brave".into(),
        },
        CookieImportSource {
            id: "chromium".into(),
            label: "Chromium".into(),
        },
    ]
}

fn domain_filters(domains: &Option<Vec<String>>) -> Option<Vec<String>> {
    let list = domains.as_ref()?;
    let cleaned: Vec<String> = list
        .iter()
        .map(|d| d.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|d| !d.is_empty())
        .collect();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn load_from_browser(from: &str, domains: Option<Vec<String>>) -> Result<Vec<RookieCookie>, String> {
    let id = from.trim().to_ascii_lowercase();
    match id.as_str() {
        "chrome" => rookie::chrome(domains).map_err(map_rookie_err),
        "edge" => rookie::edge(domains).map_err(map_rookie_err),
        "firefox" => rookie::firefox(domains).map_err(map_rookie_err),
        "brave" => rookie::brave(domains).map_err(map_rookie_err),
        "chromium" => rookie::chromium(domains).map_err(map_rookie_err),
        other => Err(format!(
            "Unknown browser '{other}'. Use chrome, edge, firefox, brave, or chromium."
        )),
    }
}

fn map_rookie_err(err: impl std::fmt::Display) -> String {
    let text = err.to_string();
    let lower = text.to_ascii_lowercase();
    if lower.contains("admin")
        || lower.contains("app-bound")
        || lower.contains("appbound")
        || lower.contains("elevation")
    {
        return format!(
            "{text} — Chrome/Edge may need the browser closed, or run Space once as admin to decrypt App-Bound cookies."
        );
    }
    if lower.contains("not found") || lower.contains("no such") || lower.contains("does not exist")
    {
        return format!("{text} — is that browser installed with a local profile?");
    }
    text
}

fn to_tauri_cookie(src: &RookieCookie) -> Option<Cookie<'static>> {
    let name = src.name.trim();
    let value = src.value.as_str();
    if name.is_empty() {
        return None;
    }
    let mut builder = Cookie::build((name.to_string(), value.to_string()));
    let domain = src.domain.trim();
    if !domain.is_empty() {
        builder = builder.domain(domain.to_string());
    }
    let path = if src.path.trim().is_empty() {
        "/"
    } else {
        src.path.trim()
    };
    builder = builder.path(path.to_string());
    if src.secure {
        builder = builder.secure(true);
    }
    if src.http_only {
        builder = builder.http_only(true);
    }
    if let Some(ts) = src.expires {
        if ts > 0 {
            if let Ok(exp) = OffsetDateTime::from_unix_timestamp(ts as i64) {
                builder = builder.expires(exp);
            }
        }
    } else {
        let exp = OffsetDateTime::now_utc() + CookieDuration::days(365);
        builder = builder.expires(exp);
    }
    Some(builder.build())
}

fn ensure_seed_webview(
    app: &AppHandle,
    registry: &BrowserRegistry,
) -> Result<tauri::Webview, String> {
    if let Some(existing) = app.get_webview(SEED_LABEL) {
        return Ok(existing);
    }
    let main = app
        .get_window("main")
        .ok_or_else(|| "Main window missing".to_string())?;
    let profile_dir = browser_profile_dir(app)?;
    std::fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;
    let blank = url::Url::parse("about:blank").map_err(|e| e.to_string())?;
    let webview = main
        .add_child(
            WebviewBuilder::new(SEED_LABEL, WebviewUrl::External(blank))
                .data_directory(profile_dir)
                .on_navigation(|nav_url| {
                    matches!(nav_url.scheme(), "http" | "https" | "about" | "data")
                }),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(1.0, 1.0),
        )
        .map_err(|e| format!("Failed to create cookie seed webview: {e}"))?;
    let _ = webview.hide();
    registry
        .labels
        .lock()
        .map_err(|e| e.to_string())?
        .insert(SEED_LABEL.to_string(), false);
    Ok(webview)
}

fn apply_cookie_to_webviews(app: &AppHandle, cookie: &Cookie<'_>) -> Result<(), String> {
    let mut wrote = false;
    let mut last_err: Option<String> = None;
    for (label, webview) in app.webviews() {
        if !(label == SEED_LABEL || label.starts_with("browser-")) {
            continue;
        }
        match webview.set_cookie(cookie.clone()) {
            Ok(()) => wrote = true,
            Err(err) => last_err = Some(err.to_string()),
        }
    }
    if wrote {
        return Ok(());
    }
    Err(last_err.unwrap_or_else(|| "No browser profile webview available".into()))
}

#[tauri::command]
pub async fn browser_import_cookies(
    app: AppHandle,
    registry: State<'_, BrowserRegistry>,
    request: BrowserImportCookiesRequest,
) -> Result<BrowserImportCookiesResult, String> {
    let from = request.from.trim().to_ascii_lowercase();
    if from.is_empty() {
        return Err("Pick a browser to import from".into());
    }
    let filters = domain_filters(&request.domains);
    let cookies = load_from_browser(&from, filters.clone())?;
    if cookies.is_empty() {
        return Err(format!(
            "No cookies found in {from}. Close that browser and try again, or narrow the domain filter."
        ));
    }

    let _seed = ensure_seed_webview(&app, &registry)?;

    let mut imported = 0u32;
    let mut skipped = 0u32;
    for raw in &cookies {
        if let Some(filters) = filters.as_ref() {
            let host = raw.domain.trim().trim_start_matches('.').to_ascii_lowercase();
            if !filters
                .iter()
                .any(|f| host == *f || host.ends_with(&format!(".{f}")))
            {
                skipped += 1;
                continue;
            }
        }
        let Some(cookie) = to_tauri_cookie(raw) else {
            skipped += 1;
            continue;
        };
        match apply_cookie_to_webviews(&app, &cookie) {
            Ok(()) => imported += 1,
            Err(_) => skipped += 1,
        }
    }

    if imported == 0 {
        return Err(format!(
            "Could not write cookies into the Space browser profile (skipped {skipped}). Try opening a browser pane first."
        ));
    }

    Ok(BrowserImportCookiesResult {
        imported,
        skipped,
        source: from,
    })
}

#[tauri::command]
pub fn browser_passkey_support() -> HashMap<&'static str, bool> {
    let mut map = HashMap::new();
    map.insert("webauthn", true);
    map.insert("httpsRequired", true);
    map.insert("localhostOk", true);
    map
}

pub fn is_cookie_seed_label(label: &str) -> bool {
    label == SEED_LABEL
}
