pub fn wasm_runtime_name() -> &'static str {
    "vista-wasm"
}

/// URL pattern for `app/` folder names. This is the piece a WASM host can call
/// without pulling in the Node addon.
pub fn route_pattern(folders: &[&str]) -> String {
    vista_core::route_pattern(folders)
}

pub fn segment_kind(folder_name: &str) -> &'static str {
    vista_core::classify_app_segment(folder_name).kind
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pattern_matches_app_router_folders() {
        assert_eq!(segment_kind("[[...slug]]"), "optional-catch-all");
        assert_eq!(segment_kind("@modal"), "parallel");
        assert_eq!(
            route_pattern(&["(shop)", "products", "[id]"]),
            "/products/:id"
        );
    }
}
