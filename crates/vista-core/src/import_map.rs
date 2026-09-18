use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VistaImportResolution {
    pub normalized_request: String,
    pub subpath: String,
    pub candidate_bases: Vec<String>,
    pub resolved_path: Option<String>,
}

pub fn normalize_vista_request(request: &str) -> Option<String> {
    let normalized_request = if request == "@vistagenic/vista" {
        "vista".to_string()
    } else if let Some(stripped) = request.strip_prefix("@vistagenic/vista/") {
        format!("vista/{stripped}")
    } else {
        request.to_string()
    };

    if normalized_request == "vista" || normalized_request.starts_with("vista/") {
        Some(normalized_request)
    } else {
        None
    }
}

pub fn candidate_bases_for_subpath(subpath: &str) -> Vec<String> {
    if subpath.is_empty() {
        return vec!["react-server".to_string(), "index".to_string()];
    }

    match subpath {
        "link" => vec![
            "client/link.react-server".to_string(),
            "client/link".to_string(),
        ],
        "image" => vec!["image/react-server".to_string(), "image/index".to_string()],
        "router" => vec![
            "client/router.react-server".to_string(),
            "client/router".to_string(),
        ],
        "navigation" => vec![
            "client/navigation.react-server".to_string(),
            "client/navigation".to_string(),
        ],
        "dynamic" => vec![
            "client/dynamic.react-server".to_string(),
            "client/dynamic".to_string(),
        ],
        "script" => vec![
            "client/script.react-server".to_string(),
            "client/script".to_string(),
        ],
        "font" => vec!["font/index".to_string()],
        "font/google" => vec!["font/google".to_string()],
        "font/local" => vec!["font/local".to_string()],
        "theme" => vec!["theme/react-server".to_string(), "theme/index".to_string()],
        "head" => vec![
            "client/head.react-server".to_string(),
            "client/head".to_string(),
        ],
        "config" => vec!["config".to_string()],
        "auth" => vec!["auth/index".to_string()],
        "auth/react" => vec![
            "auth/react-server".to_string(),
            "auth/react".to_string(),
        ],
        "ai" => vec!["ai/index".to_string()],
        "ai/react" => vec![
            "ai/react/react-server".to_string(),
            "ai/react/index".to_string(),
        ],
        "stack" => vec!["stack/index".to_string()],
        "stack/client" => vec!["stack/client/index".to_string()],
        "client/rsc-router" => vec![
            "client/rsc-router.react-server".to_string(),
            "client/rsc-router".to_string(),
        ],
        "client/server-actions" => vec!["client/server-actions".to_string()],
        "server" => vec!["server/index".to_string()],
        "server/runtime-actions" => vec!["server/runtime-actions".to_string()],
        "cache" => vec!["server/cache".to_string()],
        _ => {
            if let Some(stripped) = subpath.strip_prefix("server/") {
                vec![format!("server/{stripped}")]
            } else if let Some(stripped) = subpath.strip_prefix("client/") {
                vec![format!("client/{stripped}")]
            } else {
                vec![subpath.to_string()]
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn react_server_candidates_match_typescript_import_map() {
        assert_eq!(
            candidate_bases_for_subpath("theme"),
            vec!["theme/react-server".to_string(), "theme/index".to_string()]
        );
        assert_eq!(
            candidate_bases_for_subpath("link"),
            vec![
                "client/link.react-server".to_string(),
                "client/link".to_string()
            ]
        );
        assert_eq!(
            candidate_bases_for_subpath("auth/react"),
            vec!["auth/react-server".to_string(), "auth/react".to_string()]
        );
        assert_eq!(
            candidate_bases_for_subpath("ai/react"),
            vec![
                "ai/react/react-server".to_string(),
                "ai/react/index".to_string()
            ]
        );
        assert_eq!(
            candidate_bases_for_subpath("client/rsc-router"),
            vec![
                "client/rsc-router.react-server".to_string(),
                "client/rsc-router".to_string()
            ]
        );
        assert_eq!(
            candidate_bases_for_subpath("navigation"),
            vec![
                "client/navigation.react-server".to_string(),
                "client/navigation".to_string()
            ]
        );
    }
}
