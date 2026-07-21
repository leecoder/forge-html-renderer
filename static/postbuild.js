const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "build");
const src = path.join(buildDir, "fullview.html");
const destDir = path.join(buildDir, "fullview");
const dest = path.join(destDir, "index.html");

if (fs.existsSync(src)) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.renameSync(src, dest);

  const srcAssetsDir = path.join(buildDir, "assets");
  const destAssetsDir = path.join(destDir, "assets");

  if (!fs.existsSync(destAssetsDir)) {
    fs.mkdirSync(destAssetsDir, { recursive: true });
  }

  let html = fs.readFileSync(dest, "utf-8");
  html = html.replace(/\.\.\/assets\//g, "./assets/");
  fs.writeFileSync(dest, html, "utf-8");

  const assetFiles = fs.readdirSync(srcAssetsDir);
  for (const file of assetFiles) {
    fs.copyFileSync(path.join(srcAssetsDir, file), path.join(destAssetsDir, file));
  }

  console.log("Moved fullview.html -> fullview/index.html (copied assets into fullview/assets/)");
} else {
  console.log("fullview.html not found in build output, skipping.");
}
