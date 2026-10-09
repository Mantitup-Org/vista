use crate::browser::{self, app_document, cjs_facade, entry_module};
use crate::compile::{CompileReport, Compiler};
use crate::packages::{self, decode_abs, display_path, path_is_inside, raw_url, resolve_request, rewrite_esm, workspace_root, ModuleKind};
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub struct ServeOptions {
    pub cwd: PathBuf,
    pub port: u16,
    pub phase: String,
    pub mode: String,
    pub graph_path: PathBuf,
    pub ssr_runner: Option<PathBuf>,
}

struct Shared {
    cwd: PathBuf,
    out_dir: PathBuf,
    errors: Mutex<Vec<String>>,
    generation: AtomicU64,
    last_report: Mutex<CompileReport>,
    ssr_runner: Option<PathBuf>,
    ssr_cache: Mutex<HashMap<String, (u64, String)>>,
    ssr_gate: Mutex<()>,
    vendor_lock: Mutex<()>,
}

pub fn serve(options: ServeOptions) -> Result<()> {
    let started = Instant::now();
    let mut compiler = Compiler::new(options.cwd.clone());
    let report = compiler.compile_dirty();
    if let Err(error) = compile_css(&options.cwd) {
        eprintln!("[flashpack] css: {error:#}");
    }
    let elapsed = started.elapsed();

    let _ = write_ssr_assets(&options.cwd);
    let shared = Arc::new(Shared {
        cwd: options.cwd.clone(),
        out_dir: options.cwd.join(".flash").join("dev").join("modules"),
        errors: Mutex::new(report.errors.clone()),
        generation: AtomicU64::new(cache_epoch()),
        last_report: Mutex::new(report),
        ssr_runner: options.ssr_runner.clone(),
        ssr_cache: Mutex::new(HashMap::new()),
        ssr_gate: Mutex::new(()),
        vendor_lock: Mutex::new(()),
    });

    {
        let shared = Arc::clone(&shared);
        thread::spawn(move || watch_loop(compiler, shared));
    }

    let listener = TcpListener::bind(("127.0.0.1", options.port))
        .with_context(|| format!("flashpack failed to bind 127.0.0.1:{}", options.port))?;

    print_ready(&options, elapsed, &shared);

    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let shared = Arc::clone(&shared);
        thread::spawn(move || {
            let _ = handle_client(stream, &shared);
        });
    }

    Ok(())
}

fn cache_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(1)
}

fn watch_loop(mut compiler: Compiler, shared: Arc<Shared>) {
    loop {
        thread::sleep(Duration::from_millis(200));
        let started = Instant::now();
        let report = compiler.compile_dirty();
        if report.compiled == 0 && report.errors.is_empty() {
            continue;
        }
        if report.compiled > 0 {
            if let Err(error) = compile_css(&shared.cwd) {
                eprintln!(" \x1b[31m✗\x1b[39m css: {error:#}");
            }
            let ms = started.elapsed().as_millis();
            println!(" \x1b[32m✓\x1b[39m Compiled \x1b[2min {ms}ms\x1b[22m");
        }
        for error in &report.errors {
            eprintln!(" \x1b[31m✗\x1b[39m {error}");
        }
        if let Ok(mut slot) = shared.errors.lock() {
            *slot = report.errors.clone();
        }
        if let Ok(mut slot) = shared.last_report.lock() {
            *slot = report;
        }
        shared.generation.fetch_add(1, Ordering::Relaxed);
    }
}

fn paint(code: &str, text: &str) -> String {
    format!("\x1b[{code}m{text}\x1b[39m")
}

fn bold(text: &str) -> String {
    format!("\x1b[1m{text}\x1b[22m")
}

fn dim(text: &str) -> String {
    format!("\x1b[2m{text}\x1b[22m")
}

fn format_duration(elapsed: Duration) -> String {
    let ms = elapsed.as_secs_f64() * 1000.0;
    if ms < 1.0 {
        format!("{}µs", (ms * 1000.0).round())
    } else if ms < 1000.0 {
        format!("{}ms", ms.round())
    } else {
        format!("{:.2}s", ms / 1000.0)
    }
}

