// Next.js's "standalone" output (next.config.mjs -> output: "standalone")
// does not copy .next/static or public/ into the standalone bundle on its
// own -- that's a documented manual step. Without it, `node
// .next/standalone/server.js` starts but can't serve its own static
// assets. This runs automatically after every `next build` so `npm run
// build && npm start` works out of the box for local/Docker use, with no
// undocumented steps for anyone reproducing the project.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const copyIfExists = (src, dest) => {
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`[postbuild] copied ${path.relative(root, src)} -> ${path.relative(root, dest)}`);
  }
};

copyIfExists(path.join(root, ".next", "static"), path.join(root, ".next", "standalone", ".next", "static"));
copyIfExists(path.join(root, "public"), path.join(root, ".next", "standalone", "public"));
