// Trifold entrypoint (Node 22, standard library only): it hands the app in by
// copying app/ and screenshots/ from beside this file into the output directory
// and writing /output/dossier.json with the kit's vendored dossier library.
// Every path is resolved from this file's own location, so the program works
// from any working directory; outside the grader, MAKEFUN_OUTPUT_DIR stands
// in for /output, e.g. `MAKEFUN_OUTPUT_DIR=out node main.ts`.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-frontend.ts";

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(out, { recursive: true });
cpSync(join(root, "app"), join(out, "app"), { recursive: true });
mkdirSync(join(out, "screenshots"), { recursive: true });
if (existsSync(join(root, "screenshots"))) {
  cpSync(join(root, "screenshots"), join(out, "screenshots"), { recursive: true });
}

writeFileSync(
  join(out, "dossier.json"),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 3, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 16777216,
  }),
);
