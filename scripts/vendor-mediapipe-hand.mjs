#!/usr/bin/env node
// Fetches the HandLandmarker weights into public/, once.
//
// Vendored rather than loaded from Google's CDN at runtime, matching how three.js and the
// face model are already handled: the page must work with no third-party request and no
// network at all after install.

import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "public", "mediapipe", "models", "hand_landmarker.task");
const url =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

if (existsSync(target) && statSync(target).size > 1_000_000) {
  console.log(`hand_landmarker.task already vendored (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
  process.exit(0);
}

mkdirSync(path.dirname(target), { recursive: true });
console.log(`fetching ${url}`);

const response = await fetch(url);
if (!response.ok) throw new Error(`${url} returned ${response.status}`);
await pipeline(Readable.fromWeb(response.body), createWriteStream(target));

console.log(`wrote ${target} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
