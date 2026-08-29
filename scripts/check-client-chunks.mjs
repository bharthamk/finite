import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const maximumBytes = 500_000;
const assetsDirectory = resolve("dist/client/assets");
const javascriptAssets = (await readdir(assetsDirectory)).filter((name) => name.endsWith(".js"));

if (!javascriptAssets.length) throw new Error("No production client JavaScript chunks were emitted.");

const oversized = [];
for (const name of javascriptAssets) {
  const { size } = await stat(resolve(assetsDirectory, name));
  if (size > maximumBytes) oversized.push(`${name} (${size} bytes)`);
}

if (oversized.length) {
  throw new Error(`Production client chunk budget exceeded: ${oversized.join(", ")}`);
}

console.log(`Client chunk budget passed: ${javascriptAssets.length} chunks, each at or below ${maximumBytes} bytes.`);

