import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/ai/template";

describe("renderTemplate", () => {
  it("substitui chaves simples", () => {
    expect(renderTemplate("Olá {{nome}}!", { nome: "Renan" })).toBe("Olá Renan!");
  });

  it("aceita espacos ao redor da chave", () => {
    expect(renderTemplate("Olá {{ nome }}!", { nome: "Renan" })).toBe("Olá Renan!");
  });

  it("multiplas chaves na mesma string", () => {
    expect(renderTemplate("{{empresa}} - {{cargo}}", { empresa: "Guilds", cargo: "CMO" }))
      .toBe("Guilds - CMO");
  });

  it("chave faltando vira string vazia (nao quebra)", () => {
    expect(renderTemplate("Olá {{nome}} de {{empresa}}", { nome: "Renan" }))
      .toBe("Olá Renan de ");
  });

  it("null e undefined viram string vazia", () => {
    expect(renderTemplate("[{{a}}][{{b}}]", { a: null, b: undefined })).toBe("[][]");
  });

  it("number e boolean viram string", () => {
    expect(renderTemplate("score={{s}} ok={{o}}", { s: 87, o: true })).toBe("score=87 ok=true");
  });

  it("objeto vira JSON.stringify", () => {
    expect(renderTemplate("dados: {{lead}}", { lead: { id: 42, nome: "X" } }))
      .toBe('dados: {"id":42,"nome":"X"}');
  });

  it("array vira JSON.stringify", () => {
    expect(renderTemplate("items: {{xs}}", { xs: [1, 2, 3] })).toBe("items: [1,2,3]");
  });

  it("template sem chaves passa intacto", () => {
    expect(renderTemplate("texto puro", {})).toBe("texto puro");
  });

  it("chaves com sintaxe inválida sao mantidas", () => {
    expect(renderTemplate("{{foo-bar}} {{ }}", { foo: "x" })).toBe("{{foo-bar}} {{ }}");
  });
});
