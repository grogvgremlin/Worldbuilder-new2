// Reads a folder on disk into { "relative/path": "text" }, the shape the importer takes.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

export function readFolder(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(csv|yaml)$/.test(name)) files[relative(root, path)] = readFileSync(path, "utf8");
    }
  };
  walk(root);
  return files;
}

// The private book data, where it's checked out beside this repo.
export const TOW_DATA = join(__dirname, "../../worldbuilder-data/games/tow");
export const hasTowData = existsSync(TOW_DATA);
