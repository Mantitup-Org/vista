#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashpackCliContext {
    pub cwd: String,
    pub phase: String,
}

pub fn flag(args: &[String], key: &str) -> Option<String> {
    let exact = format!("--{key}");
    let prefix = format!("--{key}=");
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if let Some(value) = arg.strip_prefix(&prefix) {
            return Some(value.to_string());
        }
        if arg == &exact {
            return args.next().cloned();
        }
    }
    None
}

impl FlashpackCliContext {
    pub fn from_args(args: &[String]) -> Self {
        Self {
            cwd: flag(args, "cwd").unwrap_or_else(|| ".".to_string()),
            phase: flag(args, "phase").unwrap_or_else(|| "build".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn reads_spaced_and_equals_flags() {
        let spaced = args(&["--cwd", "apps/web", "--phase", "dev"]);
        assert_eq!(flag(&spaced, "cwd").as_deref(), Some("apps/web"));
        assert_eq!(flag(&spaced, "phase").as_deref(), Some("dev"));
        assert_eq!(flag(&spaced, "missing"), None);

        let equals = args(&["--cwd=packages", "--phase=trace", "extra"]);
        assert_eq!(flag(&equals, "cwd").as_deref(), Some("packages"));
        assert_eq!(flag(&equals, "phase").as_deref(), Some("trace"));
        assert_eq!(flag(&args(&["--phase"]), "phase"), None);
        assert_eq!(
            flag(&args(&["--cwd", "a", "--cwd", "b"]), "cwd").as_deref(),
            Some("a")
        );
    }

    #[test]
    fn context_defaults_cwd_and_phase() {
        assert_eq!(
            FlashpackCliContext::from_args(&[]),
            FlashpackCliContext {
                cwd: ".".to_string(),
                phase: "build".to_string(),
            }
        );
        assert_eq!(
            FlashpackCliContext::from_args(&args(&["--verbose", "--cwd=pkg", "--phase", "css"])),
            FlashpackCliContext {
                cwd: "pkg".to_string(),
                phase: "css".to_string(),
            }
        );
    }
}