fn print_ready(options: &ServeOptions, elapsed: Duration, shared: &Shared) {
    let version = std::env::var("VISTA_VERSION").unwrap_or_else(|_| "0.3.7".to_string());
    let network = std::env::var("VISTA_NETWORK_HOST").ok().filter(|value| !value.is_empty());
    let local = format!("http://localhost:{}", options.port);
    let cyan_bold = |text: &str| bold(&paint("36", text));
    let banner = [
        "██╗   ██╗██╗███████╗████████╗ █████╗         ██╗███████╗",
        "██║   ██║██║██╔════╝╚══██╔══╝██╔══██╗        ██║██╔════╝",
        "██║   ██║██║███████╗   ██║   ███████║        ██║███████╗",
        "╚██╗ ██╔╝██║╚════██║   ██║   ██╔══██║   ██  ██║╚════██║",
        " ╚████╔╝ ██║███████║   ██║   ██║  ██║██ ╚█████╔╝███████║",
        "  ╚═══╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝ ╚════╝ ╚══════╝",
    ];

    println!();
    for line in banner {
        println!(" {}", cyan_bold(line));
    }
    println!();
    println!(
        "  {} {} {} {}",
        paint("32", "▼"),
        bold("Vista.Js"),
        dim(&format!("v{version}")),
        paint("36", "(flashpack)")
    );
    println!();
    println!("  {} {}        {}", dim("┃"), bold("Local:"), paint("36", &local));
    if let Some(host) = network {
        let url = format!("http://{host}:{}", options.port);
        println!("  {} {}      {}", dim("┃"), bold("Network:"), paint("36", &url));
    }
    println!();
    println!("  {}", dim(&format!("Ready in {}", format_duration(elapsed))));
    println!();

    if let Some(report) = shared.last_report.lock().ok() {
        for error in &report.errors {
            eprintln!(" \x1b[31m✗\x1b[39m {error}");
        }
    }
}

fn log_client_error(body: &str) {
    #[derive(serde::Deserialize)]
    struct ClientErrorReport {
        title: Option<String>,
        message: Option<String>,
    }

    let trimmed = body.trim();
    let parsed = serde_json::from_str::<ClientErrorReport>(trimmed).ok();
    let title = parsed
        .as_ref()
        .and_then(|item| item.title.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Runtime Error".to_string());
    let mut message = parsed
        .as_ref()
        .and_then(|item| item.message.clone())
        .unwrap_or_else(|| trimmed.to_string());

    // Client payload is often `title + "\n\n" + detail` — don't reprint the title twice.
    let title_prefix = format!("{title}\n\n");
    if let Some(rest) = message.strip_prefix(&title_prefix) {
        message = rest.to_string();
    } else if message.trim() == title.trim() {
        message.clear();
    }

    eprintln!(" \x1b[31m✗\x1b[39m {title}");
    let mut printed = 0usize;
    for line in message.lines().take(40) {
        if !line.trim().is_empty() {
            eprintln!("   {line}");
            printed += 1;
        }
    }
    if printed == 0 {
        if trimmed.is_empty() {
            eprintln!("   (empty client-error body — request may have been truncated)");
        } else {
            eprintln!("   (no error details in payload)");
        }
    }
}

/// Read one HTTP request, including a Content-Length body that may arrive after headers.
fn read_http_request(stream: &mut TcpStream) -> Result<(String, Vec<u8>)> {
    let mut buf = Vec::with_capacity(8192);
    let mut chunk = [0u8; 4096];
    let header_end = loop {
        let read = stream.read(&mut chunk).unwrap_or(0);
        if read == 0 {
            break None;
        }
        buf.extend_from_slice(&chunk[..read]);
        if let Some(pos) = buf.windows(4).position(|window| window == b"\r\n\r\n") {
            break Some(pos);
        }
        if buf.len() > 256 * 1024 {
            anyhow::bail!("HTTP request headers too large");
        }
    };
    let Some(header_end) = header_end else {
        return Ok((String::new(), Vec::new()));
    };
    let headers = String::from_utf8_lossy(&buf[..header_end]).into_owned();
    let body_start = header_end + 4;
    let content_length = header_value(&headers, "content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0)
        .min(512 * 1024);
    while buf.len() < body_start + content_length {
        let read = stream.read(&mut chunk).unwrap_or(0);
        if read == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..read]);
    }
    let end = (body_start + content_length).min(buf.len());
    let body = if body_start <= end {
        buf[body_start..end].to_vec()
    } else {
        Vec::new()
    };
    Ok((headers, body))
}

