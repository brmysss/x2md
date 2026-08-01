import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const roots = ["build", "dist"];

function copyExtension(appPath) {
  const target = join(appPath, "Contents", "Resources", "extension");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync("extension", target, {
    recursive: true,
    filter: (source) => !source.includes(`${join("extension", "tests")}`) && !source.endsWith(".DS_Store"),
  });
  for (const file of ["manifest.json", "background.js", "save_response.js"]) {
    if (!existsSync(join(target, file))) throw new Error(`extension copy missing ${file}`);
  }
  console.log(`copied extension -> ${target}`);
}

function copySettingsViews(appPath) {
  const viewsRoot = join(appPath, "Contents", "Resources", "app", "views");
  const settingsTarget = join(viewsRoot, "settings");
  mkdirSync(settingsTarget, { recursive: true });
  cpSync("app/ui/settings/index.html", join(settingsTarget, "index.html"));
  cpSync("app/ui/settings/styles.css", join(settingsTarget, "styles.css"));
  const result = spawnSync(process.env.BUN_BINARY || "bun", [
    "build", "app/ui/settings/settings.ts", "--target=browser", "--format=esm",
    `--outfile=${join(settingsTarget, "settings.js")}`,
  ], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "settings bundle failed");

  const assetsTarget = join(viewsRoot, "assets");
  mkdirSync(assetsTarget, { recursive: true });
  cpSync("assets/AppIcon.iconset/icon_128x128.png", join(assetsTarget, "icon.png"));
  cpSync("assets/tray-icon.png", join(assetsTarget, "tray-icon.png"));

  for (const file of ["index.html", "styles.css", "settings.js"]) {
    if (!existsSync(join(settingsTarget, file))) throw new Error(`settings view copy missing ${file}`);
  }
  console.log(`copied settings views -> ${settingsTarget}`);
}

let copied = 0;
for (const root of roots) {
  if (!existsSync(root)) continue;
  const { readdirSync, statSync } = await import("node:fs");
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (name.endsWith(".app") && statSync(path).isDirectory()) {
        copyExtension(path);
        copySettingsViews(path);
        copied += 1;
        continue;
      }
      if (statSync(path).isDirectory()) stack.push(path);
    }
  }
}

if (!copied) throw new Error("no .app found; extension copy failed");
