"use client";

import React, { useState, useEffect } from "react";

const SAMPLE_PAYLOAD = {
  scenario_id: "GRID-101",
  operator_notes: [
    "Solar output will drop to about 20% from 1 PM to 3 PM.",
    "Do not charge the battery between 2 PM and 4 PM."
  ],
  hours: [
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
    { hour: 23, demand_kwh: 120, solar_kwh: 0, tariff_bdt_per_kwh: 7 }
  ],
  battery: {
    capacity_kwh: 500,
    initial_energy_kwh: 200,
    minimum_energy_kwh: 50,
    max_charge_kwh_per_hour: 100,
    max_discharge_kwh_per_hour: 100
  }
};

export default function HomePage() {
  const [healthStatus, setHealthStatus] = useState<string>("Checking...");
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<any>(null);
  const [notesInput, setNotesInput] = useState<string>(
    SAMPLE_PAYLOAD.operator_notes.join("\n")
  );

  useEffect(() => {
    fetch("/health")
      .then((res) => res.json())
      .then((data) => setHealthStatus(data.status === "ok" ? "Operational" : "Degraded"))
      .catch(() => setHealthStatus("Offline / Unreachable"));
  }, []);

  const runOptimization = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const notes = notesInput
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      const payload = {
        ...SAMPLE_PAYLOAD,
        operator_notes: notes.length > 0 ? notes : SAMPLE_PAYLOAD.operator_notes,
      };

      const res = await fetch("/optimize-energy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err: any) {
      setResponse({ error: err.message || "Failed to execute optimization." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 80px" }}>
      {/* Header */}
      <header style={{ marginBottom: 40, borderBottom: "1px solid #1e293b", paddingBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 32 }}>⚡</span>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: "linear-gradient(90deg, #38bdf8, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                GridWise LLM
              </h1>
              <span style={{ padding: "4px 10px", borderRadius: 9999, fontSize: 12, fontWeight: 600, backgroundColor: "#1e293b", color: "#94a3b8" }}>
                BUP CSE Fest 2026
              </span>
            </div>
            <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 15 }}>
              Smart Campus 24-Hour Energy Scheduling & Linear Program Optimizer by <strong>Team Metavis</strong>
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 9999, backgroundColor: "#0f172a", border: "1px solid #1e293b" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: healthStatus === "Operational" ? "#22c55e" : "#f59e0b", display: "inline-block" }}></span>
            <span style={{ fontSize: 13, fontWeight: 600, color: healthStatus === "Operational" ? "#4ade80" : "#fbbf24" }}>
              Status: {healthStatus}
            </span>
          </div>
        </div>
      </header>

      {/* API Endpoints Cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 40 }}>
        <div style={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ backgroundColor: "#0284c7", color: "#fff", padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>GET</span>
            <code style={{ color: "#38bdf8", fontWeight: 700, fontSize: 14 }}>/health</code>
          </div>
          <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: 13 }}>
            Liveness check mandated by hackathon specs. Returns status code 200 with JSON payload.
          </p>
          <pre style={{ margin: 0, padding: 12, backgroundColor: "#020617", borderRadius: 8, color: "#a5f3fc", fontSize: 12, overflowX: "auto" }}>
            curl https://gridwise.zaber.dev/health
          </pre>
        </div>

        <div style={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ backgroundColor: "#16a34a", color: "#fff", padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>POST</span>
            <code style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>/optimize-energy</code>
          </div>
          <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: 13 }}>
            Primary optimization engine. Interprets operator notes with LLM, runs LP simplex, and validates replay.
          </p>
          <pre style={{ margin: 0, padding: 12, backgroundColor: "#020617", borderRadius: 8, color: "#bbf7d0", fontSize: 12, overflowX: "auto" }}>
            curl -X POST https://gridwise.zaber.dev/optimize-energy ...
          </pre>
        </div>
      </section>

      {/* Interactive Optimization Console */}
      <section style={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: 28, marginBottom: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Interactive Live Scenario Tester</h2>
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 14 }}>
              Test the live endpoint with real operator notes and a 24-hour campus energy profile.
            </p>
          </div>

          <button
            onClick={runOptimization}
            disabled={loading}
            style={{
              backgroundColor: loading ? "#334155" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {loading ? "Optimizing with LLM..." : "Run Live Optimization 🚀"}
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#cbd5e1", marginBottom: 8 }}>
            Operator Notes (one directive per line):
          </label>
          <textarea
            rows={3}
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              backgroundColor: "#020617",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: 12,
              color: "#f8fafc",
              fontSize: 14,
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
        </div>

        {/* Results view */}
        {response && (
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 20 }}>
            {response.error ? (
              <div style={{ backgroundColor: "#450a0a", border: "1px solid #991b1b", borderRadius: 8, padding: 16, color: "#fca5a5", fontSize: 14 }}>
                <strong>Error:</strong> {response.error}
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#38bdf8", margin: "0 0 16px" }}>
                  Optimization Result ({response.scenario_id})
                </h3>

                {/* KPI metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
                  <div style={{ backgroundColor: "#020617", padding: 16, borderRadius: 8, border: "1px solid #1e293b" }}>
                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>TOTAL GRID IMPORT</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", marginTop: 4 }}>
                      {response.total_grid_kwh?.toLocaleString()} <span style={{ fontSize: 14, color: "#94a3b8" }}>kWh</span>
                    </div>
                  </div>
                  <div style={{ backgroundColor: "#020617", padding: 16, borderRadius: 8, border: "1px solid #1e293b" }}>
                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>TOTAL ELECTRICITY COST</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#4ade80", marginTop: 4 }}>
                      {response.total_cost_bdt?.toLocaleString()} <span style={{ fontSize: 14, color: "#94a3b8" }}>BDT</span>
                    </div>
                  </div>
                  <div style={{ backgroundColor: "#020617", padding: 16, borderRadius: 8, border: "1px solid #1e293b" }}>
                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>PEAK HOURLY GRID</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#fb923c", marginTop: 4 }}>
                      {response.peak_grid_kwh?.toLocaleString()} <span style={{ fontSize: 14, color: "#94a3b8" }}>kWh</span>
                    </div>
                  </div>
                </div>

                {/* Plan Summary */}
                <div style={{ backgroundColor: "#020617", padding: 16, borderRadius: 8, border: "1px solid #1e293b", marginBottom: 20 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>PLAN STRATEGY SUMMARY</div>
                  <p style={{ margin: 0, fontSize: 14, color: "#e2e8f0", lineHeight: 1.5 }}>
                    {response.plan_summary}
                  </p>
                </div>

                {/* Directive interpretations */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>LLM DIRECTIVE INTERPRETATION</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {response.directive_interpretation?.map((d: any, idx: number) => (
                      <div key={idx} style={{ backgroundColor: "#020617", border: "1px solid #1e293b", borderRadius: 8, padding: 12, fontSize: 13 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ backgroundColor: d.applies ? "#15803d" : "#475569", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                            {d.directive_type}
                          </span>
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>Note #{d.note_index}</span>
                        </div>
                        <div style={{ color: "#cbd5e1", marginTop: 4 }}>{d.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 24-hour table */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "right" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#020617", color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                        <th style={{ padding: "8px 12px", textAlign: "left" }}>Hour</th>
                        <th style={{ padding: "8px 12px" }}>Grid (kWh)</th>
                        <th style={{ padding: "8px 12px" }}>Solar Used (kWh)</th>
                        <th style={{ padding: "8px 12px" }}>Battery Action</th>
                        <th style={{ padding: "8px 12px" }}>Battery kWh</th>
                        <th style={{ padding: "8px 12px" }}>SOC (kWh)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {response.hourly_plan?.map((h: any) => (
                        <tr key={h.hour} style={{ borderBottom: "1px solid #1e293b" }}>
                          <td style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#94a3b8" }}>{h.hour}:00</td>
                          <td style={{ padding: "8px 12px", color: "#f8fafc", fontWeight: 600 }}>{h.grid_kwh}</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>{h.solar_used_kwh}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              backgroundColor: h.battery_action === "charge" ? "#065f46" : h.battery_action === "discharge" ? "#7c2d12" : "#1e293b",
                              color: h.battery_action === "charge" ? "#6ee7b7" : h.battery_action === "discharge" ? "#fdba74" : "#94a3b8"
                            }}>
                              {h.battery_action.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", color: "#e2e8f0" }}>{h.battery_kwh}</td>
                          <td style={{ padding: "8px 12px", color: "#a78bfa", fontWeight: 600 }}>{h.battery_energy_after_kwh}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #1e293b", paddingTop: 24, textAlign: "center", color: "#64748b", fontSize: 13 }}>
        <p style={{ margin: "0 0 8px" }}>
          Developed with pride by <strong>Team Metavis</strong> (Md. Mahedi Zaman Zaber, MD Asadullah Shibli, Al Shahariar Arafat Shawon).
        </p>
        <p style={{ margin: 0 }}>
          Live API Deployment: <a href="https://gridwise.zaber.dev" style={{ color: "#38bdf8", textDecoration: "none" }}>gridwise.zaber.dev</a> | GitHub: <a href="https://github.com/Team-METAVIS/gridwise-llm" style={{ color: "#38bdf8", textDecoration: "none" }}>Team-METAVIS/gridwise-llm</a>
        </p>
      </footer>
    </main>
  );
}