fn handle_client(mut stream: TcpStream, shared: &Shared) -> Result<()> {
    let started = Instant::now();
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let (text, body_bytes) = read_http_request(&mut stream)?;
    if text.is_empty() {
        return Ok(());
    }
    let request = text.lines().next().unwrap_or("");
    let if_none_match = header_value(&text, "if-none-match");
    let mut parts = request.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let target = parts.next().unwrap_or("/");
    let path_owned = percent_decode_path(target.split('?').next().unwrap_or("/"));
    let path = path_owned.as_str();
    let asset = AssetRequest {
        generation: shared.generation.load(Ordering::Relaxed),
        version: query_param(target, "v").and_then(|value| value.parse().ok()),
        if_none_match: if_none_match.as_deref(),
        head: method == "HEAD",
    };

    if path == "/_flashpack/client-error" && method == "POST" {
        let body = String::from_utf8_lossy(&body_bytes);
        log_client_error(&body);
        return write_response(&mut stream, 204, "text/plain", b"", false);
    }

    if path == "/_flashpack/agent-playground" && method == "POST" {
        return run_agent_playground(&mut stream, shared, &body_bytes);
    }

    if method != "GET" && method != "HEAD" {
        return write_response(&mut stream, 405, "text/plain", b"method not allowed", false);
    }

    if path == "/_flashpack/status" {
        let body = status_json(shared);
        return write_response(&mut stream, 200, "application/json", body.as_bytes(), method == "HEAD");
    }
    if path == "/_flashpack/routes" {
        let body = routes_json(&shared.cwd, asset.generation);
        return write_response(&mut stream, 200, "application/json", body.as_bytes(), method == "HEAD");
    }
    if path == "/_flashpack/empty.js" {
        return write_asset(&mut stream, "application/javascript; charset=utf-8", b"export default {};\n", &asset);
    }
    if path == "/_flashpack/cjs-loader.js" {
        return write_asset(&mut stream, "application/javascript; charset=utf-8", browser::CJS_LOADER.as_bytes(), &asset);
    }
    if path == "/_flashpack/entry.js" {
        return write_asset(&mut stream, "application/javascript; charset=utf-8", entry_module().as_bytes(), &asset);
    }
    if path == "/_flashpack/boot.js" {
        let page = query_param(target, "p").unwrap_or_else(|| "/".to_string());
        let bytes = boot_bundle(shared, &page, asset.generation)?;
        return write_asset(&mut stream, "application/javascript; charset=utf-8", &bytes, &asset);
    }
    if path == "/_flashpack/dev.js" || path == "/_flashpack/error-overlay.js" {
        let file = shared.cwd.join(".flash").join("dev").join("vista-dev.js");
        let bytes = fs::read(&file).unwrap_or_default();
        return write_asset(&mut stream, "application/javascript; charset=utf-8", &bytes, &asset);
    }
    if path == "/_flashpack/app.css" {
        let css_path = shared.cwd.join(".flash").join("dev").join("app.css");
        let bytes = fs::read(&css_path).unwrap_or_default();
        return write_asset(&mut stream, "text/css; charset=utf-8", &bytes, &asset);
    }
    if let Some(rest) = path.strip_prefix("/_flashpack/shims/") {
        let source = match rest {
            "fs.js" => browser::FS_SHIM,
            "font-google.js" => browser::FONT_SHIM,
            "metadata.js" => browser::METADATA_SHIM,
            "theme.js" => browser::THEME_SHIM,
            "link.js" => browser::LINK_SHIM,
            "image.js" => browser::IMAGE_SHIM,
            "navigation.js" => browser::NAVIGATION_SHIM,
            _ => return write_response(&mut stream, 404, "text/plain", b"missing shim", asset.head),
        };
        return write_asset(&mut stream, "application/javascript; charset=utf-8", source.as_bytes(), &asset);
    }
    if path == "/_flashpack/resolve" {
        let spec = query_param(target, "spec").unwrap_or_default();
        let from = query_param(target, "from").map(|value| shared_path(&value));
        let resolved = resolve_request(&shared.cwd, from.as_deref(), &spec)
            .map(|item| display_path(&item.path))
            .unwrap_or_else(|error| error);
        let status = if resolved.starts_with("package") || resolved.starts_with("file") || resolved.starts_with("relative") || resolved.starts_with("refusing") || resolved.starts_with("missing") {
            404
        } else {
            200
        };
        return write_response(&mut stream, status, "text/plain; charset=utf-8", resolved.as_bytes(), method == "HEAD");
    }
    if let Some(encoded) = path.strip_prefix("/_flashpack/raw/") {
        return serve_package_file(&mut stream, shared, &decode_abs(encoded), false, &asset);
    }
    if let Some(encoded) = path.strip_prefix("/_flashpack/file/") {
        return serve_package_file(&mut stream, shared, &decode_abs(encoded), true, &asset);
    }
    if let Some(spec) = path.strip_prefix("/_flashpack/mod/") {
        return serve_package_spec(&mut stream, shared, spec, &asset);
    }
    if path == "/_flashpack/source" {
        return serve_source(&mut stream, shared, &query_param(target, "p").unwrap_or_default(), method == "HEAD");
    }
    if let Some(rest) = path.strip_prefix("/_flashpack/modules/") {
        let file = shared.out_dir.join(sanitize_module_path(rest));
        if file.is_file() {
            let bytes = fs::read(&file)?;
            return write_asset(&mut stream, "application/javascript; charset=utf-8", &bytes, &asset);
        }
        let source = shared.cwd.join(sanitize_module_path(rest));
        if source.is_file() && path_is_inside(&source, &shared.cwd) {
            let bytes = fs::read(&source)?;
            return write_asset(&mut stream, content_type(&source), &bytes, &asset);
        }
        let missing = format!("flashpack module not found: {rest}");
        return write_response(&mut stream, 404, "text/plain; charset=utf-8", missing.as_bytes(), asset.head);
    }

    if let Some(file) = public_file(&shared.cwd, path) {
        let bytes = fs::read(&file)?;
        let kind = content_type(&file);
        let tag = file_etag(&file, bytes.len() as u64);
        return write_with_cache(
            &mut stream,
            200,
            kind,
            &bytes,
            asset.head,
            "public, max-age=3600",
            Some(&tag),
            asset.if_none_match,
        );
    }

    let (status, html) = index_html(shared, path);
    log_page(method, path, status, started.elapsed());
    write_response(&mut stream, status, "text/html; charset=utf-8", html.as_bytes(), method == "HEAD")
}

