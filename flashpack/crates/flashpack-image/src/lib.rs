#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashpackImageJob {
    pub source_path: String,
    pub output_path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImageInfo {
    pub format: &'static str,
    pub width: u32,
    pub height: u32,
}

pub fn sniff_image(bytes: &[u8]) -> Option<ImageInfo> {
    sniff_png(bytes)
        .or_else(|| sniff_gif(bytes))
        .or_else(|| sniff_jpeg(bytes))
}

pub fn plan_image_job(source: &str, out_dir: &str) -> FlashpackImageJob {
    let trimmed = source.trim_end_matches(['/', '\\']);
    let name = trimmed
        .rsplit(['/', '\\'])
        .next()
        .filter(|segment| !segment.is_empty())
        .unwrap_or("image");
    let stem = std::path::Path::new(name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.is_empty())
        .unwrap_or("image");
    let dir = out_dir.replace('\\', "/");
    let dir_trim = dir.trim_end_matches('/');
    let output_path = if dir_trim.is_empty() {
        if dir.starts_with('/') {
            format!("/{stem}.img.txt")
        } else {
            format!("{stem}.img.txt")
        }
    } else {
        format!("{dir_trim}/{stem}.img.txt")
    };
    FlashpackImageJob {
        source_path: source.to_string(),
        output_path,
    }
}

fn sniff_png(bytes: &[u8]) -> Option<ImageInfo> {
    const SIG: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.len() < 24 || bytes.get(..8) != Some(SIG) || bytes.get(12..16) != Some(b"IHDR") {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some(ImageInfo {
        format: "png",
        width,
        height,
    })
}

fn sniff_gif(bytes: &[u8]) -> Option<ImageInfo> {
    if bytes.len() < 10 {
        return None;
    }
    if bytes.get(..6) != Some(b"GIF87a") && bytes.get(..6) != Some(b"GIF89a") {
        return None;
    }
    Some(ImageInfo {
        format: "gif",
        width: u16::from_le_bytes([bytes[6], bytes[7]]) as u32,
        height: u16::from_le_bytes([bytes[8], bytes[9]]) as u32,
    })
}

fn sniff_jpeg(bytes: &[u8]) -> Option<ImageInfo> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut i = 2usize;
    while i < bytes.len() {
        if bytes[i] != 0xFF {
            return None;
        }
        i += 1;
        while i < bytes.len() && bytes[i] == 0xFF {
            i += 1;
        }
        if i >= bytes.len() {
            return None;
        }
        let marker = bytes[i];
        i += 1;
        if marker == 0x00 || marker == 0x01 || marker == 0xD8 || (0xD0..=0xD7).contains(&marker) {
            continue;
        }
        if marker == 0xD9 || i + 2 > bytes.len() {
            return None;
        }
        let len = u16::from_be_bytes([bytes[i], bytes[i + 1]]) as usize;
        if len < 2 || i + len > bytes.len() {
            return None;
        }
        if marker == 0xC0 || marker == 0xC2 {
            if len < 7 {
                return None;
            }
            return Some(ImageInfo {
                format: "jpeg",
                width: u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]) as u32,
                height: u16::from_be_bytes([bytes[i + 3], bytes[i + 4]]) as u32,
            });
        }
        i += len;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes
    }

    fn gif(header: &[u8], width: u16, height: u16) -> Vec<u8> {
        let mut bytes = header.to_vec();
        bytes.extend_from_slice(&width.to_le_bytes());
        bytes.extend_from_slice(&height.to_le_bytes());
        bytes
    }

    fn jpeg(marker: u8, width: u16, height: u16) -> Vec<u8> {
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, marker];
        bytes.extend_from_slice(&8u16.to_be_bytes());
        bytes.push(0x08);
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.push(0x01);
        bytes
    }

    #[test]
    fn sniffs_png_gif_and_jpeg() {
        assert_eq!(
            sniff_image(&png(10, 20)),
            Some(ImageInfo {
                format: "png",
                width: 10,
                height: 20
            })
        );
        assert_eq!(
            sniff_image(&gif(b"GIF89a", 2, 3)),
            Some(ImageInfo {
                format: "gif",
                width: 2,
                height: 3
            })
        );
        assert_eq!(
            sniff_image(&gif(b"GIF87a", 4, 5)),
            Some(ImageInfo {
                format: "gif",
                width: 4,
                height: 5
            })
        );
        assert_eq!(
            sniff_image(&jpeg(0xC0, 32, 16)),
            Some(ImageInfo {
                format: "jpeg",
                width: 32,
                height: 16
            })
        );
        assert_eq!(
            sniff_image(&jpeg(0xC2, 8, 9)),
            Some(ImageInfo {
                format: "jpeg",
                width: 8,
                height: 9
            })
        );
    }

    #[test]
    fn rejects_truncated_and_unknown_images() {
        assert_eq!(sniff_image(b"not an image"), None);
        assert_eq!(sniff_image(&png(1, 1)[..12]), None);
        assert_eq!(sniff_image(b"GIF89a"), None);
        assert_eq!(sniff_image(&[0xFF, 0xD8]), None);
        assert_eq!(
            sniff_image(&[0xFF, 0xD8, 0xFF, 0xC1, 0x00, 0x07, 0x08, 0x00, 0x01, 0x00, 0x01]),
            None
        );
    }

    #[test]
    fn plans_output_from_the_file_name_only() {
        let job = plan_image_job(r"..\..\secret.png", r"out\images/");
        assert_eq!(job.source_path, r"..\..\secret.png");
        assert_eq!(job.output_path, "out/images/secret.img.txt");
        assert!(!job.output_path.contains(".."));
        let nested = plan_image_job("dir/photo.backup.png", "dist");
        assert_eq!(nested.output_path, "dist/photo.backup.img.txt");
    }
}
