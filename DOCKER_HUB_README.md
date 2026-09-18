# GridWise LLM — Docker Hub Overview

Official Docker Hub container repository for **GridWise LLM** by **Team Metavis** for the **BUP CSE Fest 2026 Hackathon (Online Preliminary Round)**.

---

## Repository Metadata

- **Repository**: `zaberdev/gridwise-llm`
- **Short Description**:
  ```
  LLM-assisted 24h campus energy scheduling & linear programming optimizer for BUP CSE Fest 2026
  ```
- **Categories**:
  - `Machine Learning` / `AI/ML`
  - `Developer Tools`
  - `Internet of Things`
- **Tags**:
  - `latest`
  - `v1.0.0`
- **Live Web App**: [https://gridwise.zaber.dev/](https://gridwise.zaber.dev/)
- **GitHub Repository**: [https://github.com/Team-METAVIS/gridwise-llm](https://github.com/Team-METAVIS/gridwise-llm)

---

## Overview

**GridWise LLM** is an autonomous 24-hour campus energy scheduling service and linear programming optimizer. The system reads 24 hours of campus demand, solar generation forecast, and time-of-use tariffs alongside 1–3 natural-language operator directives, interprets those directives using multi-tiered LLM routing, validates constraint parameters through deterministic guardrails, and computes the mathematically cost-optimal battery charge/discharge schedule using regularized simplex linear programming.

### Key Architectural Highlights
1. **Multi-Tier AI Resilience**:
   - Tier 1: `@free-ai-gateway/core` multi-provider pool.
   - Tier 2: Direct Fetch Engine (Google Gemini, Groq Cloud, OpenAI) with automatic model rotation.
   - Tier 3: Emergency Heuristic Parser (`emergencyParser.ts`) extracting regex and semantic rules.
   - Tier 4: Deterministic safe degrade to `no_op`.
2. **Regularized Simplex LP**:
   - Micro-penalty (`BATTERY_CYCLING_PENALTY = 0.0001` BDT/kWh) breaks simplex basis degeneracy in flat-tariff hours, guaranteeing zero simultaneous charging and discharging at the linear solver level.
3. **Physical Replay Validator**:
   - Replays final power flows against active constraints within canonical `0.01` tolerance.

---

## Quickstart

### 1. Pull Image from Docker Hub

```bash
docker pull zaberdev/gridwise-llm:latest
```

### 2. Configure Environment

Create a local `.env` file with at least one free API key:

```bash
# Pick any free API key (Google AI Studio recommended):
GOOGLE_API_KEY=AIzaSy...

# Optional: Groq Cloud
# GROQ_API_KEY=gsk_...

# Optional: OpenAI or compatible endpoint
# OPENAI_API_KEY=sk-...
```

### 3. Run Container

```bash
docker run -d \
  --name gridwise-service \
  -p 3000:3000 \
  --env-file .env \
  zaberdev/gridwise-llm:latest
```

The service will be live on `http://localhost:3000`.

---

## API Endpoints

### 1. Health Probe (`GET /health`)

```bash
curl http://localhost:3000/health
```

**Response (`200 OK`)**:
```json
{
  "status": "ok"
}
```

### 2. Schedule Optimizer (`POST /optimize-energy`)

```bash
curl -X POST http://localhost:3000/optimize-energy \
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

---

## Security & Container Design

- **Alpine Linux base (`node:20-alpine`)**: Minimal attack surface, total compressed image size ~65 MB.
- **Unprivileged execution**: Runs under non-root system user `gridwise` (UID 1001).
- **Zero secrets stored**: Secrets, `.env`, and git history are excluded via `.dockerignore`.

---

## Team Metavis

- **Md. Mahedi Zaman Zaber** ([@zaber-dev](https://github.com/zaber-dev))
- **MD Asadullah Shibli** ([@AsadShibli](https://github.com/AsadShibli))
- **Al Shahariar Arafat Shawon** ([@shahariarshawon](https://github.com/shahariarshawon))

*BUP CSE Fest 2026 Hackathon · In Association with Poridhi*
