import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { slugify } from "@/lib/utils/slugify";

describe("slugify", () => {
  it("converte texto simples para slug", () => {
    expect(slugify("Minha Empresa")).toBe("minha-empresa");
  });

  it("remove acentos via NFD", () => {
    expect(slugify("Soluções Inteligência")).toBe("solucoes-inteligencia");
  });

  it("colapsa caracteres não-alfanuméricos em traço único", () => {
    expect(slugify("Empresa &!! Co. (LTDA)")).toBe("empresa-co-ltda");
  });

  it("remove traços nas pontas", () => {
    expect(slugify("---guilds---")).toBe("guilds");
  });

  it("limita a 40 chars", () => {
    const longo = "a".repeat(80);
    expect(slugify(longo).length).toBeLessThanOrEqual(40);
  });

  it("nome só com símbolos cai no fallback org-<timestamp>", () => {
    const fixedNow = 1714000000000;
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    expect(slugify("@@@!!!")).toMatch(/^org-[a-z0-9]+$/);
    vi.useRealTimers();
  });

  it("string vazia cai no fallback", () => {
    expect(slugify("").startsWith("org-")).toBe(true);
  });

  it("ç vira c", () => {
    expect(slugify("Ação")).toBe("acao");
  });
});
