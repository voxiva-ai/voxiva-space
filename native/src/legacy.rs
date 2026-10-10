use rusty_leveldb::{DB, LdbIterator, Options};
use serde_json::Value;
use std::{env, fs, path::Path, time::{SystemTime, UNIX_EPOCH}};

const STATE_KEY: &str = "voxiva-space-state-v1";

fn decode(bytes: &[u8]) -> Option<String> {
    match bytes.split_first()? {
        (1, data) => Some(data.iter().map(|byte| char::from(*byte)).collect()),
        (0, data) if data.len() % 2 == 0 => String::from_utf16(&data.chunks_exact(2).map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]])).collect::<Vec<_>>()).ok(),
        _ => None,
    }
}

fn state_from_db(path: &Path) -> Result<Option<String>, String> {
    let mut options = Options::default();
    options.create_if_missing = false;
    let mut db = DB::open(path, options).map_err(|error| error.to_string())?;
    let mut rows = db.new_iter().map_err(|error| error.to_string())?;
    while let Some((key, value)) = rows.next() {
        if !key.starts_with(b"_") { continue; }
        let Some(separator) = key.iter().position(|byte| *byte == 0) else { continue; };
        let Some(name) = decode(&key[separator + 1..]) else { continue; };
        if name != STATE_KEY { continue; }
        let Some(text) = decode(&value) else { return Err("Old workspace data could not be decoded".into()); };
        let state: Value = serde_json::from_str(&text).map_err(|_| "Old workspace data is not valid JSON")?;
        if !state.get("workspaces").is_some_and(Value::is_array) { return Err("Old workspace data has an unknown format".into()); }
        return Ok(Some(text));
    }
    Ok(None)
}

pub fn read() -> Result<Option<String>, String> {
    #[cfg(not(windows))]
    { return Ok(None); }
    #[cfg(windows)]
    {
        let source = env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is unavailable")?;
        let source = Path::new(&source).join("ai.voxiva.space/EBWebView/Default/Local Storage/leveldb");
        if !source.is_dir() { return Ok(None); }
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_nanos();
        let copy = env::temp_dir().join(format!("voxiva-legacy-{}-{nanos}", std::process::id()));
        fs::create_dir(&copy).map_err(|error| error.to_string())?;
        let result = (|| {
            for entry in fs::read_dir(&source).map_err(|error| error.to_string())? {
                let entry = entry.map_err(|error| error.to_string())?;
                if !entry.file_type().map_err(|error| error.to_string())?.is_file() || entry.file_name() == "LOCK" { continue; }
                fs::copy(entry.path(), copy.join(entry.file_name())).map_err(|error| format!("Could not copy old workspace data: {error}"))?;
            }
            state_from_db(&copy)
        })();
        let _ = fs::remove_dir_all(&copy);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_chromium_local_storage_without_changing_source() {
        let dir = env::temp_dir().join(format!("voxiva-legacy-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let mut db = DB::open(&dir, Options::default()).unwrap();
        db.put(b"_http://tauri.localhost\0\x01voxiva-space-state-v1", b"\x01{\"workspaces\":[]}").unwrap();
        db.flush().unwrap();
        drop(db);
        assert_eq!(state_from_db(&dir).unwrap().as_deref(), Some("{\"workspaces\":[]}"));
        let _ = fs::remove_dir_all(dir);
    }
}
