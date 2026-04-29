import { describe, it, expect, vi, afterEach } from "vitest";
import { getTrialState, PLANS, TRIAL_DAYS } from "@/lib/billing";

describe("getTrialState", () => {
  afterEach(() => vi.useRealTimers());

  it("sem trial_ends_at retorna isTrial=false", () => {
    const state = getTrialState(null, "active");
    expect(state.isTrial).toBe(false);
    expect(state.daysLeft).toBeNull();
    expect(state.expired).toBe(false);
  });

  it("billing_status != trialing retorna isTrial=false mesmo com data", () => {
    const future = new Date(Date.now() + 7 * 86400_000).toISOString();
    expect(getTrialState(future, "active").isTrial).toBe(false);
    expect(getTrialState(future, "past_due").isTrial).toBe(false);
  });

  it("trialing com prazo no futuro retorna dias restantes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T10:00:00Z"));
    const ends = "2026-05-04T10:00:00Z"; // +7d
    const state = getTrialState(ends, "trialing");
    expect(state.isTrial).toBe(true);
    expect(state.daysLeft).toBe(7);
    expect(state.expired).toBe(false);
  });

  it("trialing com data vencida retorna expired=true e daysLeft=0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T10:00:00Z"));
    const ended = "2026-04-20T10:00:00Z"; // 7d atrás
    const state = getTrialState(ended, "trialing");
    expect(state.expired).toBe(true);
    expect(state.daysLeft).toBe(0);
  });

  it("trialing sem billing_status (undefined) ainda funciona", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T10:00:00Z"));
    const ends = "2026-05-04T10:00:00Z";
    expect(getTrialState(ends, undefined).isTrial).toBe(true);
  });
});

describe("PLANS", () => {
  it("starter, growth e scale estao definidos", () => {
    const codes = PLANS.map((p) => p.code).sort();
    expect(codes).toEqual(["growth", "scale", "starter"]);
  });

  it("scale e o unico com seats unlimited", () => {
    const unlimited = PLANS.filter((p) => p.limits.seats === "unlimited").map((p) => p.code);
    expect(unlimited).toEqual(["scale"]);
  });

  it("limites monotonicos: starter < growth (em seats e leads)", () => {
    const s = PLANS.find((p) => p.code === "starter")!;
    const g = PLANS.find((p) => p.code === "growth")!;
    expect(s.limits.seats).toBeLessThan(g.limits.seats as number);
    expect(s.limits.leadsMonth).toBeLessThan(g.limits.leadsMonth as number);
    expect(s.limits.aiActionsMonth).toBeLessThan(g.limits.aiActionsMonth as number);
  });
});

describe("TRIAL_DAYS", () => {
  it("e 14", () => {
    expect(TRIAL_DAYS).toBe(14);
  });
});
