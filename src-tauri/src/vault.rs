//! Local agent session vault — cmux-style discovery from on-disk transcripts.

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    time::SystemTime,
};

const MAX_SCAN_FILES: usize = 4000;
const MAX_RESULTS: usize = 500;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSessionEntry {
    pub id: String,
    pub agent_id: String,
    pub title: String,
    pub cwd: String,
    pub mtime_ms: u64,
    pub resume_command: Option<String>,
    pub source: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanVaultRequest {
    pub query: Option<String>,
    pub cwd_filter: Option<String>,
    pub limit: Option<usize>,
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

fn mtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_path_slash(path: &str) -> String {
    path.replace('\\', "/")
}

fn paths_match(cwd_filter: &str, session_cwd: &str) -> bool {
    let a = normalize_path_slash(cwd_filter.trim()).trim_end_matches('/').to_lowercase();
    let b = normalize_path_slash(session_cwd.trim()).trim_end_matches('/').to_lowercase();
    if a.is_empty() || b.is_empty() {
        return true;
    }
    b.starts_with(&a) || a.starts_with(&b)
}

fn query_matches(query: &str, title: &str, cwd: &str) -> bool {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return true;
    }
    title.to_lowercase().contains(&q) || cwd.to_lowercase().contains(&q)
}

fn decode_claude_project_dir(name: &str) -> String {
    let mut out = String::new();
    let mut chars = name.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '-' && chars.peek() == Some(&'-') {
            chars.next();
            out.push('/');
        } else if ch == '-' {
            out.push(if cfg!(windows) { '\\' } else { '/' });
        } else {
            out.push(ch);
        }
    }
    out
}

fn title_from_jsonl(path: &Path, max_lines: usize) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    for line in reader.lines().take(max_lines) {
        let line = line.ok()?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if let Some(text) = json.get("message").and_then(|m| m.get("content")) {
                if let Some(s) = text.as_str() {
                    let t = s.trim();
                    if !t.is_empty() && t.len() <= 240 {
                        return Some(t.to_string());
                    }
                }
                if let Some(arr) = text.as_array() {
                    for item in arr {
                        if let Some(s) = item.get("text").and_then(|v| v.as_str()) {
                            let t = s.trim();
                            if !t.is_empty() {
                                return Some(t.chars().take(240).collect());
                            }
                        }
                    }
                }
            }
            if let Some(s) = json.get("display").and_then(|v| v.as_str()) {
                let t = s.trim();
                if !t.is_empty() {
                    return Some(t.chars().take(240).collect());
                }
            }
            if let Some(s) = json.get("title").and_then(|v| v.as_str()) {
                let t = s.trim();
                if !t.is_empty() {
                    return Some(t.chars().take(240).collect());
                }
            }
        }
    }
    None
}

fn push_jsonl_sessions(
    out: &mut Vec<VaultSessionEntry>,
    root: &Path,
    agent_id: &str,
    resume_prefix: &str,
    source: &str,
    scanned: &mut usize,
) {
    if *scanned >= MAX_SCAN_FILES {
        return;
    }
    let Ok(read) = fs::read_dir(root) else {
        return;
    };
    for entry in read.flatten() {
        if *scanned >= MAX_SCAN_FILES {
            break;
        }
        let path = entry.path();
        if path.is_dir() {
            push_jsonl_sessions(out, &path, agent_id, resume_prefix, source, scanned);
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        *scanned += 1;
        let file_stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("session")
            .to_string();
        let parent = path.parent().unwrap_or(&path);
        let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let cwd = if agent_id == "claude" {
            decode_claude_project_dir(parent_name)
        } else {
            parent.to_string_lossy().to_string()
        };
        let title = title_from_jsonl(&path, 12)
            .unwrap_or_else(|| file_stem.clone())
            .chars()
            .take(120)
            .collect();
        let resume_command = if resume_prefix.is_empty() {
            None
        } else {
            Some(format!("{resume_prefix} {file_stem}"))
        };
        out.push(VaultSessionEntry {
            id: format!("{source}:{file_stem}"),
            agent_id: agent_id.to_string(),
            title,
            cwd,
            mtime_ms: mtime_ms(&path),
            resume_command,
            source: source.to_string(),
        });
    }
}

fn scan_claude(home: &Path, out: &mut Vec<VaultSessionEntry>, scanned: &mut usize) {
    let root = home.join(".claude").join("projects");
    if root.is_dir() {
        push_jsonl_sessions(out, &root, "claude", "claude --resume", "claude-jsonl", scanned);
    }
}

fn scan_codex(home: &Path, out: &mut Vec<VaultSessionEntry>, scanned: &mut usize) {
    for rel in ["codex/sessions", ".codex/sessions", "Library/Application Support/Codex/sessions"] {
        let root = home.join(rel);
        if root.is_dir() {
            push_jsonl_sessions(out, &root, "codex", "codex resume", "codex-jsonl", scanned);
        }
    }
}

fn scan_opencode_jsonl(home: &Path, out: &mut Vec<VaultSessionEntry>, scanned: &mut usize) {
    for rel in [
        ".local/share/opencode/sessions",
        ".config/opencode/sessions",
        "AppData/Local/opencode/sessions",
        "AppData/Roaming/opencode/sessions",
    ] {
        let root = home.join(rel);
        if root.is_dir() {
            push_jsonl_sessions(
                out,
                &root,
                "opencode",
                "opencode --session",
                "opencode-jsonl",
                scanned,
            );
        }
    }
}

#[tauri::command]
pub fn scan_vault_sessions(request: ScanVaultRequest) -> Result<Vec<VaultSessionEntry>, String> {
    let home = home_dir().ok_or_else(|| "Home directory not found".to_string())?;
    let query = request.query.unwrap_or_default();
    let cwd_filter = request.cwd_filter.unwrap_or_default();
    let limit = request.limit.unwrap_or(200).min(MAX_RESULTS);

    let mut out: Vec<VaultSessionEntry> = Vec::new();
    let mut scanned = 0usize;
    scan_claude(&home, &mut out, &mut scanned);
    scan_codex(&home, &mut out, &mut scanned);
    scan_opencode_jsonl(&home, &mut out, &mut scanned);

    out.retain(|entry| {
        query_matches(&query, &entry.title, &entry.cwd)
            && (cwd_filter.trim().is_empty() || paths_match(&cwd_filter, &entry.cwd))
    });

    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
    out.truncate(limit);
    Ok(out)
}
