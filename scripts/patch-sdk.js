/**
 * Post-install script: patches the Sphere SDK's fs.renameSync calls
 * to be Windows-safe (copy+delete fallback).
 *
 * Run automatically via `npm install` (see package.json scripts.postinstall).
 */

import * as fs from "fs";
import * as path from "path";

const sdkFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "@unicitylabs",
  "sphere-sdk",
  "dist",
  "impl",
  "nodejs",
  "index.js"
);

if (!fs.existsSync(sdkFile)) {
  console.log("[patch] SDK file not found, skipping");
  process.exit(0);
}

let content = fs.readFileSync(sdkFile, "utf8");

const oldLine = "    fs.renameSync(tmpPath, this.filePath);";
const safeLine =
  '    try { fs.renameSync(tmpPath, this.filePath); } catch (e) { if (e.code === "EPERM" || e.code === "EBUSY" || e.code === "ENOENT") { try { fs.copyFileSync(tmpPath, this.filePath); fs.unlinkSync(tmpPath); } catch { try { fs.writeFileSync(this.filePath, fs.readFileSync(tmpPath)); fs.unlinkSync(tmpPath); } catch {} } } else throw e; }';

let count = 0;
while (content.includes(oldLine)) {
  content = content.replace(oldLine, safeLine);
  count++;
}

if (count > 0) {
  fs.writeFileSync(sdkFile, content);
  console.log(`[patch] Patched ${count} renameSync calls for Windows compatibility`);
} else {
  console.log("[patch] Already patched or pattern not found");
}