fn header_value(request: &str, name: &str) -> Option<String> {
    for line in request.lines().skip(1) {
        if line.is_empty() {
            break;
        }
        let (key, value) = line.split_once(':')?;
        if key.eq_ignore_ascii_case(name) {
            return Some(value.trim().to_string());
        }
    }
    None
}

struct AssetRequest<'a> {
    generation: u64,
    version: Option<u64>,
    if_none_match: Option<&'a str>,
    head: bool,
}

fn run_agent_playground(stream: &mut TcpStream, shared: &Shared, body: &[u8]) -> Result<()> {
    let result = (|| -> Result<Vec<u8>, String> {
        let runner = shared
            .ssr_runner
            .as_ref()
            .ok_or_else(|| "flashpack ssr runner is required for the agent playground".to_string())?;
        let mut script = runner
            .parent()
            .ok_or_else(|| "flashpack ssr runner has no parent".to_string())?
            .join("flashpack-agent-playground.mjs");
        if !script.is_file() {
            // Stale pnpm store copies of vista/bin may lack newly added scripts.
            let fallback = shared
                .cwd
                .join("..")
                .join("..")
                .join("packages")
                .join("vista")
                .join("bin")
                .join("flashpack-agent-playground.mjs");
            if fallback.is_file() {
                script = fallback;
            } else {
                return Err(format!("missing {}", script.display()));
            }
        }

        let mut child = Command::new(std::env::var("VISTA_NODE").unwrap_or_else(|_| "node".to_string()))
            .arg(&script)
            .arg("--cwd")
            .arg(&shared.cwd)
            .current_dir(&shared.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("failed to spawn agent playground: {error}"))?;

        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            stdin
                .write_all(body)
                .map_err(|error| format!("failed to write agent playground stdin: {error}"))?;
            // Explicitly close stdin so Node sees EOF.
            drop(stdin);
        }

        let output = child
            .wait_with_output()
            .map_err(|error| format!("agent playground process failed: {error}"))?;
        if !output.stderr.is_empty() {
            let err = String::from_utf8_lossy(&output.stderr);
            for line in err.lines().take(12) {
                if !line.trim().is_empty() {
                    eprintln!("   {line}");
                }
            }
        }
        if output.stdout.is_empty() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(if err.trim().is_empty() {
                "agent playground returned empty output".to_string()
            } else {
                err.trim().to_string()
            });
        }
        Ok(output.stdout)
    })();

    match result {
        Ok(stdout) => write_response(
            stream,
            200,
            "text/event-stream; charset=utf-8",
            &stdout,
            false,
        ),
        Err(message) => {
            eprintln!(" \x1b[31m✗\x1b[39m agent playground: {message}");
            let payload = format!(
                "meta: {}\ndata: {}\n\n",
                serde_json::json!({ "mode": "demo", "model": "error", "name": "support" }),
                serde_json::json!({ "type": "error", "error": message })
            );
            write_response(
                stream,
                200,
                "text/event-stream; charset=utf-8",
                payload.as_bytes(),
                false,
            )
        }
    }
}

fn log_page(method: &str, path: &str, status: u16, elapsed: Duration) {
    if path.starts_with("/_flashpack") || path == "/favicon.ico" {
        return;
    }
    let ms = (elapsed.as_secs_f64() * 1000.0).round();
    let method_label = format!("{method:<7}");
    println!(" \x1b[32m{method_label}\x1b[39m {path} \x1b[32m{status}\x1b[39m \x1b[2m{ms:.0}ms\x1b[22m");
}

fn status_json(shared: &Shared) -> String {
    let report = shared.last_report.lock().ok();
    let errors = shared.errors.lock().ok();
    let compiled = report.as_ref().map(|item| item.compiled).unwrap_or(0);
    let cached = report.as_ref().map(|item| item.cached).unwrap_or(0);
    let error_count = errors.as_ref().map(|item| item.len()).unwrap_or(0);
    format!(
        "{{\"engine\":\"flashpack\",\"pipeline\":\"rust-swc\",\"generation\":{},\"compiled\":{compiled},\"cached\":{cached},\"errors\":{error_count}}}",
        shared.generation.load(Ordering::Relaxed)
    )
}

