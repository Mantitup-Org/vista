# Vista AI full-stack example

A single Vista project with:

- a page
- `app/api/health/route.ts`
- `app/agents/support/agent.ts`
- root middleware

```bash
npx create-vista-app@latest my-app
# copy these files into the generated app, then:
npx vista dev
```

## Try it

- `GET /api/health`
- `POST /api/agents/support` with `{ "input": "How do API routes work?" }`
