import type { FullstackApisSectionContent } from '@/types/fullstack-apis';

/** Fullstack APIs in the same app directory. */
export const fullstackApisSection: FullstackApisSectionContent = {
  title: 'Same app.',
  titleMuted: 'Same request.',
  body: 'Edit a route, hit Run, and read the JSON. Pages and handlers share one app/ tree — no second service folder for a route that only your UI needs.',
  before: {
    label: 'Separate frontend & backend',
    caption: 'UI and API live in different projects. Run simulates the remote fetch.',
    defaultFileId: 'fe-notes',
    routeFileId: 'be-notes',
    tree: [
      { text: 'frontend/', muted: true },
      { text: '  src/', muted: true },
      { text: '    pages/', muted: true },
      { text: '      notes.tsx', fileId: 'fe-notes', highlight: true },
      { text: '      notes/[id].tsx', fileId: 'fe-note' },
      { text: '    lib/', muted: true },
      { text: '      api.ts', fileId: 'fe-api' },
      { text: '  package.json', fileId: 'fe-pkg', muted: true },
      { text: 'backend/', muted: true },
      { text: '  src/', muted: true },
      { text: '    routes/', muted: true },
      { text: '      notes.ts', fileId: 'be-notes', highlight: true },
      { text: '      notes/[id].ts', fileId: 'be-note' },
      { text: '  package.json', fileId: 'be-pkg', muted: true },
    ],
    files: [
      {
        id: 'fe-notes',
        path: 'frontend/src/pages/notes.tsx',
        language: 'tsx',
        runKind: 'page',
        source: `// Separate frontend — must reach another origin
const res = await fetch('https://api.example.com/notes')
if (!res.ok) throw new Error('backend unreachable')
const notes = await res.json()
return notes`,
      },
      {
        id: 'fe-note',
        path: 'frontend/src/pages/notes/[id].tsx',
        language: 'tsx',
        runKind: 'page',
        source: `const id = 'n1'
const res = await fetch(\`https://api.example.com/notes/\${id}\`)
const note = await res.json()
return note`,
      },
      {
        id: 'fe-api',
        path: 'frontend/src/lib/api.ts',
        language: 'ts',
        runKind: 'config',
        source: `export const API_URL = 'https://api.example.com'

export async function getNotes() {
  const res = await fetch(\`\${API_URL}/notes\`)
  return res.json()
}`,
      },
      {
        id: 'fe-pkg',
        path: 'frontend/package.json',
        language: 'json',
        runKind: 'config',
        source: `{
  "name": "notes-web",
  "dependencies": {
    "react": "^19.0.0"
  }
}`,
      },
      {
        id: 'be-notes',
        path: 'backend/src/routes/notes.ts',
        language: 'ts',
        runKind: 'route',
        source: `// Different repo, different deploy, different CORS
export async function GET() {
  return Response.json({
    notes: [
      { id: 'n1', title: 'Ship notes API' },
      { id: 'n2', title: 'Wire CORS' },
    ],
  })
}`,
      },
      {
        id: 'be-note',
        path: 'backend/src/routes/notes/[id].ts',
        language: 'ts',
        runKind: 'route',
        source: `export async function GET() {
  return Response.json({
    id: 'n1',
    title: 'Ship notes API',
    body: 'Stored on the API server.',
  })
}`,
      },
      {
        id: 'be-pkg',
        path: 'backend/package.json',
        language: 'json',
        runKind: 'config',
        source: `{
  "name": "notes-api",
  "dependencies": {
    "express": "^4.19.0"
  }
}`,
      },
    ],
  },
  after: {
    label: 'Vista — one app/',
    caption: 'Pages and routes share one directory. Edit a file and run it here.',
    defaultFileId: 'vista-route',
    routeFileId: 'vista-route',
    tree: [
      { text: 'app/', muted: true },
      { text: '  notes/', muted: true },
      { text: '    page.tsx', fileId: 'vista-page' },
      { text: '    [id]/', muted: true },
      { text: '      page.tsx', fileId: 'vista-note-page' },
      { text: '  api/', muted: true },
      { text: '    notes/', muted: true },
      { text: '      route.ts', fileId: 'vista-route', highlight: true },
      { text: '      [id]/', muted: true },
      { text: '        route.ts', fileId: 'vista-note-route', highlight: true },
      { text: 'package.json', fileId: 'vista-pkg', muted: true },
    ],
    files: [
      {
        id: 'vista-route',
        path: 'app/api/notes/route.ts',
        language: 'ts',
        runKind: 'route',
        source: `export async function GET() {
  return Response.json({
    notes: [
      { id: 'n1', title: 'Ship notes API' },
      { id: 'n2', title: 'Same app/ tree' },
    ],
  })
}

export async function POST() {
  return Response.json(
    { note: { id: 'n3', title: 'Created in-process' } },
    { status: 201 }
  )
}`,
      },
      {
        id: 'vista-note-route',
        path: 'app/api/notes/[id]/route.ts',
        language: 'ts',
        runKind: 'route',
        source: `export async function GET() {
  return Response.json({
    id: 'n1',
    title: 'Ship notes API',
    body: 'Served from app/api next to the page.',
  })
}`,
      },
      {
        id: 'vista-page',
        path: 'app/notes/page.tsx',
        language: 'tsx',
        runKind: 'page',
        source: `// Same origin — no second package, no CORS hop
const res = await fetch('/api/notes')
const notes = await res.json()
return notes`,
      },
      {
        id: 'vista-note-page',
        path: 'app/notes/[id]/page.tsx',
        language: 'tsx',
        runKind: 'page',
        source: `const id = 'n1'
const res = await fetch(\`/api/notes/\${id}\`)
const note = await res.json()
return note`,
      },
      {
        id: 'vista-pkg',
        path: 'package.json',
        language: 'json',
        runKind: 'config',
        source: `{
  "name": "notes-app",
  "dependencies": {
    "vista": "latest",
    "react": "^19.0.0"
  }
}`,
      },
    ],
  },
};
