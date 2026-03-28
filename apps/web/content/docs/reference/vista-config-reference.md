---
category: "reference"
slug: "vista-config-reference"
title: "Vista Config Reference"
summary: "Reference for `vista.config.ts` including server settings, image config, and experimental typed API flags."
order: 1
updatedAt: "2026-03-04"
---

## Minimal Config

```ts
const config = {};
export default config;
```

## Engine Variant

```ts
const config = {
  engine: {
    variant: 'flashpack', // 'default' | 'flashpack'
  },
};

export default config;
```

Vista CLI reads this setting for `vista dev`, `vista build`, and `vista start`, so generated app scripts do not need engine-specific variants.

## Typed API Config

```ts
const config = {
  experimental: {
    typedApi: {
      enabled: true,
      serialization: 'json', // 'json' | 'superjson'
      bodySizeLimitBytes: 1024 * 1024,
    },
  },
};

export default config;
```

## Server Port

```ts
const config = {
  server: {
    port: 3000,
  },
};

export default config;
```

## Image Domains

```ts
const config = {
  images: {
    domains: ['example.com', 'cdn.myapp.com'],
  },
};

export default config;
```

## Related
- [Typed API Runtime Flow](/docs/core-concepts/typed-api-runtime-flow)
- [Rust Crates and NAPI Bridge](/docs/reference/rust-crates-and-napi-bridge)
- [Project File Structure](/docs/reference/project-file-structure)
