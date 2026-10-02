use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashRuntimeModule {
    pub module_id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RuntimeManifest {
    modules: BTreeMap<String, FlashRuntimeModule>,
}

impl RuntimeManifest {
    pub fn new() -> Self {
        Self {
            modules: BTreeMap::new(),
        }
    }

    pub fn insert(&mut self, module_id: impl Into<String>, chunk: impl Into<String>) {
        let module_id = module_id.into();
        let chunk = chunk.into();
        self.modules.insert(
            module_id.clone(),
            FlashRuntimeModule { module_id, chunk },
        );
    }

    pub fn get(&self, module_id: &str) -> Option<&FlashRuntimeModule> {
        self.modules.get(module_id)
    }

    pub fn chunk_ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.modules.values().map(|module| module.chunk.clone()).collect();
        ids.sort();
        ids.dedup();
        ids
    }
}

pub fn module_url(module_id: &str) -> String {
    let id = module_id.replace('\\', "/");
    format!("/_flashpack/modules/{id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_inserts_overwrites_and_sorts_unique_chunks() {
        let mut manifest = RuntimeManifest::new();
        manifest.insert("pages/home", "main");
        manifest.insert("pages\\about", "about");
        manifest.insert("pages/home", "home");
        manifest.insert(String::from("shared"), String::from("main"));

        let home = manifest.get("pages/home").unwrap();
        assert_eq!(home.module_id, "pages/home");
        assert_eq!(home.chunk, "home");
        assert_eq!(manifest.get("shared").unwrap().chunk, "main");
        assert_eq!(
            manifest.chunk_ids(),
            vec!["about".to_string(), "home".to_string(), "main".to_string()]
        );
        assert_eq!(
            module_url("pages\\about"),
            "/_flashpack/modules/pages/about"
        );
        assert_eq!(module_url("pkg/mod"), "/_flashpack/modules/pkg/mod");
    }

    #[test]
    fn missing_module_and_empty_manifest() {
        let manifest = RuntimeManifest::new();
        assert!(manifest.get("missing").is_none());
        assert!(manifest.chunk_ids().is_empty());
        assert_eq!(module_url(""), "/_flashpack/modules/");
        assert_eq!(
            module_url("..\\secret"),
            "/_flashpack/modules/../secret"
        );
    }
}
