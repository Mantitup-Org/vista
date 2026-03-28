# Benchmarking Vista on production

This script measures production performance for a local Vista build by uploading the current Vista package to Vercel with a benchmark app and then running request benchmarks against the deployment.

## Requirements

- the Vercel CLI

## Setup

Rename the provided `./env.local` file to `./env` and fill in the required `VERCEL_TEST_TOKEN` and `VERCEL_TEST_TEAM` values. You can find and generate those from vercel.com.

Run `pnpm install`, `pnpm bench` and profit.

Note: if you made changes to Vista, compile them first from the monorepo root with either `pnpm dev` or `pnpm build --force`.

## How it works

- with the Vercel CLI, we setup a project
- we `npm pack` the local Vista build and add it to the repo
- we upload the repo to Vercel and let it build
- once it builds, we get the deployment url and run some tests
