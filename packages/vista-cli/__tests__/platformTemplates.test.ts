import path from "path";
import fs from "fs-extra";
import { getPlatformTemplates } from "../src/deploy/platformTemplates";

describe("getPlatformTemplates", () => {
  const tmp = path.join(__dirname, "tmp-project");

  beforeAll(async () => {
    await fs.ensureDir(tmp);
    // Create a custom Dockerfile to test precedence
    await fs.writeFile(path.join(tmp, "Dockerfile"), "FROM node:20");
  });

  afterAll(async () => {
    await fs.remove(tmp);
  });

  test("prefers project files over engine templates", async () => {
    const files = await getPlatformTemplates("docker", tmp);
    expect(files).toHaveLength(1);
    const [src, dest] = files[0];
    expect(dest).toBe("Dockerfile");
    const content = await fs.readFile(src, "utf8");
    expect(content).toContain("FROM node:20");
  });

  test("falls back to engine template when project file missing", async () => {
    const files = await getPlatformTemplates("vercel", tmp);
    // The engine provides a default vercel.json template
    expect(files).toHaveLength(1);
    const [src, dest] = files[0];
    expect(dest).toBe("vercel.json");
    const exists = await fs.pathExists(src);
    expect(exists).toBe(true);
  });
});
