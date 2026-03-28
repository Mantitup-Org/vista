import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

async function ensureParentDir(target) {
  await mkdir(dirname(target), { recursive: true });
}

export async function recursiveCopy(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = join(sourceDir, entry.name);
      const targetPath = join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await recursiveCopy(sourcePath, targetPath);
        return;
      }

      await ensureParentDir(targetPath);
      await cp(sourcePath, targetPath, { recursive: false, force: true });
    })
  );
}
