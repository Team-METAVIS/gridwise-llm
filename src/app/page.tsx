"use client";

import React, { useState, useEffect } from "react";

interface HourEntry {
  hour: number;
  demand_kwh: number;
  solar_kwh: number;
  tariff_bdt_per_kwh: number;
}

interface Battery {
  capacity_kwh: number;
  initial_energy_kwh: number;
  minimum_energy_kwh: number;
  max_charge_kwh_per_hour: number;
  max_discharge_kwh_per_hour: number;
}

interface ScenarioPayload {
  scenario_id: string;
  operator_notes: string[];
  battery: Battery;
  hours: HourEntry[];
}

const DEFAULT_HOURS: HourEntry[] = [
  { hour: 0, demand_kwh: 180, solar_kwh: 0, tariff_bdt_per_kwh: 7 },
  { hour: 1, demand_kwh: 170, solar_kwh: 0, tariff_bdt_per_kwh: 7 },
  { hour: 2, demand_kwh: 160, solar_kwh: 0, tariff_bdt_per_kwh: 6 },
  { hour: 3, demand_kwh: 160, solar_kwh: 0, tariff_bdt_per_kwh: 6 },
  { hour: 4, demand_kwh: 165, solar_kwh: 0, tariff_bdt_per_kwh: 6 },
  { hour: 5, demand_kwh: 175, solar_kwh: 5, tariff_bdt_per_kwh: 7 },
  { hour: 6, demand_kwh: 185, solar_kwh: 20, tariff_bdt_per_kwh: 9 },
  { hour: 7, demand_kwh: 195, solar_kwh: 45, tariff_bdt_per_kwh: 11 },
  { hour: 8, demand_kwh: 200, solar_kwh: 80, tariff_bdt_per_kwh: 13 },
  { hour: 9, demand_kwh: 205, solar_kwh: 120, tariff_bdt_per_kwh: 15 },
  { hour: 10, demand_kwh: 210, solar_kwh: 150, tariff_bdt_per_kwh: 16 },
  { hour: 11, demand_kwh: 210, solar_kwh: 170, tariff_bdt_per_kwh: 16 },
  { hour: 12, demand_kwh: 205, solar_kwh: 180, tariff_bdt_per_kwh: 15 },
  { hour: 13, demand_kwh: 200, solar_kwh: 170, tariff_bdt_per_kwh: 14 },
  { hour: 14, demand_kwh: 195, solar_kwh: 140, tariff_bdt_per_kwh: 13 },
  { hour: 15, demand_kwh: 195, solar_kwh: 95, tariff_bdt_per_kwh: 14 },
  { hour: 16, demand_kwh: 200, solar_kwh: 50, tariff_bdt_per_kwh: 18 },
  { hour: 17, demand_kwh: 215, solar_kwh: 15, tariff_bdt_per_kwh: 22 },
  { hour: 18, demand_kwh: 230, solar_kwh: 0, tariff_bdt_per_kwh: 28 },
  { hour: 19, demand_kwh: 235, solar_kwh: 0, tariff_bdt_per_kwh: 30 },
  { hour: 20, demand_kwh: 220, solar_kwh: 0, tariff_bdt_per_kwh: 26 },
  { hour: 21, demand_kwh: 195, solar_kwh: 0, tariff_bdt_per_kwh: 18 },
  { hour: 22, demand_kwh: 150, solar_kwh: 0, tariff_bdt_per_kwh: 10 },
  { hour: 23, demand_kwh: 120, solar_kwh: 0, tariff_bdt_per_kwh: 7 },
];

