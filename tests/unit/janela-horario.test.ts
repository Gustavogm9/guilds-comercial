import { describe, it, expect, vi, afterEach } from "vitest";
import { dentroJanela } from "@/lib/utils/janela-horario";

describe("dentroJanela", () => {
  afterEach(() => vi.useRealTimers());

  it("hora dentro de janela 08:00–20:00 retorna true", () => {
    vi.useFakeTimers();
    // 14:30 UTC = 11:30 em America/Sao_Paulo (UTC-3)
    vi.setSystemTime(new Date("2026-04-27T14:30:00Z"));
    expect(dentroJanela("08:00:00", "20:00:00", "America/Sao_Paulo")).toBe(true);
  });

  it("hora antes da janela (06:00 BRT) retorna false", () => {
    vi.useFakeTimers();
    // 09:00 UTC = 06:00 BRT
    vi.setSystemTime(new Date("2026-04-27T09:00:00Z"));
    expect(dentroJanela("08:00:00", "20:00:00", "America/Sao_Paulo")).toBe(false);
  });

  it("hora depois da janela (22:00 BRT) retorna false", () => {
    vi.useFakeTimers();
    // 01:00 UTC do dia seguinte = 22:00 BRT
    vi.setSystemTime(new Date("2026-04-28T01:00:00Z"));
    expect(dentroJanela("08:00:00", "20:00:00", "America/Sao_Paulo")).toBe(false);
  });

  it("janela cruzando meia-noite (22:00–06:00) — hora 23:00 dentro", () => {
    vi.useFakeTimers();
    // 02:00 UTC = 23:00 BRT do dia anterior
    vi.setSystemTime(new Date("2026-04-28T02:00:00Z"));
    expect(dentroJanela("22:00:00", "06:00:00", "America/Sao_Paulo")).toBe(true);
  });

  it("janela cruzando meia-noite — hora 03:00 BRT dentro", () => {
    vi.useFakeTimers();
    // 06:00 UTC = 03:00 BRT
    vi.setSystemTime(new Date("2026-04-27T06:00:00Z"));
    expect(dentroJanela("22:00:00", "06:00:00", "America/Sao_Paulo")).toBe(true);
  });

  it("janela cruzando meia-noite — hora 12:00 fora", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T15:00:00Z")); // 12:00 BRT
    expect(dentroJanela("22:00:00", "06:00:00", "America/Sao_Paulo")).toBe(false);
  });

  it("fuso inválido cai no fail-open (true)", () => {
    expect(dentroJanela("08:00:00", "20:00:00", "Mars/Olympus_Mons")).toBe(true);
  });

  it("respeita fuso diferente (America/Manaus = UTC-4)", () => {
    vi.useFakeTimers();
    // 11:00 UTC. SP = 08:00 (limite). Manaus = 07:00 (fora)
    vi.setSystemTime(new Date("2026-04-27T11:00:00Z"));
    expect(dentroJanela("08:00:00", "20:00:00", "America/Sao_Paulo")).toBe(true);
    expect(dentroJanela("08:00:00", "20:00:00", "America/Manaus")).toBe(false);
  });
});
