//! Singleton `code serve-web` process for inline VS Code in a browser pane.

use serde::Serialize;
use std::{
    fs,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use url::Url;

const MISSING_CODE_CLI: &str =
    "VS Code CLI (`code`) was not found on PATH. Install Visual Studio Code and add the `code` command to your PATH (Command Palette → \"Shell Command: Install 'code' command in PATH\").";

const READY_TIMEOUT: Duration = Duration::from_secs(45);
const READY_POLL: Duration = Duration::from_millis(150);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VsCodeServeWebInfo {
    pub base_url: String,
    pub connection_token: String,
    pub port: u16,
}

struct ServeWebProcess {
    child: Child,
    info: VsCodeServeWebInfo,
}

impl Drop for ServeWebProcess {
    fn drop(&mut self) {
        kill_serve_web_child(&mut self.child);
    }
}

static SERVER: Mutex<Option<ServeWebProcess>> = Mutex::new(None);

fn missing_code_error() -> String {
    MISSING_CODE_CLI.to_string()
}

fn random_connection_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let port_entropy = TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|addr| addr.port() as u128)
        .unwrap_or(0);
    // Alphanumeric token accepted by VS Code serve-web (`tkn` query / cookie).
    format!("{:032x}{:08x}", nanos ^ (pid << 32) ^ port_entropy, port_entropy as u32)
}

fn pick_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Failed to reserve a local port for VS Code: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Failed to read reserved port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn port_is_listening(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

fn wait_until_listening(child: &mut Child, port: u16) -> Result<(), String> {
    let started = Instant::now();
    while started.elapsed() < READY_TIMEOUT {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "VS Code serve-web exited before becoming ready (status: {status})"
            ));
        }
        if port_is_listening(port) {
            return Ok(());
        }
        thread::sleep(READY_POLL);
    }
    Err(format!(
        "Timed out waiting for VS Code serve-web on 127.0.0.1:{port}"
    ))
}

