#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModuleNode {
    pub id: String,
    pub imports: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModuleGraphSummary {
    pub module_count: usize,
    pub edge_count: usize,
}

impl ModuleGraphSummary {
    pub fn from_nodes(nodes: &[ModuleNode]) -> Self {
        let edge_count = nodes.iter().map(|node| node.imports.len()).sum();

        Self {
            module_count: nodes.len(),
            edge_count,
        }
    }
}
