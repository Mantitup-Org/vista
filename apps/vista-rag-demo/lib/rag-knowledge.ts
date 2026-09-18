export const KNOWLEDGE_DOCS = [
  {
    id: 'rsc',
    text: 'Vista.js supports React Server Components and Server Actions out of the box. Use "use server" for mutations and RSC for server-rendered UI.',
    metadata: { topic: 'RSC' },
  },
  {
    id: 'api-routes',
    text: 'File-based API routes live in app/**/route.ts. Export GET, POST, PUT, PATCH, or DELETE. Dynamic segments like [id] and [...slug] are passed via context.params.',
    metadata: { topic: 'API' },
  },
  {
    id: 'middleware',
    text: 'Built-in middleware uses a { request, next } signature. Put middleware.ts at the project root. You can rewrite, redirect, modify headers, or short-circuit with a Response.',
    metadata: { topic: 'Middleware' },
  },
  {
    id: 'deploy',
    text: 'vista deploy supports Vercel, Cloudflare, Render, Docker, and Netlify adapters with dry-run verification in CI.',
    metadata: { topic: 'Deploy' },
  },
  {
    id: 'ai-rag',
    text: 'Vista AI RAG uses InMemoryVectorStore plus createRetrieverTool. Agents call search_knowledge_base as a tool, then answer from retrieved chunks (agentic RAG). Without an embed function it falls back to keyword search.',
    metadata: { topic: 'AI' },
  },
  {
    id: 'refund-demo',
    text: 'Demo store policy: refunds are issued within 14 days of purchase when the order number is provided.',
    metadata: { topic: 'Demo FAQ' },
  },
] as const;
