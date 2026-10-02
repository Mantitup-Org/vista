---
name: vista-dev-loop
description: >
  Verify a Vista app edit against the running dev server. Use after changing
  pages, layouts, routes, styles, or client state in an app whose scripts are
  `vista dev` / `vista build`. Covers port 3003, `.vista` vs `.flash`, and
  reading the dev terminal before claiming the change works.
---

# Vista dev loop

Run this after each edit that changes what the user sees or what a route returns. Do not claim the UI works from a file read alone.

## Steps

1. Confirm the app scripts are `vista dev`, `vista build`, and `vista start`. Do not rename them when `vista.config.ts` sets `engine.variant` to `flashpack`.
2. Start `vista dev` if it is not already running. The default port is `3003`. If the port is taken, stop the existing Vista process and start once. Do not start a second server.
3. Request the changed route. For a page, open `http://localhost:3003<path>`. For a route handler, call the HTTP method the file exports.
4. Read the dev terminal. A successful page log looks like `GET / 200`. Compile and runtime errors are printed there. Fix the first error and request the route again.
5. On the flashpack engine, dev artifacts are under `.flash/` (`dev/modules`, `dev/ssr`, `logs`). Production build artifacts stay under `.vista/`. Do not treat those folders as duplicates.
6. When the change is visual or interactive, exercise the control (click, type, submit, navigate), including the empty and error states the edit touches.

## Stop when

The changed route returns the expected status, the terminal has no new error for that request, and the interaction you changed behaves correctly.
