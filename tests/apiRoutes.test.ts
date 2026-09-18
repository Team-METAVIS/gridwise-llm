import { describe, expect, it, vi } from "vitest";

import { GET as healthGet } from "@/app/health/route";
import { GET as apiHealthGet } from "@/app/api/health/route";
import { POST as optimizePost } from "@/app/optimize-energy/route";
import { POST as apiOptimizePost } from "@/app/api/optimize-energy/route";
import type { HourEntry } from "@/types/gridwise";

import samplesData from "../BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json";

const sampleCase = (samplesData as any).cases[0];

describe("API Route Handlers", () => {
  it("GET /health returns 200 with { status: 'ok' }", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("GET /api/health (alias) returns 200 with { status: 'ok' }", async () => {
    const res = await apiHealthGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("POST /optimize-energy returns 400 for non-JSON body", async () => {
    const req = new Request("http://localhost/optimize-energy", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await optimizePost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid JSON/i);
  });

  it("POST /optimize-energy returns 400 when initial_energy_kwh < minimum_energy_kwh", async () => {
    const invalidInput = {
      ...sampleCase.input,
      battery: {
        ...sampleCase.input.battery,
        initial_energy_kwh: 10,
        minimum_energy_kwh: 50,
      },
    };
    const req = new Request("http://localhost/optimize-energy", {
      method: "POST",
      body: JSON.stringify(invalidInput),
      headers: { "Content-Type": "application/json" },
    });
    const res = await optimizePost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("initial_energy_kwh");
  });

  it("POST /optimize-energy returns 400 for empty or whitespace operator note", async () => {
    const invalidInput = {
      ...sampleCase.input,
      operator_notes: ["   "],
    };
    const req = new Request("http://localhost/optimize-energy", {
      method: "POST",
      body: JSON.stringify(invalidInput),
      headers: { "Content-Type": "application/json" },
    });
    const res = await optimizePost(req);
    expect(res.status).toBe(400);
  });

  it("POST /optimize-energy returns 200 and matches response schema for public sample case", async () => {
    const req = new Request("http://localhost/optimize-energy", {
      method: "POST",
      body: JSON.stringify(sampleCase.input),
      headers: { "Content-Type": "application/json" },
    });
    const res = await optimizePost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scenario_id).toBe(sampleCase.input.scenario_id);
    expect(body.directive_interpretation).toHaveLength(sampleCase.input.operator_notes.length);
    expect(body.hourly_plan).toHaveLength(24);
    expect(body.total_grid_kwh).toBeGreaterThan(0);
    expect(body.total_cost_bdt).toBeGreaterThan(0);
    expect(body.peak_grid_kwh).toBeGreaterThan(0);
    expect(body.plan_summary).toBeTruthy();
  }, 15000);

  it("POST /api/optimize-energy alias handles request identically", async () => {
    const req = new Request("http://localhost/api/optimize-energy", {
      method: "POST",
      body: JSON.stringify(sampleCase.input),
      headers: { "Content-Type": "application/json" },
    });
    const res = await apiOptimizePost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scenario_id).toBe(sampleCase.input.scenario_id);
    expect(body.hourly_plan).toHaveLength(24);
  }, 15000);
});
