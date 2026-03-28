import { rm } from 'node:fs/promises';

export async function recursiveDeleteSyncWithAsyncRetries(targetDir, retries = 3) {
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await rm(targetDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50 * (attempt + 1)));
    }
  }

  if (lastError) {
    throw lastError;
  }
}
