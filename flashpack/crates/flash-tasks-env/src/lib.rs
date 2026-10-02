#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashTaskEnvVar {
    pub key: String,
    pub value: String,
}

pub fn capture_env(keys: &[&str]) -> Vec<FlashTaskEnvVar> {
    keys.iter()
        .filter_map(|key| {
            std::env::var(key).ok().map(|value| FlashTaskEnvVar {
                key: (*key).to_string(),
                value,
            })
        })
        .collect()
}

pub fn parse_env(source: &str) -> Vec<FlashTaskEnvVar> {
    let mut vars: Vec<FlashTaskEnvVar> = Vec::new();
    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let body = strip_export(trimmed);
        let Some((key, value)) = body.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() || key.contains(char::is_whitespace) {
            continue;
        }
        let value = unquote(value);
        if let Some(existing) = vars.iter_mut().find(|var| var.key == key) {
            existing.value = value;
        } else {
            vars.push(FlashTaskEnvVar {
                key: key.to_string(),
                value,
            });
        }
    }
    vars
}

pub fn overlay(base: &[FlashTaskEnvVar], extra: &[FlashTaskEnvVar]) -> Vec<FlashTaskEnvVar> {
    let mut result: Vec<FlashTaskEnvVar> = Vec::new();
    for var in base.iter().chain(extra.iter()) {
        if result.iter().any(|existing| existing.key == var.key) {
            continue;
        }
        let value = last_value(extra, &var.key)
            .or_else(|| last_value(base, &var.key))
            .unwrap_or(var.value.as_str());
        result.push(FlashTaskEnvVar {
            key: var.key.clone(),
            value: value.to_string(),
        });
    }
    result
}

fn strip_export(line: &str) -> &str {
    let Some(rest) = line.strip_prefix("export") else {
        return line;
    };
    let trimmed = rest.trim_start();
    if trimmed.len() == rest.len() {
        line
    } else {
        trimmed
    }
}

fn unquote(value: &str) -> String {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return value[1..value.len() - 1].to_string();
        }
    }
    value.to_string()
}

fn last_value<'a>(vars: &'a [FlashTaskEnvVar], key: &str) -> Option<&'a str> {
    vars.iter()
        .rev()
        .find(|var| var.key == key)
        .map(|var| var.value.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_env_assignments_and_overlays_later_values() {
        let source = "\n# comment\n  # also\n\nFOO=1\nexport BAR=\"baz\"\nBAZ='qux'\nFOO=later\n  export QUX=1\nexportFOO=keep\nEMPTY=\n";
        assert_eq!(
            parse_env(source),
            vec![
                FlashTaskEnvVar {
                    key: "FOO".to_string(),
                    value: "later".to_string(),
                },
                FlashTaskEnvVar {
                    key: "BAR".to_string(),
                    value: "baz".to_string(),
                },
                FlashTaskEnvVar {
                    key: "BAZ".to_string(),
                    value: "qux".to_string(),
                },
                FlashTaskEnvVar {
                    key: "QUX".to_string(),
                    value: "1".to_string(),
                },
                FlashTaskEnvVar {
                    key: "exportFOO".to_string(),
                    value: "keep".to_string(),
                },
                FlashTaskEnvVar {
                    key: "EMPTY".to_string(),
                    value: String::new(),
                },
            ]
        );

        let base = [
            FlashTaskEnvVar {
                key: "A".to_string(),
                value: "1".to_string(),
            },
            FlashTaskEnvVar {
                key: "B".to_string(),
                value: "2".to_string(),
            },
            FlashTaskEnvVar {
                key: "A".to_string(),
                value: "3".to_string(),
            },
        ];
        let extra = [
            FlashTaskEnvVar {
                key: "B".to_string(),
                value: "9".to_string(),
            },
            FlashTaskEnvVar {
                key: "C".to_string(),
                value: "4".to_string(),
            },
            FlashTaskEnvVar {
                key: "B".to_string(),
                value: "8".to_string(),
            },
        ];
        assert_eq!(
            overlay(&base, &extra),
            vec![
                FlashTaskEnvVar {
                    key: "A".to_string(),
                    value: "3".to_string(),
                },
                FlashTaskEnvVar {
                    key: "B".to_string(),
                    value: "8".to_string(),
                },
                FlashTaskEnvVar {
                    key: "C".to_string(),
                    value: "4".to_string(),
                },
            ]
        );
    }

    #[test]
    fn skips_malformed_lines_and_missing_environment_keys() {
        let parsed = parse_env("NOT VALID\n=novalue\n  \n# KEY=hidden\nKEY=\"ab'\n");
        assert_eq!(
            parsed,
            vec![FlashTaskEnvVar {
                key: "KEY".to_string(),
                value: "\"ab'".to_string(),
            }]
        );

        let key = "VISTA_FLASH_TASKS_ENV_MISSING_KEY_SHOULD_NOT_EXIST";
        std::env::remove_var(key);
        assert!(capture_env(&[key]).is_empty());
    }
}
