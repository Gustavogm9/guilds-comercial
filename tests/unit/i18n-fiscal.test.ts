import { describe, it, expect } from "vitest";
import {
  validarTaxId,
  labelTaxId,
  formatTelefoneI18n,
  normalizarTelefoneI18n,
  isValidTelefoneI18n,
  getPais,
  PAISES,
} from "@/lib/utils/i18n-fiscal";

describe("validarTaxId", () => {
  it("BR: valida CNPJ pelo DV", () => {
    expect(validarTaxId("33000167000101", "BR").valid).toBe(true);
    expect(validarTaxId("33000167000102", "BR").valid).toBe(false);
  });

  it("BR: tax_id vazio é aceito (campo opcional)", () => {
    expect(validarTaxId("", "BR").valid).toBe(true);
  });

  it("US: aceita EIN ou texto livre não-vazio", () => {
    expect(validarTaxId("12-3456789", "US").valid).toBe(true);
    expect(validarTaxId("ab", "US").valid).toBe(false); // muito curto
    expect(validarTaxId("a".repeat(31), "US").valid).toBe(false); // muito longo
  });

  it("Outros países: usa validação genérica", () => {
    expect(validarTaxId("RUT 76.123.456-7", "CL").valid).toBe(true);
    expect(validarTaxId("PT123456789", "PT").valid).toBe(true);
  });
});

describe("labelTaxId", () => {
  it("retorna label específico por país", () => {
    expect(labelTaxId("BR")).toBe("CNPJ");
    expect(labelTaxId("US")).toBe("EIN / Tax ID");
    expect(labelTaxId("MX")).toBe("RFC");
    expect(labelTaxId("AR")).toBe("CUIT");
    expect(labelTaxId("CL")).toBe("RUT");
    expect(labelTaxId("DE")).toBe("VAT Number");
    expect(labelTaxId("PT")).toBe("NIF");
  });

  it("Países desconhecidos: usa fallback por locale", () => {
    expect(labelTaxId("XX", "pt-BR")).toBe("Identificador fiscal");
    expect(labelTaxId("XX", "en-US")).toBe("Tax ID");
  });
});

describe("formatTelefoneI18n", () => {
  it("formata número BR corretamente", () => {
    expect(formatTelefoneI18n("11987654321", "BR")).toMatch(/\+55/);
  });

  it("formata número US corretamente", () => {
    expect(formatTelefoneI18n("2025551234", "US")).toMatch(/\+1/);
  });

  it("não-parseável retorna o input", () => {
    expect(formatTelefoneI18n("abc")).toBe("abc");
  });

  it("vazio retorna vazio", () => {
    expect(formatTelefoneI18n("")).toBe("");
  });
});

describe("normalizarTelefoneI18n", () => {
  it("BR: formato E.164", () => {
    expect(normalizarTelefoneI18n("(11) 98765-4321", "BR")).toBe("+5511987654321");
  });

  it("US: formato E.164", () => {
    expect(normalizarTelefoneI18n("(202) 555-1234", "US")).toBe("+12025551234");
  });

  it("Inválido: fallback pra dígitos puros", () => {
    expect(normalizarTelefoneI18n("abc")).toBe("");
  });
});

describe("isValidTelefoneI18n", () => {
  it("Aceita números válidos", () => {
    expect(isValidTelefoneI18n("11987654321", "BR")).toBe(true);
    expect(isValidTelefoneI18n("2025551234", "US")).toBe(true);
  });

  it("Rejeita números inválidos pra um país", () => {
    expect(isValidTelefoneI18n("123", "BR")).toBe(false);
  });
});

describe("PAISES", () => {
  it("Tem BR como primeiro item", () => {
    expect(PAISES[0].code).toBe("BR");
    expect(PAISES[0].moeda_padrao).toBe("BRL");
  });

  it("Tem fallback OUTRO", () => {
    const outro = PAISES.find((p) => p.code === "OUTRO");
    expect(outro).toBeTruthy();
    expect(outro?.moeda_padrao).toBe("USD");
  });

  it("getPais com código desconhecido retorna OUTRO", () => {
    expect(getPais("ZZ").code).toBe("OUTRO");
  });

  it("getPais com BR retorna BR", () => {
    expect(getPais("BR").nome_pt).toBe("Brasil");
  });
});
