use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
mod legacy;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{self, BufRead, Read, Write},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

#[derive(Deserialize)]
struct Request {
    id: u64,
    command: String,
    args: Value,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn Child + Send + Sync>,
}

struct State {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, Session>>,
    output: Mutex<io::Stdout>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(0),
            sessions: Mutex::new(HashMap::new()),
            output: Mutex::new(io::stdout()),
        }
    }
}

fn send(state: &State, value: Value) {
    if let Ok(mut out) = state.output.lock() {
        let _ = writeln!(out, "{value}");
        let _ = out.flush();
    }
}

fn size(cols: Option<u16>, rows: Option<u16>, width: Option<u16>, height: Option<u16>) -> PtySize {
    PtySize {
        cols: cols.unwrap_or(80).clamp(2, 500),
        rows: rows.unwrap_or(24).clamp(2, 200),
        pixel_width: width.unwrap_or(0),
        pixel_height: height.unwrap_or(0),
    }
}

fn value<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    args.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Missing {key}"))
}

fn default_cwd() -> String {
    std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .ok()
        .filter(|s| std::path::Path::new(s).is_dir())
        .unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
}

fn enriched_path() -> std::ffi::OsString {
    let mut paths: Vec<_> =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect();
    let home = std::path::PathBuf::from(default_cwd());
    if cfg!(windows) {
        paths.extend([
            home.join("AppData/Roaming/npm"),
            home.join(".cargo/bin"),
            home.join(".bun/bin"),
        ]);
    } else {
        paths.extend([
            home.join(".local/bin"),
            home.join(".cargo/bin"),
            home.join(".bun/bin"),
            std::path::PathBuf::from("/opt/homebrew/bin"),
            std::path::PathBuf::from("/usr/local/bin"),
        ]);
    }
    std::env::join_paths(paths).unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

fn command_exists(name: &str) -> bool {
    if name.is_empty() || name.contains(['/', '\\']) {
        return std::path::Path::new(name).is_file();
    }
    let suffixes: &[&str] = if cfg!(windows) {
        &["", ".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    std::env::split_paths(&enriched_path()).any(|dir| {
        suffixes
            .iter()
            .any(|suffix| dir.join(format!("{name}{suffix}")).is_file())
    })
}

fn create(state: &Arc<State>, args: &Value) -> Result<Value, String> {
    let shell = args
        .get("shell")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(str::to_owned)
        .or_else(|| std::env::var("SHELL").ok().filter(|s| !s.is_empty()))
        .unwrap_or_else(|| {
            if cfg!(windows) {
                "powershell.exe"
            } else {
                "sh"
            }
            .to_owned()
        });
    let cwd = args
        .get("cwd")
        .and_then(Value::as_str)
        .filter(|s| std::path::Path::new(s).is_dir());
    let pair = native_pty_system()
        .openpty(size(
            args.get("cols")
                .and_then(Value::as_u64)
                .and_then(|n| u16::try_from(n).ok()),
            args.get("rows")
                .and_then(Value::as_u64)
                .and_then(|n| u16::try_from(n).ok()),
            None,
            None,
        ))
        .map_err(|e| e.to_string())?;
    let mut cmd = CommandBuilder::new(&shell);
    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }
    #[cfg(windows)]
    if ["powershell", "powershell.exe", "pwsh", "pwsh.exe"]
        .iter()
        .any(|name| shell.eq_ignore_ascii_case(name))
    {
        cmd.args(["-NoLogo"]);
    }
    #[cfg(windows)]
    if ["cmd", "cmd.exe"]
        .iter()
        .any(|name| shell.eq_ignore_ascii_case(name))
    {
        cmd.args(["/K", "chcp 65001 >nul"]);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "VoxivaSpace");
    cmd.env("FORCE_COLOR", "3");
    cmd.env("CLICOLOR_FORCE", "1");
    cmd.env_remove("NO_COLOR");
    cmd.env("PATH", enriched_path());
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = Arc::new(Mutex::new(
        pair.master.take_writer().map_err(|e| e.to_string())?,
    ));
    let id = format!(
        "terminal-{}",
        state.next_id.fetch_add(1, Ordering::Relaxed) + 1
    );
    state
        .sessions
        .lock()
        .map_err(|_| "Terminal registry unavailable")?
        .insert(
            id.clone(),
            Session {
                master: pair.master,
                writer: writer.clone(),
                child,
            },
        );
    let read_state = state.clone();
    let read_id = id.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    if data.contains("\x1b[6n") {
                        if let Ok(mut w) = writer.lock() {
                            let _ = w.write_all(b"\x1b[1;1R");
                            let _ = w.flush();
                        }
                    }
                    if data.contains("\x1b[5n") {
                        if let Ok(mut w) = writer.lock() {
                            let _ = w.write_all(b"\x1b[0n");
                            let _ = w.flush();
                        }
                    }
                    send(
                        &read_state,
                        json!({"event":"terminal://output","payload":{"id":read_id,"data":data}}),
                    );
                }
            }
        }
        if let Ok(mut sessions) = read_state.sessions.lock() {
            sessions.remove(&read_id);
        }
        send(
            &read_state,
            json!({"event":"terminal://exit","payload":{"id":read_id,"code":null,"message":"Terminal closed"}}),
        );
    });
    if let Some(initial) = args
        .get("initial_command")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        let initial = initial.to_owned();
        let delayed_writer = state
            .sessions
            .lock()
            .map_err(|_| "Terminal registry unavailable")?
            .get(&id)
            .map(|s| s.writer.clone());
        if let Some(delayed_writer) = delayed_writer {
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(700));
                if let Ok(mut w) = delayed_writer.lock() {
                    let _ = write!(w, "\r{initial}\r");
                    let _ = w.flush();
                }
            });
        }
    }
    Ok(
        json!({"id":id,"title":args.get("title").and_then(Value::as_str).unwrap_or("Terminal"),"shell":shell,"cwd":cwd}),
    )
}

