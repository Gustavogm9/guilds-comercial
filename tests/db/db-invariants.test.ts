/**
 * Testes de invariants do schema Supabase, contra o projeto guilds-comercial.
 *
 * Roda só sob demanda (`npm run test:db`) — toca o banco remoto via Management API.
 * Configurar via env:
 *   SUPABASE_PERSONAL_ACCESS_TOKEN=sbp_...    (Personal Access Token)
 *   SUPABASE_PROJECT_REF=mdmbuekuemcjumxcmkls (default abaixo)
 *
 * Esses testes capturam regressões das migrations de hardening (security_invoker
 * em views, search_path em funções, revoke anon, índices em FKs, RLS initplan).
 * Se alguém aplicar uma migration que reverte um desses ganhos, o teste quebra.
 *
 * Não cobre RLS isolation real (multi-org) — isso é Camada 2 (precisa criar
 * users + JWTs e simular sessões authenticated).
 */
import { describe, it, expect, beforeAll } from "vitest";

const TOKEN = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF ?? "mdmbuekuemcjumxcmkls";

// Pula tudo se token não setado — não quebra CI sem credenciais.
const itDb = TOKEN ? it : it.skip;

async function sql<T = any>(query: string): Promise<T[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T[]>;
}

describe("DB invariants — guilds-comercial", () => {
  beforeAll(() => {
    if (!TOKEN) {
      // eslint-disable-next-line no-console
      console.warn("[db-invariants] SUPABASE_PERSONAL_ACCESS_TOKEN não setado — pulando testes de banco.");
    }
  });

  itDb("todas as 14 views agregadas têm security_invoker = on", async () => {
    const expected = [
      "v_ai_uso_30d", "v_ativacao_org", "v_cohort_entrada", "v_forecast_mes",
      "v_funil_conversao", "v_kpis_globais", "v_kpis_por_canal", "v_kpis_por_responsavel",
      "v_lead_score", "v_leads_enriched", "v_motivos_perda", "v_tempo_por_etapa",
      "v_top_oportunidades", "v_valor_por_etapa",
    ];
    const rows = await sql<{ relname: string; security_invoker: boolean }>(`
      select c.relname,
        (select option_value::boolean
         from unnest(c.reloptions) opt(o),
              lateral (select split_part(o,'=',1) k, split_part(o,'=',2) option_value) p
         where p.k='security_invoker') as security_invoker
      from pg_class c
      join pg_namespace n on c.relnamespace=n.oid
      where n.nspname='public' and c.relkind='v'
    `);
    const map = Object.fromEntries(rows.map((r) => [r.relname, r.security_invoker]));
    for (const v of expected) {
      expect(map[v], `view ${v} deveria existir e ter security_invoker=on`).toBe(true);
    }
  });

  itDb("anon NÃO consegue executar is_gestor_in_org nem orgs_do_usuario", async () => {
    const rows = await sql<{ proname: string; rolname: string; can_exec: boolean }>(`
      select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') as can_exec
      from pg_proc p, pg_roles r
      where p.proname in ('is_gestor_in_org','orgs_do_usuario')
        and r.rolname in ('anon','authenticated')
        and p.pronamespace='public'::regnamespace
    `);
    for (const r of rows) {
      if (r.rolname === "anon") {
        expect(r.can_exec, `anon NÃO pode executar ${r.proname}`).toBe(false);
      } else {
        expect(r.can_exec, `authenticated PRECISA executar ${r.proname} (RLS depende)`).toBe(true);
      }
    }
  });

  itDb("9 funções utilitárias têm search_path = public setado", async () => {
    const expected = [
      "cadencia_default_fields", "cadencia_objetivo_default", "lead_probabilidade_por_etapa",
      "lead_score_fechamento", "raiox_classificar", "set_updated_at",
      "sync_lead_probabilidade", "sync_raiox_voucher", "touch_updated_at",
    ];
    const rows = await sql<{ proname: string; cur_config: string[] | null }>(`
      select proname, proconfig as cur_config
      from pg_proc
      where pronamespace='public'::regnamespace
        and proname = any($$${JSON.stringify(expected).replaceAll("\"", "'")}$$::text[])
    `).catch(async () =>
      // fallback: array_agg por nome se acima quebrar (sintaxe de array)
      sql<{ proname: string; cur_config: string[] | null }>(
        `select proname, proconfig as cur_config from pg_proc
         where pronamespace='public'::regnamespace
           and proname in ('${expected.join("','")}')`
      )
    );
    for (const r of rows) {
      expect(r.cur_config ?? [], `${r.proname} precisa search_path=public`).toContain("search_path=public");
    }
  });

  itDb("14 FKs têm índice de cobertura", async () => {
    // Lista fixa: cada par (tabela, coluna) que precisa de índice cobrindo a FK.
    const expectedIdx = [
      ["api_keys", "organizacao_id"],
      ["convites", "convidado_por"],
      ["lead_evento", "ator_id"],
      ["ligacoes", "responsavel_id"],
      ["meta_individual", "profile_id"],
      ["newsletter", "responsavel_id"],
      ["organizacao_evento", "ator_id"],
      ["organizacoes", "owner_id"],
      ["profiles", "home_organizacao_id"],
      ["raio_x", "responsavel_id"],
      ["vendedor_segmento", "profile_id"],
      ["webhook_events", "organizacao_id"],
      ["webhook_events", "webhook_id"],
      ["webhooks", "organizacao_id"],
    ];
    const rows = await sql<{ tablename: string; indexdef: string }>(
      `select tablename, indexdef from pg_indexes where schemaname='public'`
    );
    for (const [t, c] of expectedIdx) {
      const found = rows.some(
        (r) =>
          r.tablename === t &&
          new RegExp(`\\(${c}\\)|\\(${c},`, "i").test(r.indexdef)
      );
      expect(found, `falta índice cobrindo ${t}(${c})`).toBe(true);
    }
  });

  itDb("policy membros_insert_gestor exige is_gestor_in_org (sem profile_id=auth.uid())", async () => {
    const rows = await sql<{ policyname: string; with_check: string }>(`
      select policyname, with_check from pg_policies
      where schemaname='public' and tablename='membros_organizacao' and cmd='INSERT'
    `);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.with_check).toMatch(/is_gestor_in_org/);
      expect(r.with_check).not.toMatch(/profile_id\s*=\s*auth\.uid/);
    }
  });

  itDb("policies migradas usam (select auth.uid()) — sem auth_rls_initplan", async () => {
    const watched = [
      ["profiles", "profiles_select_own_or_sameorg"],
      ["profiles", "profiles_update_self"],
      ["profiles", "profiles_insert_self"],
      ["organizacoes", "org_insert_self"],
      ["api_keys", "Acesso as chaves da sua propria organizacao"],
      ["webhooks", "Acesso aos webhooks da organizacao"],
      ["webhook_events", "Leitura dos eventos do webhook"],
    ];
    const rows = await sql<{
      tablename: string;
      policyname: string;
      qual: string | null;
      with_check: string | null;
    }>(`select tablename, policyname, qual, with_check from pg_policies where schemaname='public'`);
    for (const [t, name] of watched) {
      const p = rows.find((r) => r.tablename === t && r.policyname === name);
      expect(p, `policy ${t}.${name} não encontrada`).toBeTruthy();
      const text = `${p!.qual ?? ""} ${p!.with_check ?? ""}`;
      // O Postgres reescreve `(select auth.uid())` como `( SELECT auth.uid() AS uid)`.
      // Se aparece auth.uid() sem `SELECT` antes, é initplan-vulnerable.
      const matches = text.match(/auth\.uid\s*\(/gi) ?? [];
      const wrappedMatches = text.match(/\(\s*SELECT\s+auth\.uid\s*\(/gi) ?? [];
      expect(
        matches.length,
        `policy ${t}.${name} tem auth.uid() sem (select ...)`
      ).toBe(wrappedMatches.length);
    }
  });
});
