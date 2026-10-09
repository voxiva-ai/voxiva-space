//! Voxiva Space native shell. Real connectors grow behind Tauri commands here.

mod browser;
mod browser_cookies;
mod companion;
mod vault;
mod vscode_web;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

use browser::{
    browser_close, browser_close_all, browser_configure_inspector, browser_hide, browser_hide_all,
    browser_inspector_snapshot, browser_navigate, browser_open, browser_open_devtools,
    browser_page_meta, browser_reload, browser_set_bounds, browser_take_selection,
    browser_toggle_inspector, write_annotate_context, BrowserRegistry,
};
use browser_cookies::{
    browser_import_cookies, browser_list_cookie_sources, browser_passkey_support,
};
use companion::{
    companion_append_output, companion_push_snapshot, companion_set_workspace, companion_start,
    companion_status, companion_stop, empty_state,
};
use vault::scan_vault_sessions;

#[derive(Serialize)]
struct AppMetadata {
    name: &'static str,
    version: &'static str,
    channel: &'static str,
}

const MAX_TEXT_FILE_SIZE: u64 = 2 * 1024 * 1024;
const HIDDEN_WORKSPACE_NAMES: [&str; 4] = [".git", "node_modules", "target", "dist"];

#[derive(Serialize)]
struct WorkspaceEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_directory: bool,
    size: u64,
}

#[derive(Serialize)]
struct TextFileContent {
    path: String,
    content: String,
    size: u64,
}

fn validate_size(size: u64) -> Result<(), String> {
    if size > MAX_TEXT_FILE_SIZE {
        Err("File exceeds the 2 MiB limit".into())
    } else {
        Ok(())
    }
}

fn resolve_workspace_path(
    workspace_root: &str,
    relative_path: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let root = fs::canonicalize(workspace_root)
        .map_err(|error| format!("Invalid workspace root: {error}"))?;
    if !root.is_dir() {
        return Err("Workspace root is not a directory".into());
    }

    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::RootDir))
    {
        return Err("Path must be workspace-relative without traversal".into());
    }

    let joined = root.join(relative);
    let target = fs::canonicalize(&joined).unwrap_or(joined);
    if !target.starts_with(&root) {
        // On Windows canonicalize can change prefix; compare normalized
        let root_s = root.to_string_lossy().to_lowercase();
        let target_s = target.to_string_lossy().to_lowercase();
        if !target_s.starts_with(&root_s) {
            return Err("Path escapes the workspace".into());
        }
    }
    Ok((root, target))
}

fn resolve_workspace_path_for_create(
    workspace_root: &str,
    relative_path: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let root = fs::canonicalize(workspace_root)
        .map_err(|error| format!("Invalid workspace root: {error}"))?;
    if !root.is_dir() {
        return Err("Workspace root is not a directory".into());
    }
    let relative = Path::new(relative_path.trim());
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || relative
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::RootDir))
    {
        return Err("Path must be workspace-relative without traversal".into());
    }
    let target = root.join(relative);
    Ok((root, target))
}

