import { describe, it, expect } from "vitest";
import {
  parseCsv,
  inferirMapping,
  normalizarTelefone,
  parseValorBR,
  aplicarMapping,
  type CampoLead,
} from "@/lib/utils/csv-import";

describe("parseCsv", () => {
  it("parseia CSV simples com vírgula", () => {
    const { headers, rows } = parseCsv("Empresa,Nome\nClínica X,Maria\nClínica Y,João");
    expect(headers).toEqual(["Empresa", "Nome"]);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({ Empresa: "Clínica X", Nome: "Maria" });
  });

  it("aceita ponto-e-vírgula como separador (Excel BR)", () => {
    const { headers, rows } = parseCsv("Empresa;Nome\nClínica X;Maria");
    expect(headers).toEqual(["Empresa", "Nome"]);
    expect(rows[0].Empresa).toBe("Clínica X");
  });

  it("preserva vírgulas dentro de aspas", () => {
    const { rows } = parseCsv('Empresa,Obs\nClínica X,"Saúde, RJ"\n');
    expect(rows[0].Obs).toBe("Saúde, RJ");
  });

  it("trata \\r\\n", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows.length).toBe(2);
  });

  it("string vazia retorna headers e rows vazios", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("inferirMapping", () => {
  it("mapeia headers nativos PT-BR", () => {
    const m = inferirMapping(["Empresa", "Nome", "Cargo", "Email", "WhatsApp"]);
    expect(m.Empresa).toBe("empresa");
    expect(m.Nome).toBe("nome");
    expect(m.Cargo).toBe("cargo");
    expect(m.Email).toBe("email");
    expect(m.WhatsApp).toBe("whatsapp");
  });

  it("mapeia exportação Pipedrive (Organization, Person, Phone)", () => {
    const m = inferirMapping(["Organization", "Person Name", "Title", "Email Address", "Phone Number"]);
    expect(m.Organization).toBe("empresa");
    expect(m["Person Name"]).toBe("nome");
    expect(m.Title).toBe("cargo");
    expect(m["Email Address"]).toBe("email");
    expect(m["Phone Number"]).toBe("whatsapp");
  });

  it("mapeia exportação HubSpot (Company, Contact, Lifecycle Stage)", () => {
    const m = inferirMapping(["Company", "Contact", "Job Title", "Industry"]);
    expect(m.Company).toBe("empresa");
    expect(m.Contact).toBe("nome");
    expect(m["Job Title"]).toBe("cargo");
    expect(m.Industry).toBe("segmento");
  });

  it("não mapeia colunas desconhecidas", () => {
    const m = inferirMapping(["Empresa", "RandomColumn", "X"]);
    expect(m.Empresa).toBe("empresa");
    expect(m.RandomColumn).toBeNull();
    expect(m.X).toBeNull();
  });

  it("não mapeia 2 headers para o mesmo campo", () => {
    const m = inferirMapping(["Empresa", "Company"]);
    // O primeiro pega "empresa", o segundo fica null (já usado)
    expect(m.Empresa).toBe("empresa");
    expect(m.Company).toBeNull();
  });

  it("ignora acentos e case", () => {
    expect(inferirMapping(["EMPRESA"]).EMPRESA).toBe("empresa");
    expect(inferirMapping(["telefone"]).telefone).toBe("whatsapp");
    expect(inferirMapping(["organização"]).organização).toBe("empresa");
  });
});

describe("normalizarTelefone", () => {
  it("11 dígitos vira 55 + número", () => {
    expect(normalizarTelefone("11987654321")).toBe("5511987654321");
  });
  it("10 dígitos (fixo) vira 55 + número", () => {
    expect(normalizarTelefone("1133224455")).toBe("551133224455");
  });
  it("já com DDI 55 mantém", () => {
    expect(normalizarTelefone("5511987654321")).toBe("5511987654321");
  });
  it("formatado limpa pra dígitos", () => {
    expect(normalizarTelefone("(11) 98765-4321")).toBe("5511987654321");
  });
  it("vazio retorna vazio", () => {
    expect(normalizarTelefone("")).toBe("");
    expect(normalizarTelefone(null)).toBe("");
    expect(normalizarTelefone(undefined)).toBe("");
  });
});

describe("parseValorBR", () => {
  it('"R$ 1.500,00" vira 1500', () => {
    expect(parseValorBR("R$ 1.500,00")).toBe(1500);
  });
  it('"15000" vira 15000', () => {
    expect(parseValorBR("15000")).toBe(15000);
  });
  it('"1500,50" vira 1500.5', () => {
    expect(parseValorBR("1500,50")).toBe(1500.5);
  });
  it('"abc" vira 0', () => {
    expect(parseValorBR("abc")).toBe(0);
  });
});

describe("aplicarMapping", () => {
  it("aplica mapping retornando só campos mapeados", () => {
    const row = { Org: "X", Phone: "11987654321", Junk: "ignored" };
    const map: Record<string, CampoLead | null> = { Org: "empresa", Phone: "whatsapp", Junk: null };
    expect(aplicarMapping(row, map)).toEqual({ empresa: "X", whatsapp: "11987654321" });
  });
  it("converte valor_potencial via parseValorBR", () => {
    const row = { Valor: "R$ 5.000,00" };
    const map: Record<string, CampoLead | null> = { Valor: "valor_potencial" };
    expect(aplicarMapping(row, map)).toEqual({ valor_potencial: 5000 });
  });
});
