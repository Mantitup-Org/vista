import Image from 'vista/image';
import { listNotes } from './api/notes/notes-store';

export default function Index() {
  const notes = listNotes();

  return (
    <main className="min-h-screen bg-white px-6 py-16 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <div className="mx-auto grid max-w-4xl gap-12 md:grid-cols-[180px_1fr] md:items-start">
        <Image src="/vista.svg" alt="Vista Logo" width={180} height={180} unoptimized className="dark:invert" />

        <section>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-orange-600">Full-stack Vista example</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Notes from the app directory</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            This page reads the same server-only store used by the API routes below. The browser-facing page and
            backend handlers live together without a separate server project.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {notes.map((note) => (
              <article key={note.id} className="border border-zinc-200 p-5 dark:border-zinc-800">
                <h2 className="font-semibold">{note.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{note.body}</p>
                <a
                  className="mt-4 inline-block text-sm font-medium text-orange-600 underline underline-offset-4"
                  href={`/api/notes/${note.id}`}
                >
                  View JSON endpoint
                </a>
              </article>
            ))}
          </div>

          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            Collection endpoint: <a className="underline" href="/api/notes">/api/notes</a> (GET and POST). Each
            note endpoint supports GET, PATCH, and DELETE.
          </p>
        </section>
      </div>
    </main>
  );
}
