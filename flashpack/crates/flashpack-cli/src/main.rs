use anyhow::{Context, Result};
use flashpack::{
    FlashpackFileEntry, FlashpackLatestState, FlashpackProjectGraph, FlashpackRouteEntry,
    FlashpackRuntimeManifest, FlashpackStats,
};
use flashpack_cli::pipeline::{emit_bound_pipeline, project_files, source_directives};
use flashpack_cli_utils::{flag, FlashpackCliContext};
use flash_tasks_fs::read_file;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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
    files: &mut Vec<FlashpackFileEntry>,
    routes: &mut Vec<FlashpackRouteEntry>,
    stats: &mut FlashpackStats,
) -> Result<()> {
    let paths = project_files(root).map_err(anyhow::Error::msg)?;
    for path in paths {
        stats.total_files += 1;
        if !is_source_file(&path) {
            continue;
        }

        let relative_path = normalize_relative_path(root, &path);
        let source_kind = classify_source_kind(&relative_path);
        let source = read_file(&path).unwrap_or_default();
        let (client_component, server_action) = source_directives(&source);

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
    scan_directory(cwd, &mut files, &mut routes, &mut stats)?;
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
    let context = FlashpackCliContext::from_args(&args);
    let cwd = if context.cwd == "." {
        env::current_dir().context("failed to resolve current directory")?
    } else {
        PathBuf::from(context.cwd)
    };
    let phase = normalize_phase(&context.phase);
    let mode = normalize_mode(&flag(&args, "mode").unwrap_or_else(|| "production".to_string()));
    let node_command = flag(&args, "node");
    let runner = flag(&args, "runner");
    let port = flag(&args, "port").and_then(|value| value.parse::<u16>().ok());
    let ssr_runner = flag(&args, "ssr-runner").map(PathBuf::from);
    let action = normalize_action(flag(&args, "action"), runner.is_some());
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
    let bound_path = emit_bound_pipeline(&cwd, phase).map_err(anyhow::Error::msg)?;

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
        format!("[flashpack-cli] pipeline={}", bound_path.display()),
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

    let port = port.unwrap_or(3003);
    log_lines.push("[flashpack-cli] pipeline=rust-swc".to_string());
    log_lines.push(format!("[flashpack-cli] dev-server port={port}"));
    append_log(&log_path, &log_lines)?;

    flashpack::serve(flashpack::ServeOptions {
        cwd,
        port,
        phase: phase.to_string(),
        mode: mode.to_string(),
        graph_path,
        ssr_runner,
    })?;

    Ok(())
}
