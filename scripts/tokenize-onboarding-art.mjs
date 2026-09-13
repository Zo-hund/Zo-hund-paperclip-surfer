// Preserve the onboarding artwork's exact colors in the shared token layer.
// Idempotent codemod: node scripts/tokenize-onboarding-art.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const component = new URL("ui/src/components/onboarding/PillGuy.tsx", root);
const stylesheet = new URL("ui/src/index.css", root);
const colors = {
  "#060606": "eyes", "#626262": "dormant-start", "#101010": "dormant-end",
  "#2D200D": "tuft", "#3028AA": "alive-start", "#FF0000": "alive-end",
};
let source = readFileSync(component, "utf8");
let css = readFileSync(stylesheet, "utf8");
const declarations = [];
for (const [value, name] of Object.entries(colors)) {
  const token = `--onboarding-art-${name}`;
  source = source.replaceAll(`="${value}"`, `="var(${token})"`);
  if (!css.includes(`${token}:`)) declarations.push(`  ${token}: ${value};`);
}
if (declarations.length) {
  const anchor = ":root {";
  if (!css.includes(anchor)) throw new Error("Token root missing; no files written");
  css = css.replace(anchor, `${anchor}\n  /* Fixed brand artwork colors; identical in light and dark themes. */\n${declarations.join("\n")}`);
}
for (const [value, name] of Object.entries(colors)) {
  if (source.includes(`="${value}"`) || !css.includes(`--onboarding-art-${name}: ${value};`)) {
    throw new Error("Artwork token conversion failed; no files written");
  }
}
writeFileSync(component, source);
writeFileSync(stylesheet, css);
console.log(`Tokenized artwork in ${fileURLToPath(component)}`);
