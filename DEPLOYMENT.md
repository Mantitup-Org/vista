# Deploying Vista.js Applications

Vista.js features built-in, zero-config deployment adapters targeting all major cloud platforms.

When building your project via `vista build`, Vista automatically detects the target hosting environment or builds using the adapter specified via `--adapter`:

```bash
# Automatic cloud platform detection
vista build

# Or explicitly select target adapter
vista build --adapter vercel
vista build --adapter cloudflare
vista build --adapter render
vista build --adapter docker
vista build --adapter node
```

---

## 1. Deploying to Vercel

Vista includes a native adapter for **Vercel Build Output API v3** (`.vercel/output`).

### Zero-Config Setup

1. Push your code to GitHub, GitLab, or Bitbucket.
2. Import your repository on [vercel.com/new](https://vercel.com/new).
3. Vercel automatically detects Vista.js and sets the build command to `vista build` and output directory to `.vercel/output`.
4. Deploy!

### Build Artifacts Generated
- `.vercel/output/config.json`: Serverless route routing and static optimization rules.
- `.vercel/output/static/`: Static pages, RSC payloads, images, and public assets.

---

## 2. Deploying to Cloudflare Workers & Pages

Vista produces edge-ready assets with an optimized `_worker.js` entrypoint.

### Zero-Config Setup

1. Run the build with Cloudflare adapter:
   ```bash
   vista build --adapter cloudflare
   ```
2. Deploy using Wrangler CLI:
   ```bash
   npx wrangler deploy
   ```

### Build Artifacts Generated
- `.vista/cloudflare/_worker.js`: Cloudflare Workers Fetch event handler.
- `.vista/cloudflare/wrangler.toml`: Generated Cloudflare configuration.

---

## 3. Deploying to Render

Render is ideal for long-running Node.js servers and full-stack background processes.

### Quick Deploy (Blueprint)

1. Go to [render.com/new](https://dashboard.render.com/new).
2. Select **Blueprint** and connect your GitHub repository.
3. Render auto-detects `render.yaml` and sets up the web service automatically.
4. Click **Apply**.

### Manual Setup
- **Runtime:** Node
- **Build Command:** `pnpm build` (or `npx vista build`)
- **Start Command:** `npx vista start`
- **Port:** `3003` (or process.env.PORT)

---

## 4. Node.js Standalone Deployment

For custom VMs, AWS EC2, VPS, or self-hosted servers:

1. Build standalone bundle:
   ```bash
   vista build
   ```
2. The standalone server is output to `.vista/standalone/`:
   ```bash
   cd .vista/standalone
   PORT=3000 node server.js
   ```

All required project files, manifests, and framework dependencies are isolated in `.vista/standalone/`.

---

## 5. Docker Containerization

Deploy Vista anywhere with Docker or Kubernetes:

1. Generate containerization assets:
   ```bash
   vista build --adapter docker
   ```
2. Build and run the Docker image:
   ```bash
   docker build -t my-vista-app .
   docker run -p 3000:3000 my-vista-app
   ```

The generated `Dockerfile` utilizes a lightweight, multi-stage build running Node.js Alpine as a non-root user (`nodejs:nodejs`).

---

## Environment Variables Reference

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Listening HTTP port | `3000` (standalone) / `3003` (dev) |
| `HOST` | Network interface host | `0.0.0.0` |
| `NODE_ENV` | Runtime environment | `production` |
| `VISTA_ADAPTER` | Deployment target adapter (`vercel`, `cloudflare`, `render`, `docker`, `node`) | Auto-detected |
