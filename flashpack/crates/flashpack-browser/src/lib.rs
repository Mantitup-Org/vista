use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
pub struct BrowserChunk {
    pub id: String,
}

#[derive(Debug, Default, Clone)]
pub struct ChunkGraph {
    chunks: HashMap<String, BrowserChunk>,
    imports: HashMap<String, Vec<String>>,
}

impl ChunkGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, id: impl Into<String>, imports: &[&str]) {
        let id = id.into();
        let imported = imports.iter().map(|import| (*import).to_string()).collect();
        self.chunks
            .insert(id.clone(), BrowserChunk { id: id.clone() });
        self.imports.insert(id, imported);
    }

    pub fn get(&self, id: &str) -> Option<&BrowserChunk> {
        self.chunks.get(id)
    }

    pub fn imports_of(&self, id: &str) -> &[String] {
        self.imports.get(id).map(Vec::as_slice).unwrap_or(&[])
    }
}

pub fn preload_list(graph: &ChunkGraph, entry: &str) -> Vec<String> {
    let mut ordered = Vec::new();
    let mut seen = HashSet::new();
    visit(graph, entry, &mut ordered, &mut seen);
    ordered
}

fn visit(graph: &ChunkGraph, id: &str, ordered: &mut Vec<String>, seen: &mut HashSet<String>) {
    if graph.get(id).is_none() || !seen.insert(id.to_string()) {
        return;
    }
    ordered.push(id.to_string());
    let imports = graph.imports_of(id).to_vec();
    for import in imports {
        visit(graph, &import, ordered, seen);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_chunks_and_walks_preloads_depth_first() {
        let mut graph = ChunkGraph::new();
        assert!(graph.get("entry").is_none());
        assert!(graph.imports_of("entry").is_empty());
        assert!(preload_list(&graph, "entry").is_empty());

        graph.insert("entry", &["vendor", "missing", "app"]);
        graph.insert("vendor", &[]);
        graph.insert("app", &["vendor", "entry"]);
        graph.insert("entry", &["app", "vendor"]);

        assert_eq!(
            graph.get("entry").map(|chunk| chunk.id.as_str()),
            Some("entry")
        );
        assert_eq!(
            graph.imports_of("entry"),
            &["app".to_string(), "vendor".to_string()]
        );
        assert_eq!(
            preload_list(&graph, "entry"),
            vec!["entry".to_string(), "app".to_string(), "vendor".to_string()]
        );
        assert_eq!(
            preload_list(&graph, "app"),
            vec!["app".to_string(), "vendor".to_string(), "entry".to_string()]
        );
    }
}