fn index_html(shared: &Shared, request_path: &str) -> (u16, String) {
    let mut errors = shared
        .errors
        .lock()
        .ok()
        .map(|items| items.join("\n"))
        .unwrap_or_default();
    let mut status = 200;
    let markup = match render_ssr(shared, request_path) {
        Ok(html) => {
            if !errors.is_empty() {
                status = 500;
            }
            html
        }
        Err(ssr_error) => {
            status = 500;
            if !errors.is_empty() {
                errors.push('\n');
            }
            errors.push_str("Server Error\n\n");
            errors.push_str(&ssr_error);
            String::new()
        }
    };
    let generation = shared.generation.load(Ordering::Relaxed);
    (status, app_document(&errors, &markup, generation, request_path))
}

fn write_ssr_assets(cwd: &Path) -> Result<()> {
    let dir = cwd.join(".flash").join("dev").join("ssr");
    fs::create_dir_all(&dir)?;
    fs::write(dir.join("empty.js"), "export default {};\n")?;
    fs::write(dir.join("fs.js"), browser::FS_SHIM)?;
    fs::write(dir.join("font-google.js"), browser::FONT_SHIM)?;
    fs::write(dir.join("metadata.js"), browser::METADATA_SHIM)?;
    fs::write(dir.join("theme.js"), browser::THEME_SHIM)?;
    fs::write(dir.join("link.js"), browser::LINK_SHIM)?;
    fs::write(dir.join("image.js"), browser::IMAGE_SHIM)?;
    fs::write(dir.join("navigation.js"), browser::NAVIGATION_SHIM)?;
    Ok(())
}

fn render_ssr(shared: &Shared, request_path: &str) -> Result<String, String> {
    let runner = shared
        .ssr_runner
        .clone()
        .ok_or_else(|| "flashpack ssr runner is not configured".to_string())?;
    let _gate = shared
        .ssr_gate
        .lock()
        .map_err(|_| "flashpack ssr gate is poisoned".to_string())?;
    let generation = shared.generation.load(Ordering::Relaxed);
    if let Ok(cache) = shared.ssr_cache.lock() {
        if let Some((cached_generation, html)) = cache.get(request_path) {
            if *cached_generation == generation {
                if html.is_empty() {
                    return Err(format!(
                        "SSR failed for {request_path} (cached). Fix the runtime error and reload."
                    ));
                }
                return Ok(html.clone());
            }
        }
    }

    let node = std::env::var("VISTA_NODE").unwrap_or_else(|_| "node".to_string());
    let output = Command::new(node)
        .arg(&runner)
        .arg("--cwd")
        .arg(&shared.cwd)
        .arg("--path")
        .arg(request_path)
        .output()
        .map_err(|error| format!("failed to spawn ssr runner: {error}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut message = err.trim().to_string();
        if message.is_empty() {
            message = stdout.trim().to_string();
        }
        if message.is_empty() {
            message = format!("SSR failed for {request_path} (no stderr/stdout from runner)");
        }
        eprintln!(" \x1b[31m✗\x1b[39m ssr failed for {request_path}");
        let mut printed = 0usize;
        for line in message.lines().take(40) {
            if !line.trim().is_empty() {
                eprintln!("   {line}");
                printed += 1;
            }
        }
        if printed == 0 {
            eprintln!("   (runner exited {} with empty output)", output.status);
        }
        if let Ok(mut cache) = shared.ssr_cache.lock() {
            cache.insert(request_path.to_string(), (generation, String::new()));
        }
        return Err(message);
    }
    let html = String::from_utf8(output.stdout).map_err(|error| error.to_string())?;
    let trimmed = html.trim().to_string();
    if trimmed.is_empty() {
        return Err(format!("SSR produced empty markup for {request_path}"));
    }
    if let Ok(mut cache) = shared.ssr_cache.lock() {
        cache.insert(request_path.to_string(), (generation, trimmed.clone()));
    }
    Ok(trimmed)
}

fn public_file(cwd: &Path, request_path: &str) -> Option<PathBuf> {
    let asset = flashpack_static::resolve_public(&cwd.join("public"), request_path)?;
    Some(PathBuf::from(asset.emitted_path))
}

fn routes_json(cwd: &Path, generation: u64) -> String {
    let modules = cwd.join(".flash").join("dev").join("modules");
    let mut pages = Vec::new();
    let mut layouts = Vec::new();
    let mut root = None;
    let mut root_layout = None;
    for app_rel in ["app", "src/app"] {
        let dir = modules.join(app_rel);
        if !dir.is_dir() {
            continue;
        }
        if root.is_none() {
            if let Some(found) = find_compiled(&dir, "root.") {
                root = Some(module_url(app_rel, &found, generation));
            }
        }
        if root_layout.is_none() {
            if let Some(found) = find_compiled(&dir, "layout.") {
                root_layout = Some(module_url(app_rel, &found, generation));
            }
        }
        collect_route_files(&dir, &dir, app_rel, generation, &mut pages, &mut layouts);
    }
    // App Router apps usually only ship app/layout — treat that as the document root
    // and drop it from nested layouts so it is not applied twice.
    let root = root.or(root_layout);
    if let Some(ref root_url) = root {
        layouts.retain(|item| item.get("module").and_then(|v| v.as_str()) != Some(root_url.as_str()));
    }
    serde_json::json!({
        "root": root.unwrap_or_else(|| format!("/_flashpack/modules/app/root.tsx.js?v={generation}")),
        "pages": pages,
        "layouts": layouts,
    })
    .to_string()
}

fn find_compiled(dir: &Path, prefix: &str) -> Option<String> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if entry.path().is_file() && name.starts_with(prefix) && name.ends_with(".js") {
            return Some(name.into_owned());
        }
    }
    None
}

