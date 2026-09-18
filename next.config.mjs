/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained server bundle for the Docker fallback image.
  output: "standalone",

  // @free-ai-gateway/core's ProviderLoader/Registry locate their own files
  // (provider adapter classes, providers.json, providers.schema.json) at
  // runtime via `__dirname`-relative fs calls with a *dynamic* filename
  // argument. If webpack inlines the package into our route bundle,
  // `__dirname` ends up pointing at *our* .next/server/app/api directory
  // instead of the package's real node_modules location, and both the
  // adapter autoloader and the config loader break (confirmed locally: see
  // the "ProviderLoader autoload"/"providers.json could not be located"
  // errors this produced before this line was added). Keeping the package
  // external stops webpack from inlining it, so its own __dirname-relative
  // lookups keep working exactly as they do unbundled.
  serverExternalPackages: ["@free-ai-gateway/core"],

  // Belt-and-suspenders: even external, Vercel's build-time file tracer
  // (@vercel/nft) can't statically follow the *dynamic* fs.existsSync
  // filename argument above, so it won't know to copy providers.json /
  // providers.schema.json into the deployed function's filesystem on its
  // own. This forces them in explicitly.
  outputFileTracingIncludes: {
    "/optimize-energy": ["./node_modules/@free-ai-gateway/core/**/*"],
    "/api/optimize-energy": ["./node_modules/@free-ai-gateway/core/**/*"],
  },
};

export default nextConfig;
