# GridWise LLM

LLM-assisted 24-hour campus energy scheduling API for the **BUP CSE Fest 2026 Hackathon — Online Preliminary Round** (GridWise / Smart Campus Energy Optimization Challenge, in association with Poridhi).

One HTTP service that reads a 24-hour demand/solar/tariff scenario plus 1-3 natural-language operator notes, interprets the notes with an LLM, deterministically validates that interpretation, solves a cost-minimizing battery/grid/solar schedule with a linear program, and replays its own answer before responding.

```
Energy Data + Operator Notes → LLM Interpreter → Guardrail Validator → LP Optimizer → Final Validator → API Response
```

## Quick facts

| | |
|---|---|
| Health endpoint | `GET /health` → `{"status":"ok"}` |
| Main endpoint | `POST /optimize-energy` |
| Stack | Next.js 15 (App Router, TypeScript), deployed on Vercel |
| LLM layer | [`@free-ai-gateway/core`](https://github.com/zaber-dev/free-ai-gateway) (20 free-tier providers, env-configurable priority order), with a zero-dependency direct-fetch fallback |
| Optimizer | Linear program via [`javascript-lp-solver`](https://www.npmjs.com/package/javascript-lp-solver) |
| Fallback deployment | Docker (`Dockerfile`, Next.js standalone output) |

## Getting started

```bash
git clone <this-repo-url>
cd gridwise-llm
npm install
cp .env.example .env
```

Edit `.env` and set at least one provider API key (see [Environment variables](#environment-variables) — a single free key, e.g. `GOOGLE_API_KEY` or `GROQ_API_KEY`, is enough to run the whole pipeline for real).

```bash
npm run dev        # http://localhost:3000
```

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}

curl -X POST http://localhost:3000/api/optimize-energy \
  -H "Content-Type: application/json" \
  --data-binary @- <<'EOF'
{
  "scenario_id": "GRID-101",
  "operator_notes": [
    "Solar output will drop to about 20% from 1 PM to 3 PM.",
    "Do not charge the battery between 2 PM and 4 PM."
  ],
  "hours": [
    {"hour":0,"demand_kwh":180,"solar_kwh":0,"tariff_bdt_per_kwh":7},
    {"hour":1,"demand_kwh":170,"solar_kwh":0,"tariff_bdt_per_kwh":7},
    {"hour":2,"demand_kwh":160,"solar_kwh":0,"tariff_bdt_per_kwh":6},
    {"hour":3,"demand_kwh":160,"solar_kwh":0,"tariff_bdt_per_kwh":6},
    {"hour":4,"demand_kwh":165,"solar_kwh":0,"tariff_bdt_per_kwh":6},
    {"hour":5,"demand_kwh":175,"solar_kwh":5,"tariff_bdt_per_kwh":7},
    {"hour":6,"demand_kwh":185,"solar_kwh":20,"tariff_bdt_per_kwh":9},
    {"hour":7,"demand_kwh":195,"solar_kwh":45,"tariff_bdt_per_kwh":11},
    {"hour":8,"demand_kwh":200,"solar_kwh":80,"tariff_bdt_per_kwh":13},
    {"hour":9,"demand_kwh":205,"solar_kwh":120,"tariff_bdt_per_kwh":15},
    {"hour":10,"demand_kwh":210,"solar_kwh":150,"tariff_bdt_per_kwh":16},
    {"hour":11,"demand_kwh":210,"solar_kwh":170,"tariff_bdt_per_kwh":16},
    {"hour":12,"demand_kwh":205,"solar_kwh":180,"tariff_bdt_per_kwh":15},
    {"hour":13,"demand_kwh":200,"solar_kwh":170,"tariff_bdt_per_kwh":14},
    {"hour":14,"demand_kwh":195,"solar_kwh":140,"tariff_bdt_per_kwh":13},
    {"hour":15,"demand_kwh":195,"solar_kwh":95,"tariff_bdt_per_kwh":14},
    {"hour":16,"demand_kwh":200,"solar_kwh":50,"tariff_bdt_per_kwh":18},
    {"hour":17,"demand_kwh":215,"solar_kwh":15,"tariff_bdt_per_kwh":22},
    {"hour":18,"demand_kwh":230,"solar_kwh":0,"tariff_bdt_per_kwh":28},
    {"hour":19,"demand_kwh":235,"solar_kwh":0,"tariff_bdt_per_kwh":30},
    {"hour":20,"demand_kwh":220,"solar_kwh":0,"tariff_bdt_per_kwh":26},
    {"hour":21,"demand_kwh":195,"solar_kwh":0,"tariff_bdt_per_kwh":18},
    {"hour":22,"demand_kwh":150,"solar_kwh":0,"tariff_bdt_per_kwh":10},
    {"hour":23,"demand_kwh":120,"solar_kwh":0,"tariff_bdt_per_kwh":7}
  ],
  "battery": {
    "capacity_kwh": 500,
    "initial_energy_kwh": 200,
    "minimum_energy_kwh": 50,
    "max_charge_kwh_per_hour": 100,
    "max_discharge_kwh_per_hour": 100
  }
}
EOF
```

Run the automated tests (guardrail edge cases, the routing-priority strategy, and the optimizer+replay validator against all 10 organizer-provided public sample cases):

```bash
npm test
npm run typecheck
```

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | no | Local dev/standalone server port (default 3000). |
| `LLM_PROVIDER_PRIORITY` | no | Comma-separated provider ids, left = tried first (e.g. `openai,google_ai_studio,groq,cohere`). Providers left out are still tried, just after the listed ones. |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`, ... | at least one | Provider API keys. Supports OpenAI (and any OpenAI-compatible API), Google Gemini, Groq, Cohere, etc. |
| `OPENAI_BASE_URL` | no | Optional custom base URL for OpenAI-compatible providers (e.g. OpenRouter, DeepSeek, local vLLM/Ollama). Default: `https://api.openai.com/v1`. |
| `OPENAI_MODEL`, `GROQ_MODEL`, `GEMINI_MODEL` | no | Override/pin the model id used by the direct-fetch backend. If unset, the backend automatically rotates across high-capability free/available models per provider with in-call fallback. |
| `LLM_TIMEOUT_MS` | no | Per-provider request timeout (default 12000ms), well inside the 30s per-request budget. |
| `LLM_BACKEND` | no | Options: `free-ai-gateway` (default, multi-provider routing with failover), `direct` (plain-fetch OpenAI/Groq/Gemini), or `openai` (directly target OpenAI / OpenAI-compatible endpoint). |

No secret values are committed anywhere in this repo — only `.env.example` with empty values.


## How operator-note interpretation works

1. **LLM Interpreter** ([`src/lib/llm/gateway.ts`](src/lib/llm/gateway.ts)) sends all of a scenario's operator notes in a single call (system prompt + few-shot examples in [`src/lib/llm/prompt.ts`](src/lib/llm/prompt.ts)), asking for a JSON array of directive candidates. It tries, in order: `@free-ai-gateway/core` (ordered by `LLM_PROVIDER_PRIORITY` via a custom [`PriorityOrderStrategy`](src/lib/llm/priorityStrategy.ts), with the package's own circuit-breaker/quota/failover already trying every configured provider before giving up), then a built-in direct-fetch backend (Groq, then Gemini) if the gateway can't be used or every provider in it fails. This never throws — a total outage degrades to a safe response instead of a crash.
2. **Guardrail Validator** ([`src/lib/guardrails.ts`](src/lib/guardrails.ts)) treats that output as untrusted: it re-checks every note has exactly one entry, only the six documented directive types are accepted, `applies`/`structured_adjustment` match the required shape, hours are normalized to unique/ascending/0-23, and numeric fields are range-checked against the actual battery in the request. Anything that fails becomes a safe `no_op` for that single note — never a guess, never a crash.
3. **LP Optimizer** ([`src/lib/optimizer.ts`](src/lib/optimizer.ts)) builds a linear program (5 continuous variables per hour: grid import, solar used, battery charge, battery discharge, battery state-of-charge) minimizing total grid cost subject to energy balance, effective solar after `solar_reduction`, active reserve floors, zeroed charge/discharge under `no_charge_window`/`no_discharge_window`, `max_grid_window` caps, and end-of-day battery neutrality — solved to a provable optimum with `javascript-lp-solver`.
4. **Final Validator** ([`src/lib/replay.ts`](src/lib/replay.ts)) independently replays the produced `hourly_plan` hour-by-hour against the same trusted directives, exactly the way the judge harness will, and recomputes `total_grid_kwh`/`total_cost_bdt`/`peak_grid_kwh` from the plan itself before it's returned.

## Testing

`npm test` runs three suites:

- `tests/priorityStrategy.test.ts` — the env-driven provider ordering logic.
- `tests/guardrails.test.ts` — malformed/out-of-range/duplicate/unsupported LLM output all degrade to safe `no_op` rather than being applied.
- `tests/publicSamples.test.ts` — runs the optimizer + final replay validator (LLM bypassed, using each sample's own reference `directive_interpretation`) against all 10 cases in `BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json`, asserting the schedule is valid and its cost matches or beats the organizer's reference within tolerance.

## Docker fallback

```bash
docker build -t gridwise-llm .
docker run -p 3000:3000 --env-file .env gridwise-llm
curl http://localhost:3000/api/health
```

> **TODO before submission:** push the built image to Docker Hub/GHCR and record the exact tag/digest + verified `docker run` command here, per the Participant Guide's Docker fallback requirement. Not yet done as of this commit.

## Deployment

Primary judged endpoint is deployed on Vercel (zero-config for this Next.js App Router project — connect the repo, set the environment variables above in the Vercel dashboard, deploy). The Docker image above is the required fallback path if the hosted endpoint is unreachable during judging.

> **TODO before submission:** record the live Vercel base URL here and re-verify `/health` and `/optimize-energy` from outside the dev machine.

## Known limitations & engineering notes

- **`@free-ai-gateway/core` bundling gotcha (found and fixed during build):** the package locates its own provider adapter classes and `providers.json`/`providers.schema.json` catalog at runtime via `__dirname`-relative filesystem lookups. Next.js's webpack bundler was inlining the package into the route bundle, which broke those lookups (`__dirname` ended up pointing at our own `.next/server/...` output instead of the package's real location) — confirmed locally via a production build + request before the fix. Fixed in `next.config.mjs` with `serverExternalPackages: ["@free-ai-gateway/core"]` (keeps it a real unbundled `require()`) plus `outputFileTracingIncludes` (so Vercel's file tracer still ships its on-disk config, since it can't statically follow the dynamic filename argument on its own). Re-verified after the fix: all 20 providers load and correctly fail over on missing keys rather than a missing file.
- **LP charge/discharge normalization:** the linear program has no round-trip efficiency loss term, so simultaneous nonzero charge *and* discharge in the same hour is a mathematically free degree of freedom the solver may pick arbitrarily. The optimizer nets these out into a single `battery_action` post-solve (documented in `src/lib/optimizer.ts`) — the underlying grid/solar/state-of-charge values are unaffected by this, only the reported action/magnitude.
- The direct-fetch fallback backend only supports Groq and Gemini (the two simplest free REST APIs to call without an SDK). It exists purely as a safety net if the gateway package can't be used in a given environment.
- `plan_summary` is deterministic, human-readable text generated from the recomputed totals — not LLM output. The Problem Statement explicitly excludes `plan_summary` from the LLM requirement, and a deterministic summary is both faster and more reliable under the 30s budget.

## Credits & dependencies

- [Next.js](https://nextjs.org/) — API framework and Vercel deployment target.
- [`@free-ai-gateway/core`](https://github.com/zaber-dev/free-ai-gateway) (MIT) — multi-provider free-tier LLM routing, quota tracking, and circuit-breaker resilience.
- [`javascript-lp-solver`](https://www.npmjs.com/package/javascript-lp-solver) — the linear program solver behind the optimizer.
- [`zod`](https://zod.dev/) — request schema validation.
- [Vitest](https://vitest.dev/) — test runner.

## Repository & compliance notes

- Repo policy (Rulebook §4.3): created after question reveal, private during the round, made public after the submission deadline.
- Never commit `.env`, API keys, or tokens (enforced by `.gitignore`); no secrets are baked into the Docker image.
- Only the synthetic scenario data supplied by the harness is used — no live campus/utility/billing/personal data.
- Third-party dependencies and AI coding assistance are credited above per the Rulebook's crediting requirement.

## Document pack

| Document | Purpose |
|---|---|
| [Preliminary Problem Statement](BUP_CSE_FEST_2026_Preliminary_Problem_Statement_GridWise_LLM.pdf) | Canonical spec: scenario, directive types, API schema, guardrails, battery/energy rules. |
| [Participant Guide & Evaluation Rubric](BUP_CSE_FEST_2026_Participant_Guide_&_Evaluation_Rubric_GridWise_LLM.pdf) | Canonical for deployment, repo policy, submission, scoring (100 pts), penalties, tie-breakers. |
| [Public Sample Cases JSON](BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json) | 10 worked examples used by `tests/publicSamples.test.ts`. Not the hidden judge set. |
| [Hackathon Rulebook](CSE_Fest_2026_Hackathon_Rulebook.pdf) | Event-wide rules, including the separate (TBA) Phase 2 on-site finals. |
| [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) | Original architecture/LP-formulation planning notes (see this README + source comments for what was actually built). |

## Scoring at a glance (100 pts, automated)

| # | Category | Points |
|---|---|---|
| 1 | LLM Directive Interpretation | 25 |
| 2 | Directive Application & Constraint Correctness | 25 |
| 3 | Optimization Quality | 10 |
| 4 | API Contract & Schema | 10 |
| 5 | Performance & Reliability | 10 |
| 6 | Deployment & Docker Fallback | 10 |
| 7 | Documentation & Local Reproducibility | 10 |

The 3-minute solution video carries zero base points — it's a tie-breaker only.
