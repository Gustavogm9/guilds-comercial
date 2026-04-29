import { describe, it, expect } from "vitest";
import {
  isValidCNPJ,
  formatCNPJ,
  formatTelefoneBR,
  formatCEP,
  onlyDigits,
} from "@/lib/utils/br-fiscal";

describe("isValidCNPJ", () => {
  it("aceita CNPJ válido (Petrobras: 33.000.167/0001-01)", () => {
    expect(isValidCNPJ("33000167000101")).toBe(true);
    expect(isValidCNPJ("33.000.167/0001-01")).toBe(true);
  });

  it("rejeita CNPJ com DV errado", () => {
    expect(isValidCNPJ("33000167000102")).toBe(false);
  });

  it("rejeita tamanho incorreto", () => {
    expect(isValidCNPJ("123")).toBe(false);
    expect(isValidCNPJ("1234567890123456789")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(isValidCNPJ("")).toBe(false);
  });

  it("rejeita repetidos como 00000000000000", () => {
    expect(isValidCNPJ("00000000000000")).toBe(false);
    expect(isValidCNPJ("11111111111111")).toBe(false);
  });
});

describe("formatCNPJ", () => {
  it("formata 14 dígitos", () => {
    expect(formatCNPJ("33000167000101")).toBe("33.000.167/0001-01");
  });

  it("retorna apenas dígitos se tamanho diferente de 14", () => {
    expect(formatCNPJ("330")).toBe("330");
  });
});

describe("formatTelefoneBR", () => {
  it("formata celular 11 dígitos", () => {
    expect(formatTelefoneBR("11987654321")).toBe("(11) 98765-4321");
  });

  it("formata fixo 10 dígitos", () => {
    expect(formatTelefoneBR("1133224455")).toBe("(11) 3322-4455");
  });

  it("retorna intacto se outro tamanho", () => {
    expect(formatTelefoneBR("xpto")).toBe("xpto");
  });
});

describe("formatCEP", () => {
  it("formata 8 dígitos", () => {
    expect(formatCEP("01310100")).toBe("01310-100");
  });
});

describe("onlyDigits", () => {
  it("remove tudo não-numérico", () => {
    expect(onlyDigits("(11) 98765-4321")).toBe("11987654321");
    expect(onlyDigits("CNPJ: 33.000.167/0001-01")).toBe("33000167000101");
  });

  it("aceita undefined/null sem quebrar", () => {
    expect(onlyDigits(undefined)).toBe("");
    expect(onlyDigits(null)).toBe("");
  });
});
