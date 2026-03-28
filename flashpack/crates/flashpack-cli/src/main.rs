use anyhow::{bail, Context, Result};
use flashpack::{
    FlashpackFileEntry, FlashpackLatestState, FlashpackProjectGraph, FlashpackRouteEntry,
    FlashpackRuntimeManifest, FlashpackStats,
};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

fn parse_arg(args: &[String], key: &str) -> Option<String> {
    let mut index = 0usize;
    while index < args.len() {
        let current = &args[index];
        if current == key {
            let next = args.get(index + 1)?;
            return Some(next.clone());
        }

        if let Some(value) = current.strip_prefix(&(key.to_owned() + "=")) {
            return Some(value.to_string());
        }

        index += 1;
    }

    None
}

fn normalize_phase(value: &str) -> &'static str {
    match value {
        "dev" | "development" => "dev",
        "start" => "start",
        _ => "build",
    }
}

fn normalize_mode(value: &str) -> &'static str {
    match value {
        "dev" | "development" => "development",
        _ => "production",
    }
}

fn normalize_action(value: Option<String>, has_runner: bool) -> &'static str {
    match value.as_deref() {
        Some("run") => "run",
        Some("prepare") => "prepare",
        _ if has_runner => "run",
        _ => "prepare",
    }
}

fn timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn ensure_dir(path: &Path) -> Result<()> {
    fs::create_dir_all(path).with_context(|| format!("failed to create {}", path.display()))
}

fn write_json_file<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(value)?)
        .with_context(|| format!("failed to write {}", path.display()))
}

fn append_log(path: &Path, lines: &[String]) -> Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let mut body = String::new();
    for line in lines {
        body.push_str(line);
        body.push('\n');
    }
    fs::write(path, body).with_context(|| format!("failed to write {}", path.display()))
}

fn should_skip_directory(name: &str) -> bool {
    matches!(
        name,
        ".git" | ".vista" | ".flash" | ".next" | ".turbo" | ".vercel" | "node_modules" | "coverage"
    )
}

fn is_source_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("js")
            | Some("jsx")
            | Some("ts")
            | Some("tsx")
            | Some("mjs")
            | Some("cjs")
            | Some("md")
            | Some("mdx")
            | Some("json")
    )
}

fn normalize_relative_path(root: &Path, absolute: &Path) -> String {
    absolute
        .strip_prefix(root)
        .unwrap_or(absolute)
        .to_string_lossy()
        .replace('\\', "/")
}

fn classify_source_kind(relative_path: &str) -> &'static str {
    if relative_path.starts_with("app/") {
        "app"
    } else if relative_path.starts_with("components/") {
        "component"
    } else if relative_path.starts_with("content/") {
        "content"
    } else if relative_path.starts_with("lib/") {
        "lib"
    } else {
        "project"
    }
}

fn parse_route_entry(relative_path: &str) -> Option<FlashpackRouteEntry> {
    if !relative_path.starts_with("app/") {
        return None;
    }

    let normalized = relative_path.replace('\\', "/");
    let file_name = normalized.rsplit('/').next()?;
    let file_stem = file_name.split('.').next()?;
    let kind = match file_stem {
        "page" | "layout" | "loading" | "error" | "not-found" | "default" | "route" => {
            file_stem.to_string()
        }
        _ => return None,
    };

    let segments: Vec<&str> = normalized.split('/').collect();
    if segments.len() < 2 {
        return None;
    }

    let mut route_segments: Vec<String> = Vec::new();
    let mut slot: Option<String> = None;
    let mut interception = false;

    for segment in &segments[1..segments.len() - 1] {
        if segment.starts_with('@') {
            slot = Some(segment.trim_start_matches('@').to_string());
            continue;
        }

        if segment.starts_with('(') && segment.ends_with(')') {
            if segment.contains('.') {
                interception = true;
                let trimmed = segment
                    .trim_start_matches('(')
                    .trim_end_matches(')')
                    .trim_start_matches('.');
                if !trimmed.is_empty() {
                    route_segments.push(trimmed.to_string());
                }
            }
            continue;
        }

        route_segments.push(segment.to_string());
    }

    let route = if route_segments.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", route_segments.join("/"))
    };

    Some(FlashpackRouteEntry {
        file: normalized,
        route,
        kind,
        slot,
        interception,
    })
}

