use anyhow::{Context, Result};
use serde_json::json;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn parse_arg(args: &[String], key: &str) -> Option<String> {
    let mut i = 0usize;
    while i < args.len() {
        let current = &args[i];
        if current == key {
            let next = args.get(i + 1)?;
            return Some(next.clone());
        }

        if let Some(value) = current.strip_prefix(&(key.to_owned() + "=")) {
            return Some(value.to_string());
        }

        i += 1;
    }

    None
}

fn normalize_mode(input: &str) -> &'static str {
    match input {
        "development" | "dev" => "development",
        _ => "production",
    }
}

fn output_path(cwd: &Path, phase: &str, out: Option<String>) -> PathBuf {
    if let Some(path) = out {
        return PathBuf::from(path);
    }

    cwd.join(".flash")
        .join("graph")
        .join(format!("{phase}-rust.json"))
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();

    let cwd = parse_arg(&args, "--cwd")
        .map(PathBuf::from)
        .unwrap_or(env::current_dir().context("failed to resolve current directory")?);
    let phase = parse_arg(&args, "--phase").unwrap_or_else(|| "build".to_string());
    let mode = normalize_mode(&parse_arg(&args, "--mode").unwrap_or_else(|| "production".to_string()));
    let out = output_path(&cwd, &phase, parse_arg(&args, "--out"));

    let payload = json!({
        "engine": "flashpack",
        "pipeline": "rust-xtask",
        "phase": phase,
        "mode": mode,
        "cwd": cwd.to_string_lossy(),
        "timestampMs": timestamp_ms(),
    });

    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("failed to create {}", parent.display()))?;
    }

    fs::write(&out, serde_json::to_vec_pretty(&payload)?)
        .with_context(|| format!("failed to write {}", out.display()))?;

    println!(
        "[flashpack-xtask] phase={} mode={} output={}",
        phase,
        mode,
        out.display()
    );

    Ok(())
}
