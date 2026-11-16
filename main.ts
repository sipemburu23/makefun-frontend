// Entrypoint for "make.fun board" (makefun-frontend-01).
//
// Hands the frontend in: copies app/ and screenshots/ from this
// repository into the output directory and writes /output/dossier.json
// with buildDossier from vendor/makefun-frontend.ts (the kit's copy,
// unchanged). Every path is resolved from this script's own directory,
// never from the current working directory: the grader runs
// `node /bot/main.ts` from elsewhere, on a read-only /bot.
// Deterministic: the same files in the same order write the same bytes.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-frontend.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// The gate's caps, from the bounty rules: text at most 160 KiB, 3
// screenshots of at most 256 KiB each, app/ at most 993 entries and
// 16 MiB, every path at most 1,000 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16 * 1024 * 1024,
  app_path_max_bytes: 1000,
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(here, "app"), join(outDir, "app"), { recursive: true });
cpSync(join(here, "screenshots"), join(outDir, "screenshots"), { recursive: true });
writeFileSync(join(outDir, "dossier.json"), buildDossier(outDir, CAPS));