fn scan_directory(
    root: &Path,
    current: &Path,
    files: &mut Vec<FlashpackFileEntry>,
    routes: &mut Vec<FlashpackRouteEntry>,
    stats: &mut FlashpackStats,
) -> Result<()> {
    for entry in fs::read_dir(current).with_context(|| format!("failed to read {}", current.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            if should_skip_directory(entry.file_name().to_string_lossy().as_ref()) {
                continue;
            }
            scan_directory(root, &path, files, routes, stats)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        stats.total_files += 1;
        if !is_source_file(&path) {
            continue;
        }

        let relative_path = normalize_relative_path(root, &path);
        let source_kind = classify_source_kind(&relative_path);
        let source = fs::read_to_string(&path).unwrap_or_default();
        let client_component = source.contains("\"use client\"") || source.contains("'use client'");
        let server_action = source.contains("\"use server\"") || source.contains("'use server'");

        stats.source_files += 1;
        if source_kind == "app" {
            stats.app_files += 1;
        }
        if source_kind == "component" {
            stats.component_files += 1;
        }
        if client_component {
            stats.client_components += 1;
        }
        if server_action {
            stats.server_actions += 1;
        }

        if let Some(route_entry) = parse_route_entry(&relative_path) {
            stats.route_modules += 1;
            if route_entry.slot.is_some() {
                stats.parallel_slots += 1;
            }
            if route_entry.interception {
                stats.interception_routes += 1;
            }
            routes.push(route_entry);
        }

        files.push(FlashpackFileEntry {
            relative_path,
            source_kind: source_kind.to_string(),
            bytes: fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0),
            client_component,
            server_action,
        });
    }

    Ok(())
}