fn module_url(app_rel: &str, relative: &str, generation: u64) -> String {
    format!(
        "/_flashpack/modules/{}/{}?v={generation}",
        app_rel.replace('\\', "/"),
        relative.replace('\\', "/")
    )
}

fn collect_route_files(
    app_dir: &Path,
    dir: &Path,
    app_rel: &str,
    generation: u64,
    pages: &mut Vec<serde_json::Value>,
    layouts: &mut Vec<serde_json::Value>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_route_files(app_dir, &path, app_rel, generation, pages, layouts);
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.ends_with(".js") {
            continue;
        }
        let kind = if name.starts_with("page.") || name.starts_with("index.") {
            "page"
        } else if name.starts_with("layout.") {
            "layout"
        } else {
            continue
        };
        let relative = path.strip_prefix(app_dir).unwrap_or(path.as_path());
        let relative = relative.to_string_lossy().replace('\\', "/");
        let segments: Vec<&str> = relative
            .split('/')
            .filter(|segment| !segment.is_empty())
            .collect();
        let segments = if segments.len() > 1 {
            segments[..segments.len() - 1].to_vec()
        } else {
            Vec::new()
        };
        let item = serde_json::json!({
            "module": module_url(app_rel, &relative, generation),
            "segments": segments,
        });
        if kind == "page" {
            pages.push(item);
        } else {
            layouts.push(item);
        }
    }
}

fn sanitize_module_path(request_path: &str) -> PathBuf {
    let mut out = PathBuf::new();
    for part in request_path.split(['/', '\\']) {
        if part.is_empty() || part == "." || part == ".." {
            continue;
        }
        out.push(part);
    }
    out
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("js") | Some("mjs") | Some("cjs") => "application/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("html") => "text/html; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("md") | Some("txt") => "text/plain; charset=utf-8",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn boot_bundle(shared: &Shared, page: &str, generation: u64) -> Result<Vec<u8>> {
    let runner = shared
        .ssr_runner
        .as_ref()
        .context("flashpack ssr runner is required to build the boot script")?;
    let script = runner
        .parent()
        .context("flashpack ssr runner has no parent")?
        .join("flashpack-boot.mjs");
    let safe: String = page
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect();
    let outfile = shared
        .cwd
        .join(".flash")
        .join("dev")
        .join("boot")
        .join(generation.to_string())
        .join(format!("{safe}.js"));
    let _lock = shared.vendor_lock.lock().ok();
    if outfile.is_file() {
        return Ok(fs::read(&outfile)?);
    }
    if let Some(parent) = outfile.parent() {
        fs::create_dir_all(parent)?;
    }
    let output = Command::new("node")
        .arg(&script)
        .arg(&shared.cwd)
        .arg(page)
        .arg(&outfile)
        .arg(generation.to_string())
        .current_dir(&shared.cwd)
        .output()
        .context("node is required to build the flashpack boot script")?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let out = String::from_utf8_lossy(&output.stdout);
        let _ = fs::remove_file(&outfile);
        anyhow::bail!("boot bundle failed for {page}\n{err}{out}");
    }
    Ok(fs::read(&outfile)?)
}

fn vendor_bundle(shared: &Shared, spec: &str) -> Option<Vec<u8>> {
    let runner = shared.ssr_runner.as_ref()?;
    let script = runner.parent()?.join("flashpack-vendor.mjs");
    if !script.is_file() || spec.is_empty() || spec.contains("..") {
        return None;
    }
    let safe: String = spec
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let outfile = shared.cwd.join(".flash").join("dev").join("vendor").join(format!("{safe}.js"));
    let _lock = shared.vendor_lock.lock().ok()?;
    if outfile.is_file() {
        return fs::read(&outfile).ok();
    }
    if let Some(parent) = outfile.parent() {
        fs::create_dir_all(parent).ok()?;
    }
    let output = Command::new("node")
        .arg(&script)
        .arg(&shared.cwd)
        .arg(spec)
        .arg(&outfile)
        .current_dir(&shared.cwd)
        .output()
        .ok()?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        eprintln!(" \x1b[31m✗\x1b[39m vendor bundle failed for {spec}");
        for line in err.lines().take(8) {
            if !line.trim().is_empty() {
                eprintln!("   {line}");
            }
        }
        let _ = fs::remove_file(&outfile);
        return None;
    }
    fs::read(&outfile).ok()
}

fn file_etag(path: &Path, len: u64) -> String {
    let secs = fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    format!("\"{len:x}-{secs:x}\"")
}

