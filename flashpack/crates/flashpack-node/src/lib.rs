#[derive(Debug, Clone)]
pub struct NodeLaunchOptions {
    pub entry: String,
    pub args: Vec<String>,
}

impl NodeLaunchOptions {
    pub fn new(entry: impl Into<String>) -> Self {
        Self {
            entry: entry.into(),
            args: Vec::new(),
        }
    }

    pub fn argv(&self) -> Vec<String> {
        let mut argv = Vec::with_capacity(2 + self.args.len());
        argv.push("node".to_string());
        argv.push(self.entry.clone());
        argv.extend(self.args.iter().cloned());
        argv
    }

    pub fn with_args(mut self, args: &[impl AsRef<str>]) -> Self {
        self.args = args.iter().map(|arg| arg.as_ref().to_string()).collect();
        self
    }

    pub fn command_line(&self) -> String {
        self.argv()
            .iter()
            .enumerate()
            .map(|(index, part)| {
                if index == 1 && part.contains(' ') {
                    format!("\"{part}\"")
                } else {
                    part.clone()
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argv_and_command_line_include_entry_and_args() {
        let options = NodeLaunchOptions::new("server.js").with_args(&["--watch", "--inspect"]);
        assert_eq!(
            options.argv(),
            vec![
                "node".to_string(),
                "server.js".to_string(),
                "--watch".to_string(),
                "--inspect".to_string()
            ]
        );
        assert_eq!(options.command_line(), "node server.js --watch --inspect");

        let spaced = NodeLaunchOptions::new("my server.js").with_args(&["--watch"]);
        assert_eq!(
            spaced.argv(),
            vec![
                "node".to_string(),
                "my server.js".to_string(),
                "--watch".to_string()
            ]
        );
        assert_eq!(spaced.command_line(), "node \"my server.js\" --watch");
    }

    #[test]
    fn with_args_replaces_previous_args() {
        let options = NodeLaunchOptions::new("a.js")
            .with_args(&["first"])
            .with_args(&["second"]);
        assert_eq!(
            options.argv(),
            vec!["node".to_string(), "a.js".to_string(), "second".to_string()]
        );
    }

    #[test]
    fn empty_entry_and_args_stay_explicit() {
        let options = NodeLaunchOptions::new("");
        assert!(options.args.is_empty());
        assert_eq!(options.argv(), vec!["node".to_string(), String::new()]);
        assert_eq!(options.command_line(), "node ");

        let cleared = NodeLaunchOptions::new("app.js").with_args(&[] as &[&str]);
        assert!(cleared.args.is_empty());
        assert_eq!(cleared.command_line(), "node app.js");
    }
}