fn handle(state: &Arc<State>, request: &Request) -> Result<Value, String> {
    match request.command.as_str() {
        "read_legacy_state" => Ok(json!(legacy::read()?)),
        "read_browser_cookies" => {
            let source = value(&request.args, "from")?.trim().to_ascii_lowercase();
            let domains = request.args.get("domains").and_then(Value::as_array).map(|items| {
                items.iter().filter_map(Value::as_str).map(str::to_owned).collect::<Vec<_>>()
            });
            let cookies = match source.as_str() {
                "chrome" => rookie::chrome(domains),
                "edge" => rookie::edge(domains),
                "firefox" => rookie::firefox(domains),
                "brave" => rookie::brave(domains),
                "chromium" => rookie::chromium(domains),
                _ => return Err("Unknown browser cookie source".into()),
            }.map_err(|error| error.to_string())?;
            Ok(Value::Array(cookies.into_iter().take(10_000).map(|cookie| json!({
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
                "secure": cookie.secure,
                "httpOnly": cookie.http_only,
                "expires": cookie.expires,
            })).collect()))
        }
        "get_default_terminal_cwd" => Ok(json!(default_cwd())),
        "get_app_metadata" => Ok(
            json!({"name":"Voxiva Space","version":env!("CARGO_PKG_VERSION"),"channel":"electron-beta"}),
        ),
        "check_commands" => {
            let names = request
                .args
                .get("names")
                .and_then(Value::as_array)
                .ok_or("Missing names")?;
            let mut found = serde_json::Map::new();
            for name in names.iter().filter_map(Value::as_str) {
                found.insert(name.to_owned(), json!(command_exists(name)));
            }
            Ok(Value::Object(found))
        }
        "get_git_branch" => {
            let cwd = value(&request.args, "cwd")?;
            let output = std::process::Command::new("git")
                .args(["rev-parse", "--abbrev-ref", "HEAD"])
                .current_dir(cwd)
                .output()
                .map_err(|e| e.to_string())?;
            let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(
                if output.status.success() && !branch.is_empty() && branch != "HEAD" {
                    json!(branch)
                } else {
                    Value::Null
                },
            )
        }
        "create_terminal_session" => {
            create(state, request.args.get("request").unwrap_or(&Value::Null))
        }
        "write_terminal_session" => {
            let args = request.args.get("request").unwrap_or(&Value::Null);
            let id = value(args, "id")?;
            let data = value(args, "data")?;
            let writer = state
                .sessions
                .lock()
                .map_err(|_| "Terminal registry unavailable")?
                .get(id)
                .map(|s| s.writer.clone())
                .ok_or("Terminal session not found")?;
            let mut writer = writer.lock().map_err(|_| "Terminal writer unavailable")?;
            writer
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "resize_terminal_session" => {
            let args = request.args.get("request").unwrap_or(&Value::Null);
            let sessions = state
                .sessions
                .lock()
                .map_err(|_| "Terminal registry unavailable")?;
            let session = sessions
                .get(value(args, "id")?)
                .ok_or("Terminal session not found")?;
            let number = |key: &str| {
                args.get(key)
                    .and_then(Value::as_u64)
                    .and_then(|n| u16::try_from(n).ok())
            };
            session
                .master
                .resize(size(
                    number("cols"),
                    number("rows"),
                    number("pixel_width"),
                    number("pixel_height"),
                ))
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "kill_terminal_session" => {
            let args = request.args.get("request").unwrap_or(&Value::Null);
            let mut session = state
                .sessions
                .lock()
                .map_err(|_| "Terminal registry unavailable")?
                .remove(value(args, "id")?)
                .ok_or("Terminal session not found")?;
            session.child.kill().map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        _ => Err(format!("Unsupported command: {}", request.command)),
    }
}

fn main() {
    let state = Arc::new(State::default());
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let request: Request = match serde_json::from_str(&line) {
            Ok(request) => request,
            Err(error) => {
                send(&state, json!({"id":null,"error":error.to_string()}));
                continue;
            }
        };
        let result = handle(&state, &request);
        match result {
            Ok(value) => send(&state, json!({"id":request.id,"result":value})),
            Err(error) => send(&state, json!({"id":request.id,"error":error})),
        }
    }
    if let Ok(mut sessions) = state.sessions.lock() {
        for session in sessions.values_mut() {
            let _ = session.child.kill();
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn terminal_size_is_bounded() {
        let value = size(Some(1), Some(999), None, None);
        assert_eq!((value.cols, value.rows), (2, 200));
    }
}
