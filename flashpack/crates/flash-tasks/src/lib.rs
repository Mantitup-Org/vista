use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskState {
    Pending,
    Running,
    Complete,
}

pub trait Task {
    fn key(&self) -> &str;
    fn state(&self) -> TaskState;
}

#[derive(Debug, Default)]
pub struct TaskGraph {
    tasks: Vec<(String, Vec<String>)>,
}

impl TaskGraph {
    pub fn new() -> Self {
        Self { tasks: Vec::new() }
    }

    pub fn add(&mut self, key: impl Into<String>, deps: &[&str]) -> Result<(), String> {
        let key = key.into();
        if self.tasks.iter().any(|(existing, _)| existing == &key) {
            return Err(format!("duplicate task '{key}'"));
        }
        let mut stored = Vec::new();
        for dep in deps {
            let dep = (*dep).to_string();
            if !stored.iter().any(|existing| existing == &dep) {
                stored.push(dep);
            }
        }
        self.tasks.push((key, stored));
        Ok(())
    }

    pub fn order(&self) -> Result<Vec<String>, String> {
        for (key, deps) in &self.tasks {
            for dep in deps {
                if !self.tasks.iter().any(|(existing, _)| existing == dep) {
                    return Err(format!("missing dependency '{dep}' required by '{key}'"));
                }
            }
        }

        let mut indegree: HashMap<&str, usize> = HashMap::new();
        let mut dependents: HashMap<&str, Vec<&str>> = HashMap::new();
        for (key, _) in &self.tasks {
            indegree.insert(key.as_str(), 0);
            dependents.insert(key.as_str(), Vec::new());
        }
        for (key, deps) in &self.tasks {
            for dep in deps {
                *indegree.get_mut(key.as_str()).expect("task key") += 1;
                dependents
                    .get_mut(dep.as_str())
                    .expect("dependency key")
                    .push(key.as_str());
            }
        }

        let mut ready: BTreeSet<&str> = indegree
            .iter()
            .filter(|(_, degree)| **degree == 0)
            .map(|(key, _)| *key)
            .collect();
        let mut ordered = Vec::with_capacity(self.tasks.len());
        while let Some(next) = ready.iter().next().copied() {
            ready.remove(next);
            ordered.push(next.to_string());
            for dependent in &dependents[next] {
                let degree = indegree.get_mut(dependent).expect("dependent");
                *degree -= 1;
                if *degree == 0 {
                    ready.insert(dependent);
                }
            }
        }

        if ordered.len() != self.tasks.len() {
            let mut remaining: Vec<&str> = self
                .tasks
                .iter()
                .map(|(key, _)| key.as_str())
                .filter(|key| !ordered.iter().any(|done| done == key))
                .collect();
            remaining.sort_unstable();
            let names = remaining
                .iter()
                .map(|key| format!("'{key}'"))
                .collect::<Vec<_>>()
                .join(", ");
            return Err(format!("cycle detected involving {names}"));
        }

        Ok(ordered)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Sample {
        key: &'static str,
        state: TaskState,
    }

    impl Task for Sample {
        fn key(&self) -> &str {
            self.key
        }

        fn state(&self) -> TaskState {
            self.state
        }
    }

    #[test]
    fn orders_dependencies_before_dependents_and_breaks_ties_lexicographically() {
        let mut graph = TaskGraph::new();
        graph.add("compile", &["parse"]).unwrap();
        graph.add("lint", &["parse"]).unwrap();
        graph.add("parse", &[]).unwrap();
        graph.add("zebra", &[]).unwrap();
        graph.add("alpha", &[]).unwrap();
        assert_eq!(
            graph.order().unwrap(),
            vec!["alpha", "parse", "compile", "lint", "zebra"]
        );

        let mut ties = TaskGraph::new();
        ties.add("b", &[]).unwrap();
        ties.add("a", &[]).unwrap();
        assert_eq!(ties.order().unwrap(), vec!["a", "b"]);

        let task = Sample {
            key: "parse",
            state: TaskState::Pending,
        };
        assert_eq!(task.key(), "parse");
        assert_eq!(task.state(), TaskState::Pending);
    }

    #[test]
    fn reports_duplicates_missing_dependencies_and_cycles() {
        let mut graph = TaskGraph::new();
        graph.add("build", &["missing"]).unwrap();
        assert!(graph.add("build", &[]).unwrap_err().contains("build"));
        let missing = graph.order().unwrap_err();
        assert!(missing.contains("missing"), "{missing}");
        assert!(missing.contains("build"), "{missing}");

        let mut cycle = TaskGraph::new();
        cycle.add("a", &["b"]).unwrap();
        cycle.add("b", &["c"]).unwrap();
        cycle.add("c", &["a"]).unwrap();
        let err = cycle.order().unwrap_err();
        assert!(err.contains("'a'"), "{err}");
        assert!(err.contains("'b'"), "{err}");
        assert!(err.contains("'c'"), "{err}");

        let mut self_cycle = TaskGraph::new();
        self_cycle.add("loop", &["loop"]).unwrap();
        let err = self_cycle.order().unwrap_err();
        assert!(err.contains("'loop'"), "{err}");
    }
}
