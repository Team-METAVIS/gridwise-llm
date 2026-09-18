/**
 * GridWise LLM - Centralized Constants
 * BUP CSE Fest 2026 Hackathon (Team Metavis)
 *
 * Canonical constants derived from:
 * - Preliminary Problem Statement (§04, §06, §07, §09, §11)
 * - Participant Guide & Evaluation Rubric (§08)
 */

/** Problem Statement §04: The six canonical directive types. */
export const DIRECTIVE_TYPES = [
  "solar_reduction",
  "minimum_battery_reserve",
  "no_charge_window",
  "no_discharge_window",
  "max_grid_window",
  "no_op",
] as const;

export type DirectiveType = (typeof DIRECTIVE_TYPES)[number];

/** Problem Statement §07: Scheduling horizon length in hours (0 through 23). */
export const SCHEDULE_HOURS = 24;
export const HOURS = SCHEDULE_HOURS;

/** Problem Statement §11.5 & Participant Guide §08: Official judge numerical tolerance. */
export const NUMERIC_TOLERANCE = 0.01;
export const REPLAY_TOLERANCE = NUMERIC_TOLERANCE;
export const TOLERANCE = NUMERIC_TOLERANCE;

/** Optimization solver numerical epsilon for non-negativity and churn filtering. */
export const OPTIMIZER_EPSILON = 1e-6;
export const EPS = OPTIMIZER_EPSILON;

/** Tiny regularization cost (BDT/kWh) on battery movement to prevent simultaneous charge/discharge and pointless cycling. */
export const BATTERY_CYCLING_PENALTY = 0.0001;

/** Problem Statement §06.1: Service timeout ceiling in seconds. */
export const MAX_REQUEST_DURATION_SECONDS = 30;

/** Default per-provider LLM request timeout (ms), safely within 30s budget. */
export const DEFAULT_LLM_TIMEOUT_MS = 12000;

/** Default provider priority for @free-ai-gateway/core. */
export const DEFAULT_PROVIDER_PRIORITY = [
  "openai",
  "google_ai_studio",
  "groq",
  "cohere",
] as const;

/** Verified live models for Groq direct-fetch rotation (verified HTTP 200). */
export const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "groq/compound",
  "groq/compound-mini",
];

/** Verified live models for Google Gemini direct-fetch rotation (verified HTTP 200). */
export const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
];

/** Default model candidate pool for OpenAI / OpenAI-compatible direct-fetch. */
export const OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-3.5-turbo",
];
