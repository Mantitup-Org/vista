import path from "path";
import fs from "fs-extra";
import { generateCloudflareRedirects } from "../src/deploy/cloudflare";

describe("generateCloudflareRedirects", () => {
  const tmp = path.join(__dirname, "tmp-cf");

  beforeEach(async () => {
    await fs.ensureDir(tmp);
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test("creates default redirects with .rsc rule first", () => {
    const redirects = generateCloudflareRedirects(tmp);
    const lines = redirects.trim().split("\n");
    expect(lines[0]).toMatch(/^\/\*\.rsc/);
    expect(lines[1]).toMatch(/^\/\*/);
  });

  test("preserves custom redirects and adds missing .rsc rule", async () => {
    const custom = `/*    /index.html   200\n/api/*   /api/:splat   200`;
    await fs.writeFile(path.join(tmp, "_redirects"), custom);
    const redirects = generateCloudflareRedirects(tmp);
    const lines = redirects.trim().split("\n");
    // .rsc rule should be added at the top
    expect(lines[0]).toMatch(/^\/\*\.rsc/);
    // custom lines should still be present
    expect(lines).toContainEqual(expect.stringMatching(/^\/\*    \/index\.html/));
    expect(lines).toContainEqual(expect.stringMatching(/^\/api\/\*/));
  });
});
