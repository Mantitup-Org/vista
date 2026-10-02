#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashpackTestCase {
    pub name: String,
    pub phase: String,
}

pub fn catalog() -> Vec<FlashpackTestCase> {
    vec![
        FlashpackTestCase {
            name: "resolve-entry".to_string(),
            phase: "resolve".to_string(),
        },
        FlashpackTestCase {
            name: "css-modules".to_string(),
            phase: "css".to_string(),
        },
        FlashpackTestCase {
            name: "dev-hmr".to_string(),
            phase: "dev".to_string(),
        },
        FlashpackTestCase {
            name: "trace-events".to_string(),
            phase: "trace".to_string(),
        },
        FlashpackTestCase {
            name: "resolve-aliases".to_string(),
            phase: "resolve".to_string(),
        },
    ]
}

pub fn by_phase<'a>(cases: &'a [FlashpackTestCase], phase: &str) -> Vec<&'a FlashpackTestCase> {
    cases.iter().filter(|case| case.phase == phase).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_covers_required_phases() {
        let cases = catalog();
        assert!(cases.len() >= 4);
        assert!(cases.iter().all(|case| !case.name.is_empty()));

        for phase in ["resolve", "css", "dev", "trace"] {
            let matched = by_phase(&cases, phase);
            assert!(!matched.is_empty());
            assert!(matched.iter().all(|case| case.phase == phase));
        }

        let resolved = by_phase(&cases, "resolve");
        assert_eq!(resolved[0].name, "resolve-entry");
        assert_eq!(resolved[1].name, "resolve-aliases");
        assert!(by_phase(&cases, "missing").is_empty());
    }
}
