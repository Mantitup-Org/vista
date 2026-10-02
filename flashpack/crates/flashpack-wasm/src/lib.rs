pub fn flashpack_wasm_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WasmHeader {
    pub version: u32,
}

pub fn inspect_wasm(bytes: &[u8]) -> Result<WasmHeader, String> {
    if bytes.len() < 8 {
        return Err("wasm module is too short".into());
    }
    if bytes[0..4] != [0x00, 0x61, 0x73, 0x6d] {
        return Err("invalid wasm magic".into());
    }
    let version = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
    Ok(WasmHeader { version })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_crate_version() {
        assert_eq!(flashpack_wasm_version(), env!("CARGO_PKG_VERSION"));
        assert_eq!(flashpack_wasm_version(), "0.1.0");
    }

    #[test]
    fn reads_little_endian_version_after_magic() {
        let module = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0xFF];
        assert_eq!(inspect_wasm(&module).unwrap(), WasmHeader { version: 1 });
        let custom = [0x00, 0x61, 0x73, 0x6d, 0x02, 0x00, 0x00, 0x00];
        assert_eq!(inspect_wasm(&custom).unwrap().version, 2);
    }

    #[test]
    fn rejects_short_buffers_and_bad_magic() {
        assert!(inspect_wasm(&[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00]).is_err());
        assert!(inspect_wasm(&[0x00, 0x61, 0x73, 0x00, 0x01, 0x00, 0x00, 0x00]).is_err());
        assert!(inspect_wasm(&[]).is_err());
    }
}
