use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VistaRouteKind {
    Static,
    Dynamic,
    CatchAll,
    ParallelSlot,
    Interception,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VistaRouteDefinition {
    pub route: String,
    pub kind: VistaRouteKind,
    pub segment_count: usize,
}

impl VistaRouteDefinition {
    pub fn new(route: impl Into<String>, kind: VistaRouteKind) -> Self {
        let route = route.into();
        let segment_count = route
            .split('/')
            .filter(|segment| !segment.is_empty())
            .count();

        Self {
            route,
            kind,
            segment_count,
        }
    }
}

/// How an `app/` folder name participates in the URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassifiedSegment {
    /// `static`, `dynamic`, `catch-all`, `optional-catch-all`, `group`, `parallel`, or `interception`.
    pub kind: &'static str,
    /// Param name, group name, or folder name. Empty only for the app root.
    pub segment: String,
}

/// Classify one `app/` directory name.
///
/// Dynamic folders keep the param name (`[slug]` → `slug`) so routers can use
/// `segment` as the params key. Route groups keep the name inside the
/// parentheses. Parallel and interception folders are not URL segments.
pub fn classify_app_segment(folder_name: &str) -> ClassifiedSegment {
    if folder_name.is_empty() {
        return ClassifiedSegment {
            kind: "static",
            segment: String::new(),
        };
    }

    if folder_name.starts_with("(...)")
        || folder_name.starts_with("(..)(..)")
        || folder_name.starts_with("(..)")
        || folder_name.starts_with("(.)")
    {
        return ClassifiedSegment {
            kind: "interception",
            segment: folder_name.to_string(),
        };
    }

    if folder_name.starts_with('(') && folder_name.ends_with(')') && folder_name.len() >= 2 {
        return ClassifiedSegment {
            kind: "group",
            segment: folder_name[1..folder_name.len() - 1].to_string(),
        };
    }

    if folder_name.starts_with('@') && folder_name.len() > 1 {
        return ClassifiedSegment {
            kind: "parallel",
            segment: folder_name[1..].to_string(),
        };
    }

    if let Some(name) = unwrap_dynamic(folder_name, "[[...", "]]") {
        return ClassifiedSegment {
            kind: "optional-catch-all",
            segment: name,
        };
    }

    if let Some(name) = unwrap_dynamic(folder_name, "[...", "]") {
        return ClassifiedSegment {
            kind: "catch-all",
            segment: name,
        };
    }

    if folder_name.starts_with('[') && folder_name.ends_with(']') && folder_name.len() >= 2 {
        return ClassifiedSegment {
            kind: "dynamic",
            segment: folder_name[1..folder_name.len() - 1].to_string(),
        };
    }

    ClassifiedSegment {
        kind: "static",
        segment: folder_name.to_string(),
    }
}

fn unwrap_dynamic(folder_name: &str, prefix: &str, suffix: &str) -> Option<String> {
    let name = folder_name.strip_prefix(prefix)?.strip_suffix(suffix)?;
    if name.is_empty() || name.contains('[') || name.contains(']') {
        return None;
    }
    Some(name.to_string())
}

/// URL pattern for a chain of `app/` folder names, starting under `app/`.
/// Groups, parallel slots, and interception folders do not add a path piece.
/// Optional catch-all uses the `:name*?` form the static generator already expands.
pub fn route_pattern(folders: &[&str]) -> String {
    let mut parts = Vec::new();
    for folder in folders {
        let classified = classify_app_segment(folder);
        match classified.kind {
            "group" | "parallel" | "interception" => {}
            "dynamic" => parts.push(format!(":{}", classified.segment)),
            "catch-all" => parts.push(format!(":{}*", classified.segment)),
            "optional-catch-all" => parts.push(format!(":{}*?", classified.segment)),
            _ => parts.push(classified.segment),
        }
    }
    if parts.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", parts.join("/"))
    }
}

#[cfg(test)]
mod segment_tests {
    use super::*;

    #[test]
    fn classifies_app_folders() {
        assert_eq!(classify_app_segment("(marketing)").kind, "group");
        assert_eq!(classify_app_segment("(marketing)").segment, "marketing");
        assert_eq!(classify_app_segment("[slug]").segment, "slug");
        assert_eq!(classify_app_segment("[...slug]").kind, "catch-all");
        assert_eq!(classify_app_segment("[[...slug]]").kind, "optional-catch-all");
        assert_eq!(classify_app_segment("[[...slug]]").segment, "slug");
        assert_eq!(classify_app_segment("@modal").kind, "parallel");
        assert_eq!(classify_app_segment("(.)photo").kind, "interception");
        assert_eq!(classify_app_segment("(..)(..)photo").kind, "interception");
    }

    #[test]
    fn route_pattern_skips_non_url_folders() {
        assert_eq!(
            route_pattern(&["(marketing)", "blog", "[slug]", "[[...rest]]"]),
            "/blog/:slug/:rest*?"
        );
        assert_eq!(route_pattern(&["@modal", "(.)photo"]), "/");
    }
}