fn kill_serve_web_child(child: &mut Child) {
    let pid = child.id();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        // Kill the whole tree — `code.cmd` may spawn node / code-server children.
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn path_env() -> Option<String> {
    crate::enriched_path().or_else(|| std::env::var("PATH").ok())
}

fn is_usable_code_cli(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    // Root Electron `Code.exe` launches the desktop UI, not serve-web CLI.
    if name == "code.exe" {
        let parent = path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        return parent == "bin";
    }
    matches!(
        name.as_str(),
        "code" | "code.cmd" | "code.bat" | "code-insiders" | "code-insiders.cmd" | "code-insiders.bat"
    )
}

fn candidate_code_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut push = |path: PathBuf| {
        if is_usable_code_cli(&path) && !out.iter().any(|existing| existing == &path) {
            out.push(path);
        }
    };

    if let Some(path) = path_env() {
        #[cfg(windows)]
        let sep = ';';
        #[cfg(not(windows))]
        let sep = ':';
        #[cfg(windows)]
        let names = ["code.cmd", "code.bat", "code"];
        #[cfg(not(windows))]
        let names = ["code"];
        for dir in path.split(sep).filter(|d| !d.is_empty()) {
            for name in names {
                push(Path::new(dir).join(name));
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            push(
                PathBuf::from(&local)
                    .join("Programs")
                    .join("Microsoft VS Code")
                    .join("bin")
                    .join("code.cmd"),
            );
            push(
                PathBuf::from(&local)
                    .join("Programs")
                    .join("Microsoft VS Code Insiders")
                    .join("bin")
                    .join("code-insiders.cmd"),
            );
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            push(
                PathBuf::from(program_files)
                    .join("Microsoft VS Code")
                    .join("bin")
                    .join("code.cmd"),
            );
        }
        // Custom install (e.g. D:\Microsoft VS Code\bin\code.cmd)
        for drive in ["C:", "D:", "E:"] {
            push(
                PathBuf::from(format!("{drive}\\Microsoft VS Code\\bin\\code.cmd")),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        push(PathBuf::from(
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        ));
        push(PathBuf::from(
            "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code",
        ));
        if let Ok(home) = std::env::var("HOME") {
            push(PathBuf::from(format!(
                "{home}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
            )));
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        push(PathBuf::from("/usr/bin/code"));
        push(PathBuf::from("/usr/local/bin/code"));
        push(PathBuf::from("/snap/bin/code"));
    }

    out
}

fn find_code_cli() -> Result<PathBuf, String> {
    candidate_code_paths()
        .into_iter()
        .next()
        .ok_or_else(missing_code_error)
}

fn spawn_serve_web(port: u16, token: &str) -> Result<Child, String> {
    let code = find_code_cli()?;
    let mut cmd = Command::new(&code);
    cmd.args([
        "serve-web",
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
        "--connection-token",
        token,
        "--accept-server-license-terms",
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());

    if let Some(path) = path_env() {
        cmd.env("PATH", path);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            missing_code_error()
        } else {
            format!("Failed to start VS Code serve-web: {error}")
        }
    })
}

fn live_info_if_running(guard: &mut Option<ServeWebProcess>) -> Option<VsCodeServeWebInfo> {
    let Some(server) = guard.as_mut() else {
        return None;
    };
    match server.child.try_wait() {
        Ok(None) if port_is_listening(server.info.port) => Some(server.info.clone()),
        Ok(None) => {
            // Process up but port not accepting — treat as dead and respawn.
            kill_serve_web_child(&mut server.child);
            *guard = None;
            None
        }
        _ => {
            *guard = None;
            None
        }
    }
}

fn start_locked(guard: &mut Option<ServeWebProcess>) -> Result<VsCodeServeWebInfo, String> {
    if let Some(info) = live_info_if_running(guard) {
        return Ok(info);
    }

    // Ensure CLI exists before allocating a port / token.
    let _ = find_code_cli()?;

    let port = pick_free_port()?;
    let connection_token = random_connection_token();
    let mut child = spawn_serve_web(port, &connection_token)?;
    if let Err(error) = wait_until_listening(&mut child, port) {
        kill_serve_web_child(&mut child);
        return Err(error);
    }

    let base_url = format!("http://127.0.0.1:{port}");
    let info = VsCodeServeWebInfo {
        base_url,
        connection_token,
        port,
    };
    *guard = Some(ServeWebProcess {
        child,
        info: info.clone(),
    });
    Ok(info)
}

/// One `code serve-web` process per app. Reuses a live instance on repeat calls.
#[tauri::command]
pub fn ensure_vscode_serve_web() -> Result<VsCodeServeWebInfo, String> {
    let mut guard = SERVER
        .lock()
        .map_err(|_| "VS Code serve-web state is unavailable".to_string())?;
    start_locked(&mut guard)
}

fn normalize_folder_path(folder: &str) -> Result<String, String> {
    let trimmed = folder.trim();
    if trimmed.is_empty() {
        return Err("Folder path is empty".into());
    }
    let canonical = fs::canonicalize(trimmed)
        .map_err(|error| format!("Invalid folder path: {error}"))?;
    if !canonical.is_dir() {
        return Err("Path is not a directory".into());
    }
    let mut path = canonical.to_string_lossy().to_string();
    #[cfg(windows)]
    {
        if let Some(stripped) = path.strip_prefix(r"\\?\") {
            path = stripped.to_string();
        }
        // serve-web folder query is happier with forward slashes.
        path = path.replace('\\', "/");
    }
    Ok(path)
}

/// `code serve-web` runs the workbench against a remote authority, so `folder` must be a
/// leading-slash path (VS Code rebuilds it as `vscode-remote://<authority><path>`).
/// A bare `D:/x` parses as scheme `d:` and a `file://` URI points at the browser FS —
/// both leave the explorer empty with a `!` badge.
fn folder_query_value(folder: &str) -> String {
    let path = folder.replace('\\', "/");
    let path = path.strip_prefix("file:///").unwrap_or(&path);
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    }
}

fn build_folder_url(info: &VsCodeServeWebInfo, folder: &str) -> Result<String, String> {
    let mut url = Url::parse(&format!("{}/", info.base_url.trim_end_matches('/')))
        .map_err(|error| format!("Invalid VS Code base URL: {error}"))?;
    url.query_pairs_mut()
        .append_pair("folder", &folder_query_value(folder))
        .append_pair("tkn", &info.connection_token);
    Ok(url.into())
}

/// Ensure serve-web is running, then return a folder URL for the browser pane.
#[tauri::command]
pub fn vscode_serve_web_folder_url(folder: String) -> Result<String, String> {
    let folder = normalize_folder_path(&folder)?;
    let info = ensure_vscode_serve_web()?;
    build_folder_url(&info, &folder)
}

/// Stop the singleton serve-web process (app exit / window teardown).
pub fn shutdown_vscode_serve_web() {
    if let Ok(mut guard) = SERVER.lock() {
        if let Some(mut server) = guard.take() {
            kill_serve_web_child(&mut server.child);
        }
    }
}