fn is_import_specifier(before: &str) -> bool {
    let trimmed = before.trim_end();
    trimmed.ends_with("from") || trimmed.ends_with("import(") || trimmed.ends_with("import")
}

fn version_module_specifiers(source: &str, generation: u64) -> String {
    let mut out = String::with_capacity(source.len() + 32);
    let mut rest = source;
    let needles = ["\"/_flashpack/", "'/_flashpack/"];
    while let Some((index, needle)) = needles
        .iter()
        .filter_map(|needle| rest.find(needle).map(|index| (index, *needle)))
        .min_by_key(|(index, _)| *index)
    {
        let quote = needle.as_bytes()[0] as char;
        let before = &rest[..index];
        out.push_str(before);
        out.push_str(needle);
        rest = &rest[index + needle.len()..];
        let Some(end) = rest.find(quote) else {
            break;
        };
        let spec = &rest[..end];
        out.push_str(spec);
        if is_import_specifier(before) && !spec.contains("?v=") {
            out.push_str(&format!("?v={generation}"));
        }
        out.push(quote);
        rest = &rest[end + 1..];
    }
    out.push_str(rest);
    out
}

fn write_asset(stream: &mut TcpStream, content_type: &str, body: &[u8], asset: &AssetRequest<'_>) -> Result<()> {
    let cacheable = asset.version == Some(asset.generation);
    let cache_control = if cacheable {
        "public, max-age=31536000, immutable"
    } else {
        "no-store"
    };
    if content_type.contains("javascript") {
        if let Ok(source) = std::str::from_utf8(body) {
            let versioned = version_module_specifiers(source, asset.generation);
            return write_with_cache(
                stream,
                200,
                content_type,
                versioned.as_bytes(),
                asset.head,
                cache_control,
                None,
                None,
            );
        }
    }
    write_with_cache(stream, 200, content_type, body, asset.head, cache_control, None, None)
}

fn query_param(target: &str, key: &str) -> Option<String> {
    let query = target.split_once('?')?.1;
    for pair in query.split('&') {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        if name == key {
            return Some(percent_decode(value));
        }
    }
    None
}

fn percent_decode_path(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                if byte != b'/' && byte != b'\\' {
                    out.push(byte);
                    index += 3;
                    continue;
                }
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or(""), 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        if bytes[index] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[index]);
        }
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn shared_path(value: &str) -> PathBuf {
    PathBuf::from(value)
}

fn serve_package_spec(stream: &mut TcpStream, shared: &Shared, spec: &str, asset: &AssetRequest<'_>) -> Result<()> {
    if let Some(bundled) = vendor_bundle(shared, spec) {
        return write_asset(stream, "application/javascript; charset=utf-8", &bundled, asset);
    }
    let resolved = match resolve_request(&shared.cwd, None, spec) {
        Ok(resolved) => resolved,
        Err(error) => return write_response(stream, 404, "text/plain; charset=utf-8", error.as_bytes(), asset.head),
    };
    match resolved.kind {
        ModuleKind::Cjs => {
            let names = packages::cjs_export_names(&shared.cwd, spec);
            let source = cjs_facade(&raw_url(&resolved.path), &names);
            write_asset(stream, "application/javascript; charset=utf-8", source.as_bytes(), asset)
        }
        ModuleKind::Esm => {
            let source = fs::read_to_string(&resolved.path)?;
            let rewritten = rewrite_esm(&source, &resolved.path, &shared.cwd);
            write_asset(stream, "application/javascript; charset=utf-8", rewritten.as_bytes(), asset)
        }
        ModuleKind::Css | ModuleKind::Json => {
            let bytes = fs::read(&resolved.path)?;
            write_asset(stream, content_type(&resolved.path), &bytes, asset)
        }
    }
}

fn serve_package_file(stream: &mut TcpStream, shared: &Shared, path: &Path, rewrite: bool, asset: &AssetRequest<'_>) -> Result<()> {
    if !path_is_inside(path, &workspace_root(&shared.cwd)) || !path.is_file() {
        let missing = format!("flashpack package file not found: {}", path.display());
        return write_response(stream, 404, "text/plain; charset=utf-8", missing.as_bytes(), asset.head);
    }
    if !rewrite {
        let bytes = fs::read(path)?;
        return write_asset(stream, "application/javascript; charset=utf-8", &bytes, asset);
    }
    let kind = packages::resolve_request(&shared.cwd, None, &path.to_string_lossy().replace('\\', "/"));
    let source = fs::read_to_string(path).unwrap_or_default();
    if source.contains("\nimport ") || source.contains("\nexport ") || source.starts_with("import ") || source.starts_with("export ") || path.extension().and_then(|ext| ext.to_str()) == Some("mjs") {
        let rewritten = rewrite_esm(&source, path, &shared.cwd);
        return write_asset(stream, "application/javascript; charset=utf-8", rewritten.as_bytes(), asset);
    }
    let _ = kind;
    let bytes = fs::read(path)?;
    write_asset(stream, content_type(path), &bytes, asset)
}

