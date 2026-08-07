import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git" || entry.name === "node_modules") {
      return [];
    }
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const failures = [];
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

for (const markdown of walk(root).filter((file) => file.endsWith(".md"))) {
  const content = fs.readFileSync(markdown, "utf8");
  for (const match of content.matchAll(linkPattern)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    target = target.split(/\s+['"]/u, 1)[0];
    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:") ||
      target.startsWith("#")
    ) {
      continue;
    }
    const relative = decodeURIComponent(target.split("#", 1)[0]);
    const resolved = path.resolve(path.dirname(markdown), relative);
    if (!fs.existsSync(resolved)) {
      failures.push(`${path.relative(root, markdown)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Broken local Markdown links:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log("Validated local Markdown links.");
