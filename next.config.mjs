/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained server bundle for the Docker fallback image.
  output: "standalone",

  // @free-ai-gateway/core resolves its provider catalog (providers.json /
  // providers.schema.json) from disk at runtime using a *dynamic* filename
  // argument (`path.resolve(__dirname, filename)`), which Vercel's static
  // file tracer cannot follow. Without this, the Registry throws
  // "File providers.json could not be located" in production. See
  // docs/EXECUTION_PLAN.md "LLM Interpretation Design" for the full story.
  outputFileTracingIncludes: {
    "/api/optimize-energy": ["./node_modules/@free-ai-gateway/core/**/*.json"],
  },
};

export default nextConfig;
