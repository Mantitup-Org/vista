# Vista.js AI-Native Full-Stack Example

This example demonstrates the unified AI-native full-stack capabilities of [Vista.js](https://github.com/Mantitup-Org/vista):

1. **File-Based API Routes (`app/api/**/route.ts`)**: Standard Web `Request` and `Response` with dynamic route params (`[id]`) and full HTTP verb dispatch (`GET`, `POST`, `PUT`, `DELETE`).
2. **Built-in Middleware (`middleware.ts`)**: Intercepts requests with `{ request, next }`, header mutation, and route matchers.
3. **Native AI Framework (`vista/ai`)**: First-class agents with tools, streaming Web API responses, and conversational memory.
4. **Zero-Config Deployment**: Adapters for Vercel, Cloudflare Workers, Render, Docker, and Node.js standalone.

## Project Structure

```text
examples/ai-fullstack/
├── app/
│   ├── api/
│   │   ├── health/
│   │   │   └── route.ts         # GET & POST /api/health
│   │   └── users/
│   │       └── [id]/
│   │           └── route.ts     # Dynamic API route: GET, PUT, DELETE /api/users/:id
│   └── agents/
│       └── support/
│           └── agent.ts         # AI Agent using vista/ai with tools and streaming
├── middleware.ts                # Request interception and auth guards
└── README.md
```

## Running the Example

```bash
# Start development server
vista dev

# Build production bundle with automatic deployment adapters
vista build

# Or generate deployment adapters directly
vista deploy --adapter vercel
vista deploy --adapter cloudflare
vista deploy --adapter docker
```
