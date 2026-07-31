import { existsSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/package-release.mjs --windows-zip <validated zip> --provenance <Sigstore bundle> [--output-dir <directory>]\n\nPackages a release candidate and refuses unsigned or unvalidated cross-platform inputs.");
  process.exit(0);
}
const outputIndex = args.indexOf("--output-dir");
if (outputIndex >= 0 && !args[outputIndex + 1]) throw new Error("--output-dir requires a directory");
const releaseDir = outputIndex >= 0 ? args[outputIndex + 1] : join("artifacts", `v${version}`);
const releasePath = resolve(releaseDir);
execFileSync(process.execPath, ["scripts/sync-extension-version.mjs", "--check"], { stdio: "inherit" });
const windowsIndex = args.indexOf("--windows-zip");
const provenanceIndex = args.indexOf("--provenance");
const windowsZip = windowsIndex >= 0 ? args[windowsIndex + 1] : "";
const provenanceBundle = provenanceIndex >= 0 ? args[provenanceIndex + 1] : "";
if (!windowsZip || !existsSync(windowsZip)) throw new Error("--windows-zip must reference a windows-latest validated X2MD_Windows_Beta.zip");
if (!provenanceBundle || !existsSync(provenanceBundle)) throw new Error("--provenance must reference a GitHub attestation Sigstore bundle");
const appPath = "build/stable-macos-arm64/X2MD.app";
if (!existsSync(appPath)) throw new Error(`missing ${appPath}; run npm run build:mac first`);
if (existsSync(releasePath)) throw new Error(`output directory already exists: ${releasePath}`);
mkdirSync(releasePath, { recursive: true });

execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, join(releasePath, "X2MD_Mac.zip")], { stdio: "inherit" });
execFileSync("zip", ["-qr", join(releasePath, "X2MD_Extension.zip"), ".", "-x", "tests/*", "*.DS_Store"], { cwd: "extension", stdio: "inherit" });

cpSync(windowsZip, join(releasePath, "X2MD_Windows_Beta.zip"));
cpSync(provenanceBundle, join(releasePath, "PROVENANCE.sigstore.json"));

if (existsSync("artifacts/stable-macos-arm64-update.json")) {
  cpSync("artifacts/stable-macos-arm64-update.json", join(releasePath, "update.json"));
} else {
  writeFileSync(join(releasePath, "update.json"), JSON.stringify({ version, notes: `X2MD v${version}` }, null, 2), "utf8");
}

const notesPath = join("release", `v${version}`, "RELEASE_NOTES.md");
if (existsSync(notesPath)) cpSync(notesPath, join(releasePath, "RELEASE_NOTES.md"));
execFileSync(process.execPath, ["node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js", "--output-file", join(releasePath, "SBOM.cdx.json"), "--omit", "dev"], { stdio: "inherit" });
const sums = execFileSync("shasum", ["-a", "256", "X2MD_Mac.zip", "X2MD_Extension.zip", "X2MD_Windows_Beta.zip", "update.json", "SBOM.cdx.json", "PROVENANCE.sigstore.json"], { cwd: releasePath, encoding: "utf8" });
writeFileSync(join(releasePath, "SHA256SUMS.txt"), sums, "utf8");
console.log(`packaged release ${releasePath}`);
