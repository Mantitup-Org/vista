#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BundleGraph {
    modules: Vec<String>,
    edges: Vec<(String, String)>,
}

impl BundleGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_module(&mut self, id: impl Into<String>) {
        self.ensure_module(id.into());
    }

    pub fn add_import(&mut self, from: impl Into<String>, to: impl Into<String>) {
        let from = from.into();
        let to = to.into();
        self.ensure_module(from.clone());
        self.ensure_module(to.clone());
        if !self
            .edges
            .iter()
            .any(|(existing_from, existing_to)| existing_from == &from && existing_to == &to)
        {
            self.edges.push((from, to));
        }
    }

    pub fn module_count(&self) -> usize {
        self.modules.len()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }

    pub fn cycles(&self) -> Vec<Vec<String>> {
        let module_count = self.modules.len();
        if module_count == 0 || self.edges.is_empty() {
            return Vec::new();
        }

        let mut adjacency = vec![Vec::new(); module_count];
        for (from, to) in &self.edges {
            let Some(from_index) = self.module_index(from) else {
                continue;
            };
            let Some(to_index) = self.module_index(to) else {
                continue;
            };
            if !adjacency[from_index].contains(&to_index) {
                adjacency[from_index].push(to_index);
            }
        }

        let mut cycles = Vec::new();
        let mut path = Vec::new();
        let mut on_path = vec![false; module_count];
        for start in 0..module_count {
            if cycles.len() >= 20 {
                break;
            }
            path.clear();
            on_path.fill(false);
            self.walk_cycles(
                start,
                start,
                &adjacency,
                &mut path,
                &mut on_path,
                &mut cycles,
            );
        }
        cycles
    }

    pub fn analyze_summary(&self) -> String {
        format!(
            "modules={};edges={}",
            self.module_count(),
            self.edge_count()
        )
    }

    fn ensure_module(&mut self, id: String) {
        if !self.modules.iter().any(|existing| existing == &id) {
            self.modules.push(id);
        }
    }

    fn module_index(&self, id: &str) -> Option<usize> {
        self.modules.iter().position(|existing| existing == id)
    }

    fn walk_cycles(
        &self,
        start: usize,
        node: usize,
        adjacency: &[Vec<usize>],
        path: &mut Vec<usize>,
        on_path: &mut [bool],
        cycles: &mut Vec<Vec<String>>,
    ) {
        if cycles.len() >= 20 {
            return;
        }

        path.push(node);
        on_path[node] = true;

        for &next in &adjacency[node] {
            if cycles.len() >= 20 {
                break;
            }
            if next == start {
                let mut cycle = Vec::with_capacity(path.len() + 1);
                for &index in path.iter() {
                    cycle.push(self.modules[index].clone());
                }
                cycle.push(self.modules[start].clone());
                cycles.push(cycle);
            } else if !on_path[next] && next > start {
                self.walk_cycles(start, next, adjacency, path, on_path, cycles);
            }
        }

        path.pop();
        on_path[node] = false;
    }
}

pub fn summarize_bundle(modules: usize, chunks: usize) -> String {
    format!("modules={modules};chunks={chunks}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|id| (*id).to_string()).collect()
    }

    #[test]
    fn summarize_bundle_keeps_chunk_format() {
        assert_eq!(summarize_bundle(4, 2), "modules=4;chunks=2");
    }

    #[test]
    fn tracks_modules_edges_and_summary() {
        let mut graph = BundleGraph::new();
        assert_eq!(graph.analyze_summary(), "modules=0;edges=0");
        assert!(graph.cycles().is_empty());

        graph.add_module("app");
        graph.add_module("app");
        graph.add_import("app", "lib");
        graph.add_import("app", "lib");
        graph.add_import("lib", "util");

        assert_eq!(graph.module_count(), 3);
        assert_eq!(graph.edge_count(), 2);
        assert_eq!(graph.analyze_summary(), "modules=3;edges=2");
        assert!(graph.cycles().is_empty());
    }

    #[test]
    fn lists_closed_cycle_paths() {
        let mut graph = BundleGraph::new();
        graph.add_import("app", "lib");
        graph.add_import("lib", "util");
        graph.add_import("util", "app");
        graph.add_import("app", "vendor");
        graph.add_import("vendor", "app");

        assert_eq!(
            graph.cycles(),
            vec![
                strings(&["app", "lib", "util", "app"]),
                strings(&["app", "vendor", "app"]),
            ]
        );
    }

    #[test]
    fn self_loop_is_a_closed_cycle_and_output_is_capped() {
        let mut single = BundleGraph::new();
        single.add_import("alone", "alone");
        assert_eq!(single.cycles(), vec![strings(&["alone", "alone"])]);

        let mut graph = BundleGraph::new();
        for index in 0..25 {
            let id = format!("m{index}");
            graph.add_import(&id, &id);
        }
        let cycles = graph.cycles();
        assert_eq!(cycles.len(), 20);
        assert_eq!(cycles[0], strings(&["m0", "m0"]));
        assert_eq!(cycles[19], strings(&["m19", "m19"]));
        assert!(cycles.iter().all(|cycle| cycle.first() == cycle.last()));
    }

    #[test]
    fn finds_a_cycle_that_does_not_include_the_first_module() {
        let mut graph = BundleGraph::new();
        graph.add_module("a");
        graph.add_import("b", "c");
        graph.add_import("c", "b");
        assert_eq!(graph.cycles(), vec![strings(&["b", "c", "b"])]);
    }
}
