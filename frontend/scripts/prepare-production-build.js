const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const publicDir = path.resolve(__dirname, "../public");
const sw = path.join(publicDir, "service-worker.js");
const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || crypto.randomBytes(12).toString("hex");
fs.writeFileSync(sw, fs.readFileSync(sw, "utf8").replace(/__MOMENTS_BUILD_VERSION__/g, version));
fs.writeFileSync(path.join(publicDir, "build-version.json"), JSON.stringify({version}));
