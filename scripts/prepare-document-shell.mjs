import { readFile, rename } from "node:fs/promises";
import assert from "node:assert/strict";

const client = new URL("../dist/client/", import.meta.url);
const index = new URL("index.html", client);
const html = await readFile(index, "utf8");
assert.match(html, /<script[^>]+src="\/assets\//, "expected Vite-built document");
// No static index means the hosting dispatcher invokes our Worker for /.
// The Worker fetches this compiled asset and attaches the isolation headers.
await rename(index, new URL("finite-shell.html", client));
console.log("Document shell routed through the Worker.");
