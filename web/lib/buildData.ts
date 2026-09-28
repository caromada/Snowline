// Server-only: read the exported data at build time so marketing copy quotes
// real numbers and the model's real sentences. The daily ingest commit
// triggers a rebuild, so these never go stale by more than a day.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LandingData } from "./landingData";
import type { PassDetail } from "./types";

const DATA = path.join(process.cwd(), "public", "data");

export function landingAtBuild(): LandingData {
  return JSON.parse(readFileSync(path.join(DATA, "landing.json"), "utf8")) as LandingData;
}

export function passAtBuild(slug: string): PassDetail {
  return JSON.parse(readFileSync(path.join(DATA, "pass", `${slug}.json`), "utf8")) as PassDetail;
}
