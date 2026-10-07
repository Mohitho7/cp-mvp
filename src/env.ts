import fs from "node:fs";
import path from "node:path";

/** Minimal .env loader (no dependency). Vercel/real env vars always win. */
export function loadEnvFile(
  filename = ".env",
  cwd: string = process.cwd(),
): void {
  const file = path.resolve(cwd, filename);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required.`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}
