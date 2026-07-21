const fs = require("fs");
const path = require("path");

// Move fullview.html into build/fullview/index.html so Forge can serve it as a resource
const buildDir = path.join(__dirname, "build");
const src = path.join(buildDir, "fullview.html");
const destDir = path.join(buildDir, "fullview");
const dest = path.join(destDir, "index.html");

if (fs.existsSync(src)) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.renameSync(src, dest);

  // Fix relative asset paths: ./assets/ -> ../assets/ (assets are in build/assets/)
  let html = fs.readFileSync(dest, "utf-8");
  html = html.replace(/(?:\.\/assets\/)/g, "../assets/");
  fs.writeFileSync(dest, html, "utf-8");

  console.log("Moved fullview.html -> fullview/index.html (fixed asset paths)");
} else {
  console.log("fullview.html not found in build output, skipping.");
}