fn serve_source(stream: &mut TcpStream, shared: &Shared, request: &str, head: bool) -> Result<()> {
    let pathname = request
        .split_once("://")
        .and_then(|(_, rest)| rest.find('/').map(|index| &rest[index..]))
        .unwrap_or(request);
    let pathname = pathname.split('?').next().unwrap_or(pathname);
    let relative = pathname
        .strip_prefix("/_flashpack/modules/")
        .or_else(|| pathname.strip_prefix('/'))
        .unwrap_or(pathname);
    if relative.contains("..") {
        return write_response(stream, 404, "text/plain", b"missing source", head);
    }
    let file = shared.cwd.join(relative);
    if !file.is_file() || !path_is_inside(&file, &shared.cwd) {
        let missing = format!("missing source: {relative}");
        return write_response(stream, 404, "text/plain; charset=utf-8", missing.as_bytes(), head);
    }
    let bytes = fs::read(&file)?;
    write_response(stream, 200, content_type(&file), &bytes, head)
}

fn compile_css(cwd: &Path) -> Result<()> {
    let script_dir = cwd.join(".flash").join("dev");
    fs::create_dir_all(&script_dir)?;
    let script_path = script_dir.join("compile-css.mjs");
    fs::write(
        &script_path,
        r#"import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const cwd = process.argv[2];
const fromCandidates = [
  path.join(cwd, 'app', 'globals.css'),
  path.join(cwd, 'src', 'app', 'globals.css'),
];
const from = fromCandidates.find((candidate) => existsSync(candidate));
if (!from) {
  const out = path.join(cwd, '.flash', 'dev', 'app.css');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, '/* no globals.css */\n');
  process.exit(0);
}
function resolvePkg(name) {
  const roots = [cwd, path.resolve(cwd, '../..'), path.resolve(cwd, '../../..'), path.resolve(cwd, '../../../..')];
  for (const root of roots) {
    try {
      return createRequire(path.join(root, 'package.json'))(name);
    } catch {}
  }
  throw new Error(`Cannot find package '${name}' for flashpack CSS compile`);
}
const postcss = resolvePkg('postcss');
const tailwindcss = resolvePkg('@tailwindcss/postcss');
const processor = postcss.default || postcss;
const plugin = tailwindcss.default || tailwindcss;
const result = await processor([plugin()]).process(readFileSync(from, 'utf8'), { from });
const out = path.join(cwd, '.flash', 'dev', 'app.css');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, result.css);
"#,
    )?;
    let mut node_path_entries = Vec::new();
    let mut cursor = Some(cwd.to_path_buf());
    while let Some(dir) = cursor {
        let candidate = dir.join("node_modules");
        if candidate.is_dir() {
            node_path_entries.push(candidate.to_string_lossy().into_owned());
        }
        cursor = dir.parent().map(|parent| parent.to_path_buf());
    }
    let mut command = Command::new("node");
    command.arg(&script_path).arg(cwd).current_dir(cwd);
    if !node_path_entries.is_empty() {
        let joined = node_path_entries.join(if cfg!(windows) { ";" } else { ":" });
        let existing = std::env::var_os("NODE_PATH").unwrap_or_default();
        if existing.is_empty() {
            command.env("NODE_PATH", joined);
        } else {
            command.env(
                "NODE_PATH",
                format!("{joined}{}{}", if cfg!(windows) { ";" } else { ":" }, existing.to_string_lossy()),
            );
        }
    }
    let output = command
        .output()
        .context("node is required to compile Tailwind CSS")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        anyhow::bail!("{stderr}{stdout}");
    }
    Ok(())
}

fn write_response(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8], head: bool) -> Result<()> {
    write_with_cache(stream, status, content_type, body, head, "no-store", None, None)
}

fn write_with_cache(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
    head: bool,
    cache_control: &str,
    etag: Option<&str>,
    if_none_match: Option<&str>,
) -> Result<()> {
    if let (Some(tag), Some(presented)) = (etag, if_none_match) {
        let matches = presented.split(',').any(|part| {
            let part = part.trim();
            part == "*" || part == tag || part.trim_start_matches("W/") == tag
        });
        if matches {
            let header = format!(
                "HTTP/1.1 304 Not Modified\r\nETag: {tag}\r\nCache-Control: {cache_control}\r\nX-Vista-Engine: flashpack\r\nConnection: close\r\n\r\n"
            );
            stream.write_all(header.as_bytes())?;
            return Ok(());
        }
    }
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Error",
    };
    let etag_header = etag.map(|tag| format!("ETag: {tag}\r\n")).unwrap_or_default();
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n{etag_header}Cache-Control: {cache_control}\r\nX-Vista-Engine: flashpack\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    if !head && status != 204 {
        stream.write_all(body)?;
    }
    Ok(())
}