fn build_project_graph(cwd: &Path, phase: &str, mode: &str) -> Result<FlashpackProjectGraph> {
    let mut files = Vec::new();
    let mut routes = Vec::new();
    let mut stats = FlashpackStats::default();
    scan_directory(cwd, cwd, &mut files, &mut routes, &mut stats)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    routes.sort_by(|left, right| left.file.cmp(&right.file));

    Ok(FlashpackProjectGraph {
        schema_version: 1,
        engine: "flashpack".to_string(),
        pipeline_owner: "rust-cli".to_string(),
        phase: phase.to_string(),
        mode: mode.to_string(),
        generated_at_ms: timestamp_ms(),
        project_root: cwd.to_string_lossy().to_string(),
        stats,
        files,
        routes,
    })
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();
    let cwd = parse_arg(&args, "--cwd")
        .map(PathBuf::from)
        .unwrap_or(env::current_dir().context("failed to resolve current directory")?);
    let phase = normalize_phase(&parse_arg(&args, "--phase").unwrap_or_else(|| "build".to_string()));
    let mode = normalize_mode(&parse_arg(&args, "--mode").unwrap_or_else(|| "production".to_string()));
    let node_command = parse_arg(&args, "--node");
    let runner = parse_arg(&args, "--runner");
    let port = parse_arg(&args, "--port").and_then(|value| value.parse::<u16>().ok());
    let action = normalize_action(parse_arg(&args, "--action"), runner.is_some());
    let flash_dir = cwd.join(".flash");
    let graph_path = flash_dir.join("graph").join(format!("{phase}-rust.json"));
    let runtime_manifest_path = flash_dir.join("runtime").join(format!("{phase}-manifest.json"));
    let latest_state_path = flash_dir.join("state").join("latest.json");
    let log_path = flash_dir.join("logs").join(format!("{phase}-rust-cli.log"));

    ensure_dir(&flash_dir.join("graph"))?;
    ensure_dir(&flash_dir.join("runtime"))?;
    ensure_dir(&flash_dir.join("state"))?;
    ensure_dir(&flash_dir.join("logs"))?;

    let graph = build_project_graph(&cwd, phase, mode)?;
    write_json_file(&graph_path, &graph)?;

    let runtime_manifest = FlashpackRuntimeManifest {
        schema_version: 1,
        engine: "flashpack".to_string(),
        pipeline_owner: "rust-cli".to_string(),
        command: action.to_string(),
        phase: phase.to_string(),
        mode: mode.to_string(),
        generated_at_ms: timestamp_ms(),
        project_root: cwd.to_string_lossy().to_string(),
        graph_relative_path: graph_path
            .strip_prefix(&cwd)
            .unwrap_or(&graph_path)
            .to_string_lossy()
            .replace('\\', "/"),
        runner: runner.clone(),
        node_command: node_command.clone(),
        port,
    };
    write_json_file(&runtime_manifest_path, &runtime_manifest)?;

    let latest_state = FlashpackLatestState {
        schema_version: 1,
        engine: "flashpack".to_string(),
        pipeline_owner: "rust-cli".to_string(),
        command: action.to_string(),
        phase: phase.to_string(),
        mode: mode.to_string(),
        generated_at_ms: timestamp_ms(),
        project_root: cwd.to_string_lossy().to_string(),
        graph_path: graph_path.to_string_lossy().to_string(),
        runtime_manifest_path: runtime_manifest_path.to_string_lossy().to_string(),
        runner: runner.clone(),
    };
    write_json_file(&latest_state_path, &latest_state)?;

    let mut log_lines = vec![
        format!("[flashpack-cli] action={action}"),
        format!("[flashpack-cli] phase={phase}"),
        format!("[flashpack-cli] mode={mode}"),
        format!("[flashpack-cli] cwd={}", cwd.display()),
        format!("[flashpack-cli] graph={}", graph_path.display()),
        format!("[flashpack-cli] runtime_manifest={}", runtime_manifest_path.display()),
    ];

    if action == "prepare" {
        log_lines.push("[flashpack-cli] prepared Flashpack metadata only".to_string());
        append_log(&log_path, &log_lines)?;
        println!(
            "[flashpack-cli] prepared phase={} mode={} graph={}",
            phase,
            mode,
            graph_path.display()
        );
        return Ok(());
    }

    let node_command = node_command.context("missing --node for flashpack run action")?;
    let runner = runner.context("missing --runner for flashpack run action")?;
    if !Path::new(&runner).exists() {
        bail!("flashpack runner not found: {}", runner);
    }

    let mut child = Command::new(&node_command);
    child
        .arg(&runner)
        .arg("--phase")
        .arg(phase)
        .current_dir(&cwd)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .env("VISTA_ENGINE", "flashpack")
        .env("VISTA_ENGINE_VARIANT", "flashpack")
        .env("VISTA_FLASHPACK", "true")
        .env("VISTA_FLASHPACK_PIPELINE", "rust-cli")
        .env("VISTA_FLASHPACK_GRAPH_PATH", &graph_path)
        .env("VISTA_FLASHPACK_RUNTIME_MANIFEST", &runtime_manifest_path);

    if let Some(port_value) = port {
        child
            .arg("--port")
            .arg(port_value.to_string())
            .env("PORT", port_value.to_string());
    }

    log_lines.push(format!("[flashpack-cli] node={node_command}"));
    log_lines.push(format!("[flashpack-cli] runner={runner}"));
    append_log(&log_path, &log_lines)?;

    let status = child
        .status()
        .with_context(|| format!("failed to launch flashpack runner {}", runner))?;

    let exit_line = format!(
        "[flashpack-cli] child_exit={}",
        status
            .code()
            .map(|value| value.to_string())
            .unwrap_or_else(|| "signal".to_string())
    );
    let mut final_log_lines = log_lines.clone();
    final_log_lines.push(exit_line.clone());
    append_log(&log_path, &final_log_lines)?;

    if !status.success() {
        bail!("flashpack runner failed with {}", exit_line);
    }

    Ok(())
}