#[tauri::command]
fn list_workspace_dir(
    workspace_root: String,
    relative_path: String,
) -> Result<Vec<WorkspaceEntry>, String> {
    let (root, directory) = resolve_workspace_path(&workspace_root, &relative_path)?;
    if !directory.is_dir() {
        return Err("Workspace path is not a directory".into());
    }

    let mut entries = Vec::new();
    for item in
        fs::read_dir(&directory).map_err(|error| format!("Failed to list directory: {error}"))?
    {
        let item = item.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        let name = item
            .file_name()
            .into_string()
            .map_err(|_| "Workspace contains a non-UTF-8 file name".to_string())?;
        if HIDDEN_WORKSPACE_NAMES.contains(&name.as_str()) {
            continue;
        }

        let item_path = item.path();
        let canonical = fs::canonicalize(&item_path)
            .map_err(|error| format!("Invalid workspace entry: {error}"))?;
        if !canonical.starts_with(&root) {
            continue;
        }
        let metadata = canonical
            .metadata()
            .map_err(|error| format!("Failed to inspect workspace entry: {error}"))?;
        let relative = item_path
            .strip_prefix(&root)
            .map_err(|_| "Workspace entry escaped its root".to_string())?;
        entries.push(WorkspaceEntry {
            name,
            path: relative.to_string_lossy().replace('\\', "/"),
            is_directory: metadata.is_dir(),
            size: if metadata.is_file() {
                metadata.len()
            } else {
                0
            },
        });
    }
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

#[tauri::command]
fn read_text_file(
    workspace_root: String,
    relative_path: String,
) -> Result<TextFileContent, String> {
    let (root, target) = resolve_workspace_path(&workspace_root, &relative_path)?;
    let metadata = target
        .metadata()
        .map_err(|error| format!("Failed to inspect file: {error}"))?;
    if !metadata.is_file() {
        return Err("Workspace path is not a file".into());
    }
    validate_size(metadata.len())?;

    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    fs::File::open(&target)
        .and_then(|file| file.take(MAX_TEXT_FILE_SIZE + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("Failed to read file: {error}"))?;
    validate_size(bytes.len() as u64)?;
    if bytes.contains(&0) {
        return Err("File appears to be binary".into());
    }
    let content = String::from_utf8(bytes).map_err(|_| "File is not valid UTF-8".to_string())?;
    let path = target
        .strip_prefix(root)
        .map_err(|_| "File escaped its workspace".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(TextFileContent {
        size: content.len() as u64,
        path,
        content,
    })
}

#[tauri::command]
fn write_text_file(
    workspace_root: String,
    relative_path: String,
    content: String,
) -> Result<TextFileContent, String> {
    validate_size(content.len() as u64)?;
    let (root, target) = resolve_workspace_path_for_create(&workspace_root, &relative_path)?;
    if target.is_dir() {
        return Err("Cannot write to a directory".into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create folders: {error}"))?;
    }
    fs::write(&target, content.as_bytes())
        .map_err(|error| format!("Failed to write file: {error}"))?;
    let path = target
        .strip_prefix(&root)
        .map_err(|_| "File escaped its workspace".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(TextFileContent {
        size: content.len() as u64,
        path,
        content,
    })
}

#[derive(Serialize)]
struct BinaryFileContent {
    path: String,
    /// Base64-encoded bytes
    base64: String,
    mime: String,
    size: u64,
}

const MAX_BINARY_FILE_SIZE: u64 = 12 * 1024 * 1024;

fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" | "qt" => "video/quicktime",
        "m4v" => "video/x-m4v",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "ogv" => "video/ogg",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "opus" => "audio/opus",
        _ => "application/octet-stream",
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFileInfo {
    path: String,
    absolute_path: String,
    mime: String,
    size: u64,
}

/// Absolute path + mime for WebView asset:// preview (images / video / PDF).
#[tauri::command]
fn workspace_file_info(
    workspace_root: String,
    relative_path: String,
) -> Result<WorkspaceFileInfo, String> {
    let (root, target) = resolve_workspace_path(&workspace_root, &relative_path)?;
    let metadata = target
        .metadata()
        .map_err(|error| format!("Failed to inspect file: {error}"))?;
    if !metadata.is_file() {
        return Err("Workspace path is not a file".into());
    }
    let path = target
        .strip_prefix(root)
        .map_err(|_| "File escaped its workspace".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(WorkspaceFileInfo {
        size: metadata.len(),
        mime: mime_for_path(&target).to_string(),
        absolute_path: target.to_string_lossy().to_string(),
        path,
    })
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Result<u8, String> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err("Invalid base64".into()),
        }
    }
    let cleaned: Vec<u8> = input
        .bytes()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    if cleaned.len() % 4 != 0 {
        return Err("Invalid base64 length".into());
    }
    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let a = val(chunk[0])?;
        let b = val(chunk[1])?;
        let c = if chunk[2] == b'=' {
            0
        } else {
            val(chunk[2])?
        };
        let d = if chunk[3] == b'=' {
            0
        } else {
            val(chunk[3])?
        };
        let n = ((a as u32) << 18) | ((b as u32) << 12) | ((c as u32) << 6) | (d as u32);
        out.push(((n >> 16) & 0xff) as u8);
        if chunk[2] != b'=' {
            out.push(((n >> 8) & 0xff) as u8);
        }
        if chunk[3] != b'=' {
            out.push((n & 0xff) as u8);
        }
    }
    Ok(out)
}

#[derive(Deserialize)]
struct WriteTempFileRequest {
    #[serde(rename = "contentsBase64")]
    contents_base64: String,
    extension: String,
}

/// Save clipboard / drop bytes for OpenCode image paste (path handoff).
#[tauri::command]
fn write_temp_file(request: WriteTempFileRequest) -> Result<String, String> {
    let ext = request
        .extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    const ALLOWED: &[&str] = &[
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "pdf", "txt", "md", "bin",
        "mp4", "webm", "mov", "avi", "mkv", "mp3", "wav", "weba", "m4a", "csv", "doc", "docx",
        "xls", "xlsx", "ppt", "pptx",
    ];
    if !ALLOWED.contains(&ext.as_str()) {
        return Err("Unsupported temp file type".into());
    }
    let bytes = decode_base64(&request.contents_base64)?;
    if bytes.is_empty() {
        return Err("Empty file".into());
    }
    if bytes.len() as u64 > MAX_BINARY_FILE_SIZE {
        return Err("File is too large".into());
    }
    let dir = std::env::temp_dir().join("voxiva-paste");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("paste-{stamp}.{ext}"));
    fs::write(&path, bytes).map_err(|e| format!("Failed to write temp file: {e}"))?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn read_binary_file(
    workspace_root: String,
    relative_path: String,
) -> Result<BinaryFileContent, String> {
    let (root, target) = resolve_workspace_path(&workspace_root, &relative_path)?;
    let metadata = target
        .metadata()
        .map_err(|error| format!("Failed to inspect file: {error}"))?;
    if !metadata.is_file() {
        return Err("Workspace path is not a file".into());
    }
    if metadata.len() > MAX_BINARY_FILE_SIZE {
        return Err(format!(
            "File is too large to preview (max {} MB)",
            MAX_BINARY_FILE_SIZE / (1024 * 1024)
        ));
    }

    let bytes =
        fs::read(&target).map_err(|error| format!("Failed to read file: {error}"))?;
    let path = target
        .strip_prefix(root)
        .map_err(|_| "File escaped its workspace".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(BinaryFileContent {
        size: bytes.len() as u64,
        mime: mime_for_path(&target).to_string(),
        base64: encode_base64(&bytes),
        path,
    })
}

#[tauri::command]
fn create_workspace_dir(
    workspace_root: String,
    relative_path: String,
) -> Result<String, String> {
    let (root, target) = resolve_workspace_path_for_create(&workspace_root, &relative_path)?;
    if target.exists() && !target.is_dir() {
        return Err("A file already exists at that path".into());
    }
    fs::create_dir_all(&target).map_err(|error| format!("Failed to create folder: {error}"))?;
    let path = target
        .strip_prefix(&root)
        .map_err(|_| "Folder escaped its workspace".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(path)
}

fn scan_component_files(
    root: &Path,
    directory: &Path,
    component: &str,
    classes: &[String],
    text: &str,
    visited: &mut usize,
    matches: &mut Vec<(usize, String)>,
) {
    if *visited >= 3_000 || matches.len() >= 80 {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        if *visited >= 3_000 {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if HIDDEN_WORKSPACE_NAMES.contains(&name.as_str()) || name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let Ok(canonical) = fs::canonicalize(&path) else {
            continue;
        };
        if !canonical.starts_with(root) {
            continue;
        }
        if canonical.is_dir() {
            scan_component_files(
                root, &canonical, component, classes, text, visited, matches,
            );
            continue;
        }
        *visited += 1;
        let extension = canonical
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "tsx" | "jsx" | "ts" | "js" | "vue" | "svelte" | "html" | "css" | "scss"
        ) {
            continue;
        }
        let Ok(metadata) = canonical.metadata() else {
            continue;
        };
        if metadata.len() > MAX_TEXT_FILE_SIZE {
            continue;
        }
        let Ok(content) = fs::read_to_string(&canonical) else {
            continue;
        };
        let mut score = 0;
        if !component.is_empty() && content.contains(component) {
            score += 5;
        }
        score += classes
            .iter()
            .filter(|class_name| content.contains(class_name.as_str()))
            .count();
        if !text.is_empty() && content.contains(text) {
            score += 3;
        }
        if score == 0 {
            continue;
        }
        if let Ok(relative) = canonical.strip_prefix(root) {
            matches.push((score, relative.to_string_lossy().replace('\\', "/")));
        }
    }
}

#[tauri::command]
fn find_component_files(
    workspace_root: String,
    component: String,
    classes: Vec<String>,
    text: String,
) -> Result<Vec<String>, String> {
    let root = fs::canonicalize(&workspace_root)
        .map_err(|error| format!("Invalid workspace root: {error}"))?;
    if !root.is_dir() {
        return Err("Workspace root is not a directory".into());
    }
    let component = component.trim();
    let component = if component.chars().next().is_some_and(char::is_uppercase) {
        component
    } else {
        ""
    };
    let classes: Vec<String> = classes
        .into_iter()
        .filter(|class_name| class_name.len() >= 4)
        .take(8)
        .collect();
    let text: String = text.trim().chars().take(64).collect();
    let mut matches = Vec::new();
    let mut visited = 0;
    scan_component_files(
        &root,
        &root,
        component,
        &classes,
        &text,
        &mut visited,
        &mut matches,
    );
    matches.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    matches.dedup_by(|a, b| a.1 == b.1);
    Ok(matches.into_iter().take(12).map(|(_, path)| path).collect())
}

#[derive(Deserialize)]
struct CreateTerminalSessionRequest {
    cwd: Option<String>,
    shell: Option<String>,
    title: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    /// Optional command typed into the shell after it starts (e.g. "opencode").
    initial_command: Option<String>,
}

#[derive(Serialize)]
struct TerminalSessionCreated {
    id: String,
    title: String,
    shell: String,
    cwd: Option<String>,
}

#[derive(Deserialize)]
struct TerminalSessionIdRequest {
    id: String,
}

#[derive(Deserialize)]
struct WriteTerminalSessionRequest {
    id: String,
    data: String,
}

#[derive(Deserialize)]
struct ResizeTerminalSessionRequest {
    id: String,
    cols: u16,
    rows: u16,
    /// Physical cell grid in CSS pixels — ConPTY / Ink TUIs need this to avoid clipping.
    #[serde(default)]
    pixel_width: Option<u16>,
    #[serde(default)]
    pixel_height: Option<u16>,
}

#[derive(Clone, Serialize)]
struct TerminalOutputEvent {
    id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalExitEvent {
    id: String,
    code: Option<u32>,
    message: String,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    /// Separate mutex so we never hold the sessions map lock while writing to ConPTY.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
struct TerminalRegistry {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

#[tauri::command]
fn get_default_terminal_cwd() -> String {
    #[cfg(windows)]
    {
        if let Ok(p) = std::env::var("USERPROFILE") {
            let t = p.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
        let drive = std::env::var("HOMEDRIVE").unwrap_or_default();
        let path = std::env::var("HOMEPATH").unwrap_or_default();
        let combined = format!("{drive}{path}");
        let t = combined.trim();
        if t.len() > 1 {
            return t.to_string();
        }
        "C:\\".to_string()
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
    }
}

fn pick_folder_dialog(
    window: tauri::WebviewWindow,
    start: Option<PathBuf>,
) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new().set_title("Choose project folder");
    dialog = dialog.set_parent(&window);
    if let Some(dir) = start {
        dialog = dialog.set_directory(dir);
    }
    Ok(dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
async fn pick_workspace_folder(
    app: AppHandle,
    start_dir: Option<String>,
) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing".to_string())?;

    let start = start_dir
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| {
            let home = get_default_terminal_cwd();
            let path = std::path::PathBuf::from(&home);
            path.is_dir().then_some(path)
        });

    // Native folder dialogs block; keep them off the async command thread.
    tauri::async_runtime::spawn_blocking(move || pick_folder_dialog(window, start))
        .await
        .map_err(|error| format!("Folder picker failed: {error}"))?
}

#[tauri::command]
fn get_git_branch(cwd: String) -> Result<Option<String>, String> {
    let path = cwd.trim();
    if path.is_empty() {
        return Ok(None);
    }
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(path)
        .output()
        .map_err(|error| format!("git failed: {error}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() || branch == "HEAD" {
        return Ok(None);
    }
    Ok(Some(branch))
}

#[tauri::command]
fn get_app_metadata() -> AppMetadata {
    AppMetadata {
        name: "Voxiva Space",
        version: env!("CARGO_PKG_VERSION"),
        channel: "private-beta",
    }
}

#[tauri::command]
fn check_commands(names: Vec<String>) -> std::collections::HashMap<String, bool> {
    let mut map = std::collections::HashMap::new();
    for name in names {
        let key = name.trim().to_string();
        if key.is_empty() {
            continue;
        }
        let available = shell_on_path(&key);
        map.insert(key, available);
    }
    map
}

fn shell_on_path(program: &str) -> bool {
    if program_exists_on_disk(program) {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let candidates = [
            program.to_string(),
            format!("{program}.cmd"),
            format!("{program}.exe"),
            format!("{program}.bat"),
            format!("{program}.ps1"),
        ];
        for candidate in candidates {
            let mut cmd = std::process::Command::new("where");
            cmd.arg(&candidate)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .creation_flags(CREATE_NO_WINDOW);
            if let Some(path) = enriched_path() {
                cmd.env("PATH", path);
            }
            if cmd.status().map(|s| s.success()).unwrap_or(false) {
                return true;
            }
        }
        false
    }
    #[cfg(not(windows))]
    {
        let mut cmd = std::process::Command::new("sh");
        cmd.args(["-c", &format!("command -v '{program}'")])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        if let Some(path) = enriched_path() {
            cmd.env("PATH", path);
        }
        cmd.status().map(|s| s.success()).unwrap_or(false)
    }
}

fn program_exists_on_disk(program: &str) -> bool {
    let path = std::path::Path::new(program);
    if path.is_absolute() && path.exists() {
        return true;
    }
    let Some(enriched) = enriched_path() else {
        return false;
    };
    #[cfg(windows)]
    let sep = ';';
    #[cfg(not(windows))]
    let sep = ':';
    #[cfg(windows)]
    let suffixes = ["", ".cmd", ".exe", ".bat", ".ps1"];
    #[cfg(not(windows))]
    let suffixes = [""];
    for dir in enriched.split(sep) {
        if dir.is_empty() {
            continue;
        }
        for suffix in suffixes {
            let candidate = std::path::Path::new(dir).join(format!("{program}{suffix}"));
            if candidate.is_file() {
                return true;
            }
        }
    }
    false
}

/// GUI apps often miss npm / user tool dirs that interactive shells have.
pub(crate) fn enriched_path() -> Option<String> {
    let current = std::env::var("PATH").unwrap_or_default();
    let mut extras: Vec<String> = Vec::new();
    #[cfg(windows)]
    {
        if let Ok(fnm_shell) = std::env::var("FNM_MULTISHELL_PATH") {
            if !fnm_shell.trim().is_empty() {
                extras.push(fnm_shell);
            }
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            extras.push(format!("{appdata}\\npm"));
            extras.push(format!("{appdata}\\fnm"));
            extras.push(format!("{appdata}\\Cursor\\bin"));
            extras.push(format!("{appdata}\\cursor\\bin"));
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            extras.push(format!("{local}\\Programs"));
            extras.push(format!("{local}\\Programs\\nodejs"));
            extras.push(format!("{local}\\Programs\\cursor"));
            extras.push(format!("{local}\\Programs\\Cursor"));
            extras.push(format!("{local}\\Microsoft\\WindowsApps"));
            extras.push(format!("{local}\\Yarn\\bin"));
            extras.push(format!("{local}\\pnpm"));
            extras.push(format!("{local}\\bun"));
            extras.push(format!("{local}\\Volta\\bin"));
            extras.push(format!("{local}\\cursor-agent"));
            let codex_bin = PathBuf::from(&local).join("OpenAI").join("Codex").join("bin");
            extras.push(codex_bin.to_string_lossy().into_owned());
            if let Ok(entries) = fs::read_dir(codex_bin) {
                extras.extend(
                    entries
                        .flatten()
                        .map(|entry| entry.path())
                        .filter(|path| path.is_dir())
                        .map(|path| path.to_string_lossy().into_owned()),
                );
            }
        }
        if let Ok(user) = std::env::var("USERPROFILE") {
            extras.push(format!("{user}\\.local\\bin"));
            extras.push(format!("{user}\\.cargo\\bin"));
            extras.push(format!("{user}\\scoop\\shims"));
            extras.push(format!("{user}\\AppData\\Roaming\\npm"));
            extras.push(format!("{user}\\.bun\\bin"));
            extras.push(format!("{user}\\.volta\\bin"));
            extras.push(format!("{user}\\.fnm"));
            extras.push(format!("{user}\\.opencode\\bin"));
            extras.push(format!("{user}\\.claude\\bin"));
            extras.push(format!("{user}\\.codex\\bin"));
            extras.push(format!("{user}\\.gemini\\bin"));
            extras.push(format!("{user}\\AppData\\Local\\fnm_multishells"));
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            extras.push(format!("{program_files}\\nodejs"));
            extras.push(format!("{program_files}\\Git\\cmd"));
            extras.push(format!("{program_files}\\cursor\\resources\\app\\bin"));
            extras.push(format!("{program_files}\\Cursor\\resources\\app\\bin"));
        }
        if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
            extras.push(format!("{program_files_x86}\\nodejs"));
        }
        // Merge durable User + Machine PATH from the registry (GUI apps often miss installer updates).
        static REG_PATH: OnceLock<Option<String>> = OnceLock::new();
        if let Some(reg_path) = REG_PATH.get_or_init(windows_registry_path).clone() {
            extras.push(reg_path);
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            extras.push(format!("{home}/.local/bin"));
            extras.push(format!("{home}/.npm-global/bin"));
            extras.push(format!("{home}/.cargo/bin"));
            extras.push(format!("{home}/.bun/bin"));
            extras.push(format!("{home}/.volta/bin"));
            extras.push(format!("{home}/.opencode/bin"));
            extras.push(format!("{home}/.claude/bin"));
            extras.push(format!("{home}/.codex/bin"));
            extras.push(format!("{home}/Library/pnpm"));
        }
        extras.push("/usr/local/bin".into());
        extras.push("/opt/homebrew/bin".into());
        extras.push("/opt/homebrew/sbin".into());
    }
    // Deduplicate while preserving order
    let mut ordered = Vec::new();
    for item in extras {
        if !item.is_empty() && !ordered.iter().any(|x| x == &item) {
            ordered.push(item);
        }
    }
    if ordered.is_empty() && current.is_empty() {
        return None;
    }
    #[cfg(windows)]
    {
        Some(if current.is_empty() {
            ordered.join(";")
        } else {
            format!("{};{}", ordered.join(";"), current)
        })
    }
    #[cfg(not(windows))]
    {
        Some(if current.is_empty() {
            ordered.join(":")
        } else {
            format!("{}:{}", ordered.join(":"), current)
        })
    }
}

#[cfg(windows)]
fn windows_registry_path() -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let output = std::process::Command::new("powershell")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-Command",
            "$m = [Environment]::GetEnvironmentVariable('Path','Machine'); $u = [Environment]::GetEnvironmentVariable('Path','User'); if ($m -and $u) { $m + ';' + $u } elseif ($u) { $u } else { $m }",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn candidate_shells(requested: Option<&str>) -> Vec<String> {
    let mut list = Vec::new();
    if let Some(req) = requested.map(str::trim).filter(|s| !s.is_empty()) {
        list.push(req.to_string());
    }
    #[cfg(windows)]
    {
        for shell in ["powershell.exe", "pwsh.exe", "cmd.exe"] {
            if !list.iter().any(|s| s.eq_ignore_ascii_case(shell)) {
                list.push(shell.to_string());
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            if !shell.trim().is_empty() && !list.iter().any(|s| s == &shell) {
                list.push(shell);
            }
        }
        for shell in ["zsh", "bash", "sh"] {
            if !list.iter().any(|s| s == shell) {
                list.push(shell.to_string());
            }
        }
    }
    list
}

fn resolve_cwd(cwd: Option<String>) -> Option<String> {
    let Some(path) = cwd else {
        return None;
    };
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidate = std::path::Path::new(trimmed);
    if candidate.is_dir() {
        return Some(trimmed.to_string());
    }
    None
}

fn friendly_spawn_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("os error 2")
        || lower.contains("cannot find")
        || lower.contains("не удается найти")
        || lower.contains("not found")
    {
        return "Couldn't find a shell on this computer. Open Settings to pick one, or install PowerShell.".into();
    }
    if lower.contains("access") || lower.contains("permission") {
        return "Permission denied starting the terminal. Try another folder.".into();
    }
    "Couldn't open the terminal. Try again or choose another project folder.".into()
}

fn normalize_size(
    cols: Option<u16>,
    rows: Option<u16>,
    pixel_width: Option<u16>,
    pixel_height: Option<u16>,
) -> PtySize {
    let cols = cols.unwrap_or(80).clamp(2, 500);
    let rows = rows.unwrap_or(24).clamp(2, 200);
    PtySize {
        // Match FitAddon output closely — asymmetric clamps desync TUI apps like OpenCode.
        cols,
        rows,
        // Real pixel size lets ConPTY / Gemini / Ink size alt-screens correctly.
        pixel_width: pixel_width.unwrap_or(0),
        pixel_height: pixel_height.unwrap_or(0),
    }
}

fn emit_terminal_exit(app: &AppHandle, id: String, code: Option<u32>, message: String) {
    let _ = app.emit("terminal://exit", TerminalExitEvent { id, code, message });
}

#[tauri::command]
fn create_terminal_session(
    app: AppHandle,
    registry: State<'_, Arc<TerminalRegistry>>,
    request: CreateTerminalSessionRequest,
) -> Result<TerminalSessionCreated, String> {
    let title = request
        .title
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .unwrap_or("Terminal")
        .to_string();
    let cwd = resolve_cwd(
        request
            .cwd
            .as_deref()
            .map(str::trim)
            .filter(|cwd| !cwd.is_empty())
            .map(ToOwned::to_owned),
    );

    let shells = candidate_shells(request.shell.as_deref());
    let preferred: Vec<String> = shells
        .into_iter()
        .filter(|shell| shell_on_path(shell) || std::path::Path::new(shell).exists())
        .collect();
    let try_list = if preferred.is_empty() {
        candidate_shells(request.shell.as_deref())
    } else {
        preferred
    };

    let pty_system = native_pty_system();
    let size = normalize_size(request.cols, request.rows, None, None);

    let mut last_error = String::from("No shell available");
    let mut started = None;

    for shell in try_list {
        let pair = match pty_system.openpty(size) {
            Ok(pair) => pair,
            Err(error) => {
                last_error = friendly_spawn_error(&error.to_string());
                continue;
            }
        };

        let mut cmd = CommandBuilder::new(&shell);
        if let Some(cwd) = cwd.as_deref() {
            cmd.cwd(cwd);
        }
        if let Some(path) = enriched_path() {
            cmd.env("PATH", path);
        }

        #[cfg(windows)]
        if shell.eq_ignore_ascii_case("powershell")
            || shell.eq_ignore_ascii_case("powershell.exe")
            || shell.eq_ignore_ascii_case("pwsh")
            || shell.eq_ignore_ascii_case("pwsh.exe")
        {
        cmd.args(["-NoLogo"]);
        }
        #[cfg(windows)]
        if shell.eq_ignore_ascii_case("cmd") || shell.eq_ignore_ascii_case("cmd.exe") {
            cmd.args(["/K", "chcp 65001 >nul"]);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "VoxivaSpace");
        cmd.env("FORCE_COLOR", "3");
        cmd.env("CLICOLOR_FORCE", "1");
        // Interactive PTY — never inherit NO_COLOR from a parent GUI process.
        cmd.env_remove("NO_COLOR");

        match pair.slave.spawn_command(cmd) {
            Ok(child) => {
                started = Some((shell, pair, child));
                break;
            }
            Err(error) => {
                last_error = friendly_spawn_error(&error.to_string());
            }
        }
    }

    let (shell, pair, child) = started.ok_or(last_error)?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|_| "Couldn't open the terminal.".to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|_| "Couldn't open the terminal.".to_string())?;
    let writer = Arc::new(Mutex::new(writer));
    let read_writer = Arc::clone(&writer);

    let id = format!(
        "terminal-{}",
        registry.next_id.fetch_add(1, Ordering::Relaxed) + 1
    );
    let read_id = id.clone();
    let read_registry = registry.inner().clone();
    let read_app = app.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    emit_terminal_exit(&read_app, read_id.clone(), None, "Terminal closed".into());
                    break;
                }
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    // Windows PowerShell asks the terminal for cursor position before
                    // drawing its first prompt. That request can arrive before xterm
                    // mounts, so answer it here instead of leaving the shell blocked.
                    if data.contains("\u{1b}[6n") {
                        if let Ok(mut writer) = read_writer.lock() {
                            let _ = writer.write_all(b"\x1b[1;1R");
                            let _ = writer.flush();
                        }
                    }
                    if data.contains("\u{1b}[5n") {
                        if let Ok(mut writer) = read_writer.lock() {
                            let _ = writer.write_all(b"\x1b[0n");
                            let _ = writer.flush();
                        }
                    }
                    let _ = read_app.emit(
                        "terminal://output",
                        TerminalOutputEvent {
                            id: read_id.clone(),
                            data,
                        },
                    );
                }
                Err(_) => {
                    emit_terminal_exit(&read_app, read_id.clone(), None, "Terminal closed".into());
                    break;
                }
            }
        }

        if let Ok(mut sessions) = read_registry.sessions.lock() {
            sessions.remove(&read_id);
        }
    });

    let mut sessions = registry
        .sessions
        .lock()
        .map_err(|_| "Terminal is unavailable right now.".to_string())?;
    sessions.insert(
        id.clone(),
        TerminalSession {
            master: pair.master,
            writer,
            child,
        },
    );
    drop(sessions);

    if let Some(cmd) = request
        .initial_command
        .as_ref()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
    {
        let write_id = id.clone();
        let write_registry = registry.inner().clone();
        thread::spawn(move || {
            // No-profile shells are ready quickly; PowerShell profile needs more headroom
            // so agent resume CLIs (`opencode --continue`) are not swallowed.
            thread::sleep(std::time::Duration::from_millis(700));
            for attempt in 0..12 {
                if let Ok(sessions) = write_registry.sessions.lock() {
                    if let Some(session) = sessions.get(&write_id) {
                        let writer = Arc::clone(&session.writer);
                        drop(sessions);
                        let mut w = match writer.lock() {
                            Ok(guard) => guard,
                            Err(_) => {
                                thread::sleep(std::time::Duration::from_millis(
                                    200 + attempt * 120,
                                ));
                                continue;
                            }
                        };
                        // Clear any half-typed buffer, then run the agent CLI.
                        let payload = format!("\r{cmd}\r");
                        if w.write_all(payload.as_bytes()).is_ok() {
                            let _ = w.flush();
                            return;
                        }
                    } else {
                        return;
                    }
                }
                thread::sleep(std::time::Duration::from_millis(200 + attempt * 120));
            }
        });
    }

    Ok(TerminalSessionCreated {
        id,
        title,
        shell,
        cwd,
    })
}

#[tauri::command]
fn write_terminal_session(
    registry: State<'_, Arc<TerminalRegistry>>,
    request: WriteTerminalSessionRequest,
) -> Result<(), String> {
    let writer = {
        let sessions = registry
            .sessions
            .lock()
            .map_err(|_| "Терминал сейчас недоступен".to_string())?;
        let session = sessions
            .get(&request.id)
            .ok_or_else(|| "Сессия терминала не найдена — нажми Restart".to_string())?;
        Arc::clone(&session.writer)
    };

    let mut writer = writer
        .lock()
        .map_err(|_| "Не удалось записать в терминал".to_string())?;
    writer
        .write_all(request.data.as_bytes())
        .map_err(|error| format!("Ошибка записи в PowerShell: {error}"))?;
    writer
        .flush()
        .map_err(|error| format!("Ошибка flush терминала: {error}"))
}

#[tauri::command]
fn resize_terminal_session(
    registry: State<'_, Arc<TerminalRegistry>>,
    request: ResizeTerminalSessionRequest,
) -> Result<(), String> {
    let sessions = registry
        .sessions
        .lock()
        .map_err(|_| "Terminal registry is unavailable".to_string())?;
    let session = sessions
        .get(&request.id)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    session
        .master
        .resize(normalize_size(
            Some(request.cols),
            Some(request.rows),
            request.pixel_width,
            request.pixel_height,
        ))
        .map_err(|error| format!("Failed to resize terminal: {error}"))
}

#[tauri::command]
fn kill_terminal_session(
    registry: State<'_, Arc<TerminalRegistry>>,
    request: TerminalSessionIdRequest,
) -> Result<(), String> {
    let mut sessions = registry
        .sessions
        .lock()
        .map_err(|_| "Terminal registry is unavailable".to_string())?;
    let mut session = sessions
        .remove(&request.id)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    session
        .child
        .kill()
        .map_err(|error| format!("Failed to kill terminal: {error}"))
}

#[derive(Deserialize)]
struct OpenPathRequest {
    path: String,
}

#[tauri::command]
fn open_in_explorer(request: OpenPathRequest) -> Result<(), String> {
    let path = request.path.trim();
    if path.is_empty() {
        return Err("Path is empty".into());
    }

    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open Explorer: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open Finder: {error}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open file manager: {error}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Open folder is not supported on this platform".into())
}

#[tauri::command]
fn open_in_code(request: OpenPathRequest) -> Result<(), String> {
    let path = request.path.trim();
    if path.is_empty() {
        return Err("Path is empty".into());
    }

    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", "code", path])
            .spawn()
            .map_err(|error| format!("Failed to open VS Code: {error}"))?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("code")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open VS Code: {error}"))?;
        return Ok(());
    }
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Invalid URL".into());
    }

    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|error| format!("Failed to open URL: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("Failed to open URL: {error}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("Failed to open URL: {error}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Open URL is not supported on this platform".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Arc::new(TerminalRegistry::default()));
            app.manage(BrowserRegistry::default());
            app.manage(empty_state());

            // Taskbar + window icon (dev via `cargo tauri` / release).
            let icon_path = {
                let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons");
                let ico = base.join("icon.ico");
                let png = base.join("icon.png");
                if ico.exists() {
                    ico
                } else {
                    png
                }
            };
            let window_icon = Image::from_path(&icon_path).ok();
            if let Some(window) = app.get_webview_window("main") {
                if let Some(ref icon) = window_icon {
                    let _ = window.set_icon(icon.clone());
                }
            }

            // System tray — left-click shows window; menu on right-click.
            {
                let open = MenuItem::with_id(app, "vs_open", "Open Voxiva Space", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "vs_quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open, &quit])?;
                let tray_icon = window_icon
                    .or_else(|| app.default_window_icon().cloned())
                    .ok_or("missing app icon for tray")?;
                let show_main = |app: &AppHandle| {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                };
                let tray = TrayIconBuilder::new()
                    .icon(tray_icon)
                    .tooltip("Voxiva Space")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_tray_icon_event(move |tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main(tray.app_handle());
                        }
                    })
                    .on_menu_event(|app, event| {
                        if event.id == "vs_open" {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        } else if event.id == "vs_quit" {
                            app.exit(0);
                        }
                    })
                    .build(app)?;
                // Keep tray alive for the process lifetime (dropping it removes the icon).
                std::mem::forget(tray);
            }

            // Fallback: always surface the main window even if the webview
            // never calls revealMainWindow (vite stall / JS error / race).
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(900));
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_metadata,
            get_default_terminal_cwd,
            get_git_branch,
            pick_workspace_folder,
            list_workspace_dir,
            read_text_file,
            read_binary_file,
            workspace_file_info,
            write_text_file,
            write_temp_file,
            create_workspace_dir,
            find_component_files,
            check_commands,
            create_terminal_session,
            write_terminal_session,
            resize_terminal_session,
            kill_terminal_session,
            open_in_explorer,
            open_in_code,
            vscode_web::ensure_vscode_serve_web,
            vscode_web::vscode_serve_web_folder_url,
            open_url,
            browser_open,
            browser_set_bounds,
            browser_navigate,
            browser_reload,
            browser_hide,
            browser_close,
            browser_hide_all,
            browser_close_all,
            browser_open_devtools,
            browser_page_meta,
            browser_toggle_inspector,
            browser_take_selection,
            browser_inspector_snapshot,
            browser_configure_inspector,
            write_annotate_context,
            browser_list_cookie_sources,
            browser_import_cookies,
            browser_passkey_support,
            companion_status,
            companion_start,
            companion_stop,
            companion_set_workspace,
            companion_push_snapshot,
            companion_append_output,
            scan_vault_sessions,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Voxiva Space")
        .run(|_app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                vscode_web::shutdown_vscode_serve_web();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("voxiva-space-test-{}-{unique}", std::process::id()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn workspace_paths_stay_inside_root() {
        let base = TestDir::new();
        let root = base.0.join("workspace");
        let sibling = base.0.join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&sibling).unwrap();
        fs::write(root.join("inside.txt"), "inside").unwrap();
        fs::write(sibling.join("outside.txt"), "outside").unwrap();

        assert!(resolve_workspace_path(root.to_str().unwrap(), "inside.txt").is_ok());
        assert!(resolve_workspace_path(root.to_str().unwrap(), "../outside/outside.txt").is_err());
        assert!(resolve_workspace_path(
            root.to_str().unwrap(),
            sibling.join("outside.txt").to_str().unwrap()
        )
        .is_err());
    }

    #[test]
    fn text_size_guard_accepts_limit_and_rejects_larger() {
        assert!(validate_size(MAX_TEXT_FILE_SIZE).is_ok());
        assert!(validate_size(MAX_TEXT_FILE_SIZE + 1).is_err());
    }

    #[test]
    fn component_file_search_ranks_matching_source() {
        let root = TestDir::new();
        fs::create_dir_all(root.0.join("src")).unwrap();
        fs::write(
            root.0.join("src/SaveButton.tsx"),
            "export function SaveButton() { return <button className=\"save-button\">Save</button> }",
        )
        .unwrap();
        fs::write(root.0.join("src/Other.tsx"), "export const Other = () => <div />").unwrap();

        let matches = find_component_files(
            root.0.to_string_lossy().into_owned(),
            "SaveButton".into(),
            vec!["save-button".into()],
            "Save".into(),
        )
        .unwrap();

        assert_eq!(matches.first().map(String::as_str), Some("src/SaveButton.tsx"));
    }
}
