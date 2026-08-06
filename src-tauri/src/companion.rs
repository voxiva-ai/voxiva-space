//! LAN bridge for the native Voxiva Space mobile app.
//! Settings QR encodes a deep link; the public website hosts the Android APK.

use serde::Serialize;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream, UdpSocket},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

pub const COMPANION_PORT: u16 = 17_847;
/// Public install gate (QR target). Not the LAN HTML UI.
const INSTALL_ORIGIN: &str = "https://voxivaai.vercel.app";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionStatus {
    pub running: bool,
    pub port: u16,
    pub lan_ip: Option<String>,
    pub token: Option<String>,
    pub paired: bool,
    /// Deep link encoded in the Settings QR (`voxiva-space://pair?...`).
    pub pair_url: Option<String>,
    /// Same as pair_url — open the installed Android app with pair payload.
    pub deep_link: Option<String>,
    /// Public website page to download the Android APK (no secrets).
    pub install_page_url: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionTaskPayload {
    title: String,
    priority: String,
    workspace_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionInputPayload {
    session_id: String,
    text: String,
}

struct Inner {
    token: String,
    paired: bool,
    workspace_id: Option<String>,
    snapshot: serde_json::Value,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct CompanionState {
    inner: Mutex<Option<Inner>>,
}

fn lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    if ip.is_loopback() || ip.is_unspecified() {
        return None;
    }
    Some(ip.to_string())
}

fn cors_ok(body: &str, status: &str, content_type: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Voxiva-Token\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn install_page_url() -> String {
    format!("{INSTALL_ORIGIN}/products/voxiva-space/mobile")
}

fn deep_link(token: &str, host: &str, port: u16) -> String {
    format!("voxiva-space://pair?t={token}&h={host}&p={port}")
}

fn read_header_token(req: &str) -> Option<String> {
    for line in req.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("x-voxiva-token:") {
            return Some(line.splitn(2, ':').nth(1)?.trim().to_string());
        }
    }
    None
}

fn parse_request(raw: &str) -> (String, String, String) {
    let mut lines = raw.split("\r\n");
    let start = lines.next().unwrap_or("");
    let mut parts = start.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_string();
    let path = parts.next().unwrap_or("/").to_string();
    let body = raw
        .split("\r\n\r\n")
        .nth(1)
        .unwrap_or("")
        .trim_end_matches('\0')
        .to_string();
    (method, path, body)
}

fn path_only(path: &str) -> &str {
    path.split('?').next().unwrap_or(path)
}

fn chrono_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn authorize(state: &CompanionState, token: Option<&str>) -> bool {
    let Ok(guard) = state.inner.lock() else {
        return false;
    };
    let Some(inner) = guard.as_ref() else {
        return false;
    };
    token == Some(inner.token.as_str())
}

fn handle(
    mut stream: TcpStream,
    app: AppHandle,
    state: Arc<CompanionState>,
    recent: Arc<Mutex<Vec<serde_json::Value>>>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(8)));
    let mut buf = vec![0u8; 32_768];
    let n = match stream.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return,
    };
    let raw = String::from_utf8_lossy(&buf[..n]).to_string();
    let (method, path_full, body) = parse_request(&raw);
    let path = path_only(&path_full);
    let header_token = read_header_token(&raw);

    let reply = if method == "OPTIONS" {
        cors_ok("", "204 No Content", "text/plain")
    } else if method == "GET" && (path == "/" || path == "/index.html") {
        // LAN root is only a tip — real installs go through the website QR.
        let tip = r#"{"ok":true,"message":"Install Voxiva Companion from the QR page, then open the app."}"#;
        cors_ok(tip, "200 OK", "application/json")
    } else if method == "GET" && path == "/api/status" {
        let status = status_snapshot(&state);
        cors_ok(
            &serde_json::to_string(&status).unwrap_or_else(|_| "{}".into()),
            "200 OK",
            "application/json",
        )
    } else if method == "POST" && path == "/api/pair" {
        let ok = {
            let guard = state.inner.lock().ok();
            if let Some(mut g) = guard {
                if let Some(inner) = g.as_mut() {
                    let provided = header_token
                        .clone()
                        .or_else(|| {
                            serde_json::from_str::<serde_json::Value>(&body)
                                .ok()
                                .and_then(|v| {
                                    v.get("token")
                                        .and_then(|t| t.as_str())
                                        .map(|s| s.to_string())
                                })
                        })
                        .unwrap_or_default();
                    if provided == inner.token {
                        inner.paired = true;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        };
        if ok {
            let _ = app.emit("companion://paired", true);
            let ip = lan_ip().unwrap_or_else(|| "127.0.0.1".into());
            cors_ok(
                &format!(r#"{{"ok":true,"lanIp":"{ip}"}}"#),
                "200 OK",
                "application/json",
            )
        } else {
            cors_ok(
                r#"{"error":"Invalid pairing token"}"#,
                "401 Unauthorized",
                "application/json",
            )
        }
    } else if method == "GET" && path == "/api/snapshot" {
        if !authorize(&state, header_token.as_deref()) {
            cors_ok(
                r#"{"error":"Unauthorized"}"#,
                "401 Unauthorized",
                "application/json",
            )
        } else {
            let snap = state
                .inner
                .lock()
                .ok()
                .and_then(|g| g.as_ref().map(|i| i.snapshot.clone()))
                .unwrap_or_else(|| serde_json::json!({ "spaces": [], "sessions": [] }));
            cors_ok(&snap.to_string(), "200 OK", "application/json")
        }
    } else if method == "GET" && path == "/api/tasks" {
        if !authorize(&state, header_token.as_deref()) {
            cors_ok(
                r#"{"error":"Unauthorized"}"#,
                "401 Unauthorized",
                "application/json",
            )
        } else {
            let tasks = recent.lock().map(|g| g.clone()).unwrap_or_default();
            cors_ok(
                &serde_json::json!({ "tasks": tasks }).to_string(),
                "200 OK",
                "application/json",
            )
        }
    } else if method == "POST" && path == "/api/tasks" {
        if !authorize(&state, header_token.as_deref()) {
            cors_ok(
                r#"{"error":"Unauthorized"}"#,
                "401 Unauthorized",
                "application/json",
            )
        } else {
            let parsed: serde_json::Value =
                serde_json::from_str(&body).unwrap_or_else(|_| serde_json::json!({}));
            let title = parsed
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if title.is_empty() {
                cors_ok(
                    r#"{"error":"Title required"}"#,
                    "400 Bad Request",
                    "application/json",
                )
            } else {
                let priority = parsed
                    .get("priority")
                    .and_then(|v| v.as_str())
                    .unwrap_or("medium")
                    .to_string();
                let workspace_id = {
                    state
                        .inner
                        .lock()
                        .ok()
                        .and_then(|g| g.as_ref().and_then(|i| i.workspace_id.clone()))
                };
                let entry = serde_json::json!({
                    "title": title,
                    "priority": priority,
                    "at": chrono_millis(),
                });
                if let Ok(mut g) = recent.lock() {
                    g.push(entry);
                    if g.len() > 40 {
                        let drain = g.len() - 40;
                        g.drain(0..drain);
                    }
                }
                let payload = CompanionTaskPayload {
                    title,
                    priority,
                    workspace_id,
                };
                let _ = app.emit("companion://task", payload);
                cors_ok(r#"{"ok":true}"#, "200 OK", "application/json")
            }
        }
    } else if method == "POST" && path == "/api/input" {
        if !authorize(&state, header_token.as_deref()) {
            cors_ok(
                r#"{"error":"Unauthorized"}"#,
                "401 Unauthorized",
                "application/json",
            )
        } else {
            let parsed: serde_json::Value =
                serde_json::from_str(&body).unwrap_or_else(|_| serde_json::json!({}));
            let session_id = parsed
                .get("sessionId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let text = parsed
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if session_id.is_empty() || text.is_empty() {
                cors_ok(
                    r#"{"error":"sessionId and text required"}"#,
                    "400 Bad Request",
                    "application/json",
                )
            } else {
                let payload = CompanionInputPayload { session_id, text };
                let _ = app.emit("companion://input", payload);
                cors_ok(r#"{"ok":true}"#, "200 OK", "application/json")
            }
        }
    } else {
        cors_ok(r#"{"error":"Not found"}"#, "404 Not Found", "application/json")
    };

    let _ = stream.write_all(reply.as_bytes());
    let _ = stream.flush();
}

fn status_snapshot(state: &CompanionState) -> CompanionStatus {
    let ip = lan_ip();
    let empty = CompanionStatus {
        running: false,
        port: COMPANION_PORT,
        lan_ip: ip.clone(),
        token: None,
        paired: false,
        pair_url: None,
        deep_link: None,
        install_page_url: Some(install_page_url()),
    };
    let Ok(guard) = state.inner.lock() else {
        return empty;
    };
    match guard.as_ref() {
        Some(inner) => {
            let host = ip.clone().unwrap_or_else(|| "127.0.0.1".into());
            let link = deep_link(&inner.token, &host, COMPANION_PORT);
            CompanionStatus {
                running: true,
                port: COMPANION_PORT,
                lan_ip: ip,
                token: Some(inner.token.clone()),
                paired: inner.paired,
                pair_url: Some(link.clone()),
                deep_link: Some(link),
                install_page_url: Some(install_page_url()),
            }
        }
        None => empty,
    }
}

#[tauri::command]
pub fn companion_status(state: State<'_, Arc<CompanionState>>) -> CompanionStatus {
    status_snapshot(&state)
}

#[tauri::command]
pub fn companion_start(
    app: AppHandle,
    state: State<'_, Arc<CompanionState>>,
    token: String,
    workspace_id: Option<String>,
) -> Result<CompanionStatus, String> {
    let token = token.trim().to_string();
    if token.len() < 6 {
        return Err("Pairing token too short".into());
    }

    {
        let guard = state.inner.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = guard.as_ref() {
            existing.stop.store(true, Ordering::SeqCst);
        }
        drop(guard);
        thread::sleep(Duration::from_millis(200));

        let stop = Arc::new(AtomicBool::new(false));
        {
            let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
            *guard = Some(Inner {
                token: token.clone(),
                paired: false,
                workspace_id,
                snapshot: serde_json::json!({ "spaces": [], "sessions": [] }),
                stop: stop.clone(),
            });
        }

        let listener = TcpListener::bind(("0.0.0.0", COMPANION_PORT))
            .map_err(|e| format!("Cannot bind companion port {COMPANION_PORT}: {e}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| e.to_string())?;

        let app_handle = app.clone();
        let shared = Arc::clone(&*state);
        let recent = Arc::new(Mutex::new(Vec::new()));

        thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let app2 = app_handle.clone();
                        let st = Arc::clone(&shared);
                        let rec = Arc::clone(&recent);
                        thread::spawn(move || handle(stream, app2, st, rec));
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(40));
                    }
                    Err(_) => thread::sleep(Duration::from_millis(120)),
                }
            }
        });
    }

    Ok(status_snapshot(&state))
}

#[tauri::command]
pub fn companion_stop(state: State<'_, Arc<CompanionState>>) -> Result<CompanionStatus, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(inner) = guard.take() {
        inner.stop.store(true, Ordering::SeqCst);
    }
    Ok(CompanionStatus {
        running: false,
        port: COMPANION_PORT,
        lan_ip: lan_ip(),
        token: None,
        paired: false,
        pair_url: None,
        deep_link: None,
        install_page_url: Some(install_page_url()),
    })
}

#[tauri::command]
pub fn companion_set_workspace(
    state: State<'_, Arc<CompanionState>>,
    workspace_id: Option<String>,
) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(inner) = guard.as_mut() {
        inner.workspace_id = workspace_id;
    }
    Ok(())
}

#[tauri::command]
pub fn companion_push_snapshot(
    state: State<'_, Arc<CompanionState>>,
    snapshot: serde_json::Value,
) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(inner) = guard.as_mut() {
        inner.snapshot = snapshot;
    }
    Ok(())
}

pub fn empty_state() -> Arc<CompanionState> {
    Arc::new(CompanionState::default())
}
