import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const candidates = process.argv
  .slice(2)
  .filter((file) => /^src\/(engine|combat)\/.*\.ts$/.test(file))
  .filter((file) => existsSync(file));

if (candidates.length === 0) {
  process.exit(0);
}

const config = JSON.parse(readFileSync("biome.json", "utf-8"));
config.plugins = [
  ...(config.plugins ?? []).map((pluginPath) => resolve(pluginPath)),
  resolve("plugins/no-hardcoded-description-text.grit"),
];

const configPath = resolve(tmpdir(), "world-biome-hardcoded-description.json");
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const result = spawnSync("npx", ["biome", "check", "--config-path", configPath, ...candidates], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