const PRESETS: Record<string, { label: string; description: string; payload: ScenarioPayload }> = {
  sample1: {
    label: "Case 1: Solar Curtailment + No-Charge",
    description: "Drop solar to 20% between 1 PM and 3 PM; restrict charging between 2 PM and 4 PM.",
    payload: {
      scenario_id: "GRID-101",
      operator_notes: [
        "Solar output will drop to about 20% from 1 PM to 3 PM.",
        "Do not charge the battery between 2 PM and 4 PM."
      ],
      battery: {
        capacity_kwh: 500,
        initial_energy_kwh: 200,
        minimum_energy_kwh: 50,
        max_charge_kwh_per_hour: 100,
        max_discharge_kwh_per_hour: 100
      },
      hours: DEFAULT_HOURS,
    },
  },
  sample2: {
    label: "Case 2: Maintenance + Distractor Note",
    description: "Solar cut to half 11 AM - 2 PM; distractor note about library closing is safely ignored.",
    payload: {
      scenario_id: "GRID-102",
      operator_notes: [
        "Roof maintenance will cut solar generation to half from 11 AM to 2 PM.",
        "The campus library will close early tonight at 8 PM."
      ],
      battery: {
        capacity_kwh: 400,
        initial_energy_kwh: 150,
        minimum_energy_kwh: 40,
        max_charge_kwh_per_hour: 80,
        max_discharge_kwh_per_hour: 80
      },
      hours: DEFAULT_HOURS,
    },
  },
  sample3: {
    label: "Case 3: Relative 50% Reserve",
    description: "Enforce 50% capacity stored (150 kWh) 6 PM - 9 PM; no discharge 8 AM - 11 AM.",
    payload: {
      scenario_id: "GRID-103",
      operator_notes: [
        "Keep at least 50% capacity stored between 6 PM and 9 PM for evening lab backup.",
        "Do not discharge the battery between 8 AM and 11 AM."
      ],
      battery: {
        capacity_kwh: 300,
        initial_energy_kwh: 120,
        minimum_energy_kwh: 30,
        max_charge_kwh_per_hour: 60,
        max_discharge_kwh_per_hour: 60
      },
      hours: DEFAULT_HOURS,
    },
  },
  sample4: {
    label: "Case 4: Peak Grid Cap (120 kWh)",
    description: "Grid capacity cap of 120 kWh between 6 PM and 9 PM during peak tariff hours.",
    payload: {
      scenario_id: "GRID-104",
      operator_notes: [
        "Cap grid imports at 120 kWh between 6 PM and 9 PM due to feeder line maintenance."
      ],
      battery: {
        capacity_kwh: 500,
        initial_energy_kwh: 250,
        minimum_energy_kwh: 50,
        max_charge_kwh_per_hour: 120,
        max_discharge_kwh_per_hour: 120
      },
      hours: DEFAULT_HOURS,
    },
  },
};

