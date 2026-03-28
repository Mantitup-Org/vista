/**
 * Vista RSC (React Server Components) Build System
 *
 * This module implements the True RSC Architecture:
 * 1. Server components render on the server and contribute 0kb to client bundle
 * 2. Client components are marked with 'use client' and hydrate on the browser
 * 3. Strict separation ensures server secrets never leak to client
 *
 * Performance: Uses Rust-powered native scanning when available
 */

export * from './compiler';
export * from './client-manifest';
export * from './server-manifest';
export * from './native-scanner';
