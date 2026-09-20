import path from "path";
import fs from "fs-extra";

/**
 * Returns an array of tuples `[sourcePath, relativeDestinationPath]` for the
 * files that need to be emitted for a given platform. If the project already
 * contains a file (e.g. `Dockerfile`), that file is used; otherwise the engine
 * fallback template is used.
 */
export async function getPlatformTemplates(
  platform: string,
  projectRoot: string,
): Promise<Array<[string, string]>> {
  const templatesDir = path.resolve(__dirname, "templates", platform);
  const result: Array<[string, string]> = [];

  // Mapping of expected files per platform
  const platformMap: Record<string, string[]> = {
    cloudflare: ["wrangler.toml", "_redirects"],
    vercel: ["vercel.json"],
    netlify: ["netlify.toml"],
    render: ["render.yaml"],
    docker: ["Dockerfile"],
  };

  const files = platformMap[platform] ?? [];

  for (const file of files) {
    const projectFile = path.join(projectRoot, file);
    const fallbackFile = path.join(templatesDir, file);

    if (await fs.pathExists(projectFile)) {
      result.push([projectFile, file]);
    } else if (await fs.pathExists(fallbackFile)) {
      result.push([fallbackFile, file]);
    } else {
      // No template – skip silently; some platforms (e.g., Cloudflare) may not need a file.
    }
  }

  return result;
}
