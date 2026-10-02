use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlashTaskBackendKind {
    InMemory,
    Filesystem,
}

#[derive(Debug, Default)]
pub struct InMemoryBackend {
    entries: BTreeMap<String, String>,
}

impl InMemoryBackend {
    pub fn new() -> Self {
        Self {
            entries: BTreeMap::new(),
        }
    }

    pub fn put(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.entries.insert(key.into(), value.into());
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.entries.get(key).map(String::as_str)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn kind(&self) -> FlashTaskBackendKind {
        FlashTaskBackendKind::InMemory
    }
}

#[derive(Debug, Clone)]
pub struct FsBackend {
    root: PathBuf,
}

impl FsBackend {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn put(&self, key: impl Into<String>, value: impl Into<String>) -> Result<(), String> {
        let key = key.into();
        validate_key(&key)?;
        std::fs::create_dir_all(&self.root).map_err(|err| err.to_string())?;
        std::fs::write(self.root.join(key), value.into()).map_err(|err| err.to_string())
    }

    pub fn get(&self, key: &str) -> Result<String, String> {
        validate_key(key)?;
        std::fs::read_to_string(self.root.join(key)).map_err(|err| err.to_string())
    }

    pub fn kind(&self) -> FlashTaskBackendKind {
        FlashTaskBackendKind::Filesystem
    }
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.is_empty() || key.contains("..") || key.contains('/') || key.contains('\\') {
        Err(format!("invalid key '{key}'"))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "flash-tasks-backend-{}-{nanos}-{seq}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn in_memory_backend_stores_values() {
        let mut backend = InMemoryBackend::new();
        assert_eq!(backend.kind(), FlashTaskBackendKind::InMemory);
        assert_eq!(backend.len(), 0);
        assert_eq!(backend.get("missing"), None);

        backend.put("alpha", "one");
        backend.put("beta", "two");
        backend.put("alpha", "replaced");
        assert_eq!(backend.len(), 2);
        assert_eq!(backend.get("alpha"), Some("replaced"));
        assert_eq!(backend.get("beta"), Some("two"));
    }

    #[test]
    fn filesystem_backend_roundtrips_and_rejects_unsafe_keys() {
        let dir = TempDir::new();
        let backend = FsBackend::new(dir.0.join("store"));
        assert_eq!(backend.kind(), FlashTaskBackendKind::Filesystem);

        backend.put("job", "payload").unwrap();
        assert_eq!(backend.get("job").unwrap(), "payload");
        backend.put("job", "next").unwrap();
        assert_eq!(backend.get("job").unwrap(), "next");

        let escape = backend.put("../secret", "no").unwrap_err();
        assert!(escape.contains("invalid key"), "{escape}");
        let slash = backend.put("a/b", "no").unwrap_err();
        assert!(slash.contains("invalid key"), "{slash}");
        let backslash = backend.get("a\\b").unwrap_err();
        assert!(backslash.contains("invalid key"), "{backslash}");

        let missing = backend.get("absent").unwrap_err();
        assert!(!missing.contains("invalid key"), "{missing}");
    }
}