export default function HomePage() {
  const [selectedPreset, setSelectedPreset] = useState<string>("sample1");
  const [scenarioId, setScenarioId] = useState<string>(PRESETS.sample1!.payload.scenario_id);
  const [battery, setBattery] = useState<Battery>(PRESETS.sample1!.payload.battery);
  const [notesText, setNotesText] = useState<string>(
    PRESETS.sample1!.payload.operator_notes.join("\n")
  );
  const [hours, setHours] = useState<HourEntry[]>(DEFAULT_HOURS);
  const [showHoursInspector, setShowHoursInspector] = useState<boolean>(false);

  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [rawJsonInput, setRawJsonInput] = useState<string>(
    JSON.stringify(PRESETS.sample1!.payload, null, 2)
  );

  const [healthStatus, setHealthStatus] = useState<string>("Checking...");
  const [loading, setLoading] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [lastSubmittedPayload, setLastSubmittedPayload] = useState<ScenarioPayload | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [resultsTab, setResultsTab] = useState<"visual" | "json">("visual");
  const [currentOrigin, setCurrentOrigin] = useState<string>("https://gridwise.zaber.dev");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      setCurrentOrigin(window.location.origin);
    }
    fetch("/health")
      .then((res) => res.json())
      .then((data) => setHealthStatus(data.status === "ok" ? "Operational (200 OK)" : "Degraded"))
      .catch(() => setHealthStatus("Offline"));
  }, []);

  const handleSelectPreset = (key: string) => {
    setSelectedPreset(key);
    const p = PRESETS[key]!.payload;
    setScenarioId(p.scenario_id);
    setBattery(p.battery);
    setNotesText(p.operator_notes.join("\n"));
    setHours(p.hours);
    setRawJsonInput(JSON.stringify(p, null, 2));
    setResponse(null);
  };

  const handleToggleRawJson = (toRaw: boolean) => {
    if (toRaw) {
      // Sync form into raw JSON
      const notes = notesText
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      const currentPayload: ScenarioPayload = {
        scenario_id: scenarioId.trim() || "GRID-101",
        operator_notes: notes.length > 0 ? notes : ["No operational notes provided."],
        battery,
        hours,
      };
      setRawJsonInput(JSON.stringify(currentPayload, null, 2));
      setShowRawJson(true);
    } else {
      // Parse raw JSON back into form fields
      try {
        const parsed = JSON.parse(rawJsonInput);
        if (parsed.scenario_id) setScenarioId(parsed.scenario_id);
        if (parsed.battery) setBattery(parsed.battery);
        if (Array.isArray(parsed.operator_notes)) setNotesText(parsed.operator_notes.join("\n"));
        if (Array.isArray(parsed.hours)) setHours(parsed.hours);
        setShowRawJson(false);
      } catch (err) {
        alert("Invalid JSON format. Please fix JSON syntax before switching to Form mode.");
      }
    }
  };

  const runOptimization = async () => {
    setLoading(true);
    setResponse(null);
    const startTime = performance.now();

    try {
      let finalPayload: ScenarioPayload;
      if (showRawJson) {
        finalPayload = JSON.parse(rawJsonInput);
      } else {
        const notes = notesText
          .split("\n")
          .map((n) => n.trim())
          .filter((n) => n.length > 0);
        finalPayload = {
          scenario_id: scenarioId.trim() || "GRID-CUSTOM",
          operator_notes: notes.length > 0 ? notes : ["No operational notes provided."],
          battery,
          hours,
        };
      }

      setLastSubmittedPayload(finalPayload);

      const res = await fetch("/optimize-energy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload),
      });
      const data = await res.json();
      setLatencyMs(Math.round(performance.now() - startTime));
      setResponse(data);
    } catch (err: any) {
      setLatencyMs(Math.round(performance.now() - startTime));
      setResponse({ error: err.message || "Failed to execute optimization request." });
    } finally {
      setLoading(false);
    }
  };

  const copyResponseJson = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", color: "#0f172a" }}>
      {/* Top Navbar */}
      <nav style={{ backgroundColor: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "14px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>⚡</span>
            <div>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
                GridWise LLM
              </span>
              <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", backgroundColor: "#eef2ff", color: "#4338ca", borderRadius: 9999, fontWeight: 600 }}>
                Team Metavis
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: healthStatus.includes("Operational") ? "#16a34a" : "#ca8a04", display: "inline-block" }}></span>
              <span>Health: <strong>{healthStatus}</strong></span>
            </div>
            <a
              href="https://github.com/Team-METAVIS/gridwise-llm"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", textDecoration: "none", padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: 6, backgroundColor: "#ffffff" }}
            >
              GitHub Repo →
            </a>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 80px" }}>
        {/* Header Intro */}
        <section style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.03em" }}>
            Campus Energy Optimization & Directive Interpreter
          </h1>
          <p style={{ fontSize: 14, color: "#475569", margin: 0, maxWidth: 840, lineHeight: 1.6 }}>
            Official submission for the <strong>BUP CSE Fest 2026 Hackathon</strong> (Online Preliminary Round). 
            Our architecture combines multi-provider generative LLMs for natural language directive interpretation, deterministic guardrails, regularized simplex linear programming, and physical replay validation.
          </p>
        </section>

        {/* Canonical Endpoints Cards */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 28 }}>
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, backgroundColor: "#e0f2fe", color: "#0369a1", padding: "2px 6px", borderRadius: 4 }}>GET</span>
              <code style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>/health</code>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px" }}>Mandatory judge health probe returning HTTP 200.</p>
            <code style={{ fontSize: 11, color: "#0f172a", backgroundColor: "#f1f5f9", padding: "4px 8px", borderRadius: 4, display: "block" }}>
              curl {currentOrigin}/health
            </code>
          </div>

          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, backgroundColor: "#dcfce7", color: "#15803d", padding: "2px 6px", borderRadius: 4 }}>POST</span>
              <code style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>/optimize-energy</code>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px" }}>Primary optimizer endpoint taking 24h data + operator notes.</p>
            <code style={{ fontSize: 11, color: "#0f172a", backgroundColor: "#f1f5f9", padding: "4px 8px", borderRadius: 4, display: "block" }}>
              curl -X POST {currentOrigin}/optimize-energy -d @scenario.json
            </code>
          </div>
        </section>

        {/* Live Interactive Tester */}
        <section style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: 32 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18, borderBottom: "1px solid #f1f5f9", paddingBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>
                Live Scenario Optimization Tester
              </h2>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                Select a public competition scenario or customize battery specs, notes, and demand values.
              </p>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(PRESETS).map(([key, item]) => (
                <button
                  key={key}
                  onClick={() => handleSelectPreset(key)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    border: selectedPreset === key ? "1px solid #2563eb" : "1px solid #cbd5e1",
                    backgroundColor: selectedPreset === key ? "#eff6ff" : "#ffffff",
                    color: selectedPreset === key ? "#1d4ed8" : "#475569",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title={item.description}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form Mode vs Raw JSON toggle */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "#475569" }}>
              Mode: <strong>{showRawJson ? "Raw JSON Editor" : "Interactive Form Controls"}</strong>
            </div>
            <button
              onClick={() => handleToggleRawJson(!showRawJson)}
              style={{
                fontSize: 12,
                color: "#2563eb",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              {showRawJson ? "Switch to Interactive Form" : "Switch to Raw JSON Editor"}
            </button>
          </div>

          {/* Editor Body */}
          {showRawJson ? (
            <div style={{ marginBottom: 18 }}>
              <textarea
                rows={14}
                value={rawJsonInput}
                onChange={(e) => setRawJsonInput(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 12,
                  padding: 12,
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  backgroundColor: "#f8fafc",
                  color: "#0f172a",
                  lineHeight: 1.4,
                }}
              />
            </div>
          ) : (
            <div style={{ marginBottom: 18 }}>
              {/* Scenario ID & Notes */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                    Scenario ID:
                  </label>
                  <input
                    type="text"
                    value={scenarioId}
                    onChange={(e) => setScenarioId(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 12px",
                      fontSize: 13,
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      backgroundColor: "#ffffff",
                      color: "#0f172a",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                    Preset Context:
                  </label>
                  <div style={{ padding: "8px 12px", fontSize: 12, color: "#64748b", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                    {PRESETS[selectedPreset]?.description || "Custom configuration"}
                  </div>
                </div>
              </div>

              {/* Operator Notes textarea */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                  Operator Notes (natural-language instructions, one per line):
                </label>
                <textarea
                  rows={3}
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="e.g. Roof maintenance will cut solar generation to half from 11 AM to 2 PM."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: 10,
                    fontSize: 13,
                    fontFamily: "inherit",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Battery parameters editable inputs */}
              <div style={{ marginBottom: 16, backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>
                  BATTERY SPECIFICATIONS & PHYSICAL LIMITS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4 }}>Capacity (kWh)</label>
                    <input
                      type="number"
                      value={battery.capacity_kwh}
                      onChange={(e) => setBattery({ ...battery, capacity_kwh: Number(e.target.value) })}
                      style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 4, backgroundColor: "#ffffff" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4 }}>Initial Energy (kWh)</label>
                    <input
                      type="number"
                      value={battery.initial_energy_kwh}
                      onChange={(e) => setBattery({ ...battery, initial_energy_kwh: Number(e.target.value) })}
                      style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 4, backgroundColor: "#ffffff" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4 }}>Min Reserve (kWh)</label>
                    <input
                      type="number"
                      value={battery.minimum_energy_kwh}
                      onChange={(e) => setBattery({ ...battery, minimum_energy_kwh: Number(e.target.value) })}
                      style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 4, backgroundColor: "#ffffff" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4 }}>Max Charge (kWh/h)</label>
                    <input
                      type="number"
                      value={battery.max_charge_kwh_per_hour}
                      onChange={(e) => setBattery({ ...battery, max_charge_kwh_per_hour: Number(e.target.value) })}
                      style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 4, backgroundColor: "#ffffff" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4 }}>Max Discharge (kWh/h)</label>
                    <input
                      type="number"
                      value={battery.max_discharge_kwh_per_hour}
                      onChange={(e) => setBattery({ ...battery, max_discharge_kwh_per_hour: Number(e.target.value) })}
                      style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 4, backgroundColor: "#ffffff" }}
                    />
                  </div>
                </div>
              </div>

              {/* Collapsible 24-Hour Input Inspector */}
              <div>
                <button
                  onClick={() => setShowHoursInspector(!showHoursInspector)}
                  style={{
                    fontSize: 12,
                    color: "#475569",
                    background: "none",
                    border: "1px solid #cbd5e1",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: "pointer",
                    backgroundColor: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{showHoursInspector ? "▼ Hide" : "▶ Inspect"} 24-Hour Input Demand & Tariffs</span>
                </button>

                {showHoursInspector && (
                  <div style={{ marginTop: 10, overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, textAlign: "right" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f8fafc", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={{ padding: "6px 8px", textAlign: "left" }}>Hour</th>
                          <th style={{ padding: "6px 8px" }}>Demand (kWh)</th>
                          <th style={{ padding: "6px 8px" }}>Solar Gen (kWh)</th>
                          <th style={{ padding: "6px 8px" }}>Tariff (BDT/kWh)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hours.map((h) => (
                          <tr key={h.hour} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "4px 8px", textAlign: "left", color: "#64748b" }}>{h.hour}:00</td>
                            <td style={{ padding: "4px 8px", color: "#0f172a" }}>{h.demand_kwh}</td>
                            <td style={{ padding: "4px 8px", color: "#0284c7" }}>{h.solar_kwh}</td>
                            <td style={{ padding: "4px 8px", color: "#16a34a", fontWeight: 600 }}>{h.tariff_bdt_per_kwh}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Trigger */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingTop: 8 }}>
            <button
              onClick={runOptimization}
              disabled={loading}
              style={{
                backgroundColor: loading ? "#94a3b8" : "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 1px 2px rgba(37,99,235,0.2)",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {loading && <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #ffffff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}></span>}
              {loading ? "Optimizing with AI & Simplex..." : "Execute Optimization Pipeline"}
            </button>

            {latencyMs !== null && (
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Response Time: <strong>{latencyMs} ms</strong>
              </span>
            )}
          </div>

          {/* Results Display */}
          {response && (
            <div style={{ marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
              {response.error ? (
                <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: 14, color: "#991b1b", fontSize: 13 }}>
                  <strong>Error:</strong> {response.error}
                </div>
              ) : (
                <div>
                  {/* Results Top Bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                        Optimization Output — <code>{response.scenario_id}</code>
                      </h3>
                      <span style={{ fontSize: 11, padding: "2px 6px", backgroundColor: "#dcfce7", color: "#15803d", borderRadius: 4, fontWeight: 700 }}>
                        200 OK
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setResultsTab(resultsTab === "visual" ? "json" : "visual")}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontWeight: 600,
                          color: "#475569",
                        }}
                      >
                        {resultsTab === "visual" ? "View Raw JSON" : "View Visual Plan"}
                      </button>

                      <button
                        onClick={copyResponseJson}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          backgroundColor: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        {copySuccess ? "✓ Copied JSON" : "Copy Response JSON"}
                      </button>
                    </div>
                  </div>

                  {resultsTab === "json" ? (
                    <div style={{ backgroundColor: "#0f172a", color: "#f8fafc", borderRadius: 6, padding: 14, overflowX: "auto" }}>
                      <pre style={{ margin: 0, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {JSON.stringify(response, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div>
                      {/* Metric summary cards */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
                        <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Total Grid Import</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                            {response.total_grid_kwh?.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>kWh</span>
                          </div>
                        </div>

                        <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Total Cost</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#15803d", marginTop: 2 }}>
                            {response.total_cost_bdt?.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500, color: "#15803d" }}>BDT</span>
                          </div>
                        </div>

                        <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Peak Hourly Grid</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#b45309", marginTop: 2 }}>
                            {response.peak_grid_kwh?.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>kWh</span>
                          </div>
                        </div>

                        <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Directives Applied</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#4338ca", marginTop: 2 }}>
                            {response.directive_interpretation?.filter((d: any) => d.applies).length} / {response.directive_interpretation?.length}
                          </div>
                        </div>
                      </div>

                      {/* Strategy & Plan Summary */}
                      <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: 12, marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 2 }}>STRATEGY & PLAN SUMMARY</div>
                        <p style={{ margin: 0, fontSize: 13, color: "#14532d", lineHeight: 1.5 }}>
                          {response.plan_summary}
                        </p>
                      </div>

                      {/* Directive Interpretation Cards */}
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                          OPERATOR DIRECTIVES INTERPRETATION ({response.directive_interpretation?.length || 0})
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {response.directive_interpretation?.map((d: any, idx: number) => (
                            <div key={idx} style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: 10, fontSize: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    backgroundColor: d.applies ? "#dbeafe" : "#f1f5f9",
                                    color: d.applies ? "#1e40af" : "#64748b"
                                  }}>
                                    {d.directive_type}
                                  </span>
                                  <span style={{ color: "#64748b", fontSize: 11 }}>Note #{d.note_index}</span>
                                </div>
                                <span style={{
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  backgroundColor: d.applies ? "#dcfce7" : "#fee2e2",
                                  color: d.applies ? "#15803d" : "#991b1b"
                                }}>
                                  {d.applies ? "Applies to Schedule" : "no_op (Ignored)"}
                                </span>
                              </div>
                              <div style={{ color: "#334155", fontSize: 12 }}>{d.explanation}</div>
                              {d.structured_adjustment && (
                                <div style={{ marginTop: 4, backgroundColor: "#f8fafc", padding: "4px 8px", borderRadius: 4, fontSize: 11, color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>
                                  Adjustment: {JSON.stringify(d.structured_adjustment)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 24-Hour Energy Plan Table */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                          24-HOUR OPTIMAL ENERGY PLAN (HOURLY POWER FLOW & STORAGE BALANCE)
                        </div>
                        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "right" }}>
                            <thead>
                              <tr style={{ backgroundColor: "#f8fafc", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                                <th style={{ padding: "8px 10px", textAlign: "left" }}>Hour</th>
                                <th style={{ padding: "8px 10px" }}>Demand</th>
                                <th style={{ padding: "8px 10px" }}>Solar Used</th>
                                <th style={{ padding: "8px 10px" }}>Battery Action</th>
                                <th style={{ padding: "8px 10px" }}>Rate (kWh)</th>
                                <th style={{ padding: "8px 10px" }}>End SOC (kWh)</th>
                                <th style={{ padding: "8px 10px" }}>Grid Import</th>
                                <th style={{ padding: "8px 10px" }}>Tariff</th>
                                <th style={{ padding: "8px 10px" }}>Cost (BDT)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {response.hourly_plan?.map((h: any) => {
                                const inputHour = lastSubmittedPayload?.hours.find((ih) => ih.hour === h.hour);
                                const demand = inputHour?.demand_kwh ?? "-";
                                const tariff = inputHour?.tariff_bdt_per_kwh ?? "-";
                                const cost = typeof tariff === "number" ? Math.round(h.grid_kwh * tariff * 100) / 100 : "-";

                                return (
                                  <tr key={h.hour} style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: h.hour % 2 === 0 ? "#ffffff" : "#fafafa" }}>
                                    <td style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>{h.hour}:00</td>
                                    <td style={{ padding: "6px 10px", color: "#0f172a" }}>{demand}</td>
                                    <td style={{ padding: "6px 10px", color: "#0284c7" }}>{h.solar_used_kwh}</td>
                                    <td style={{ padding: "6px 10px" }}>
                                      <span style={{
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        backgroundColor: h.battery_action === "charge" ? "#dcfce7" : h.battery_action === "discharge" ? "#ffedd5" : "#f1f5f9",
                                        color: h.battery_action === "charge" ? "#166534" : h.battery_action === "discharge" ? "#9a3412" : "#64748b"
                                      }}>
                                        {h.battery_action.toUpperCase()}
                                      </span>
                                    </td>
                                    <td style={{ padding: "6px 10px", color: "#334155" }}>{h.battery_kwh}</td>
                                    <td style={{ padding: "6px 10px", fontWeight: 600, color: "#6d28d9" }}>{h.battery_energy_after_kwh}</td>
                                    <td style={{ padding: "6px 10px", fontWeight: 600, color: "#0f172a" }}>{h.grid_kwh}</td>
                                    <td style={{ padding: "6px 10px", color: "#64748b" }}>{tariff}</td>
                                    <td style={{ padding: "6px 10px", fontWeight: 600, color: "#16a34a" }}>{cost}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ backgroundColor: "#f1f5f9", borderTop: "2px solid #cbd5e1", fontWeight: 700, color: "#0f172a" }}>
                                <td style={{ padding: "8px 10px", textAlign: "left" }}>Total / Peak</td>
                                <td style={{ padding: "8px 10px" }}>
                                  {lastSubmittedPayload ? lastSubmittedPayload.hours.reduce((acc, curr) => acc + curr.demand_kwh, 0) : "-"}
                                </td>
                                <td style={{ padding: "8px 10px", color: "#0284c7" }}>
                                  {response.hourly_plan?.reduce((acc: number, curr: any) => acc + curr.solar_used_kwh, 0).toFixed(1)}
                                </td>
                                <td style={{ padding: "8px 10px" }}>-</td>
                                <td style={{ padding: "8px 10px" }}>-</td>
                                <td style={{ padding: "8px 10px", color: "#6d28d9" }}>
                                  End: {response.hourly_plan?.[23]?.battery_energy_after_kwh} kWh
                                </td>
                                <td style={{ padding: "8px 10px", color: "#0f172a" }}>
                                  {response.total_grid_kwh?.toLocaleString()} kWh
                                </td>
                                <td style={{ padding: "8px 10px", color: "#64748b" }}>-</td>
                                <td style={{ padding: "8px 10px", color: "#16a34a" }}>
                                  {response.total_cost_bdt?.toLocaleString()} BDT
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Architectural Guarantees */}
        <section style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 32 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "#0f172a" }}>
            Architectural Guarantees & Solver Safeguards
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
            <div>
              <strong style={{ color: "#0f172a" }}>1. Multi-Tier AI Resilience</strong>
              <p style={{ margin: "3px 0 0" }}>Tier 1 @free-ai-gateway/core with automatic fallback to Tier 2 direct fetch (OpenAI, Groq, Gemini) and Tier 3 emergency heuristic parser.</p>
            </div>
            <div>
              <strong style={{ color: "#0f172a" }}>2. Strict Guardrails</strong>
              <p style={{ margin: "3px 0 0" }}>Enforces integer hours [0, 23], solar factor [0, 1], and battery reserve bounds against physical capacity.</p>
            </div>
            <div>
              <strong style={{ color: "#0f172a" }}>3. Regularized Simplex LP</strong>
              <p style={{ margin: "3px 0 0" }}>Inherent battery cycling penalty prevents simultaneous charging/discharging and useless churn at the linear solver level.</p>
            </div>
            <div>
              <strong style={{ color: "#0f172a" }}>4. Physical Replay Validation</strong>
              <p style={{ margin: "3px 0 0" }}>Recalculates power flow balance and cost against active constraints within canonical 0.01 tolerance before returning 200.</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e2e8f0", paddingTop: 18, textAlign: "center", color: "#64748b", fontSize: 12 }}>
          <p style={{ margin: "0 0 4px" }}>
            Developed by <strong>Team Metavis</strong>: Md. Mahedi Zaman Zaber · MD Asadullah Shibli · Al Shahariar Arafat Shawon
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>
            BUP CSE Fest 2026 Hackathon · In Association with Poridhi
          </p>
        </footer>
      </main>
    </div>
  );
}
