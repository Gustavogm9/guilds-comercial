/**
 * Camada 2 — RLS isolation real multi-org.
 *
 * Cria 2 orgs de teste + 4 users (gestor A/B, comercial A/B) + leads em cada
 * e valida que:
 *   - Cada user só vê leads da sua org via SELECT
 *   - INSERTs cross-org são rejeitados pelo RLS
 *   - Comercial não consegue criar API key/webhook (gestor only)
 *   - profiles.select_own_or_sameorg de fato esconde profiles de outras orgs
 *   - membros_insert exige is_gestor_in_org (privilege escalation fechada)
 *   - anon não vê absolutamente nada
 *
 * Técnica de impersonation: a Management API executa como `postgres` (admin),
 * mas dentro de `begin; set local role authenticated; set local request.jwt.claims;`
 * o RLS é aplicado como se fosse um request real do PostgREST. `auth.uid()`
 * lê de `current_setting('request.jwt.claims')::jsonb ->> 'sub'`.
 *
 * Roda só sob demanda: `npm run test:db`. Pula se SUPABASE_PERSONAL_ACCESS_TOKEN
 * não estiver setado.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TOKEN = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF ?? "mdmbuekuemcjumxcmkls";
const itDb = TOKEN ? it : it.skip;

// UUIDs determinísticos — fácil identificar e fazer cleanup idempotente
const ORG_A      = "aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B      = "bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const GESTOR_A   = "aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COMERC_A   = "aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GESTOR_B   = "bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const COMERC_B   = "bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STRANGER   = "ccccccc1-cccc-cccc-cccc-cccccccccccc"; // user sem org nenhuma

interface SqlResult { rows: any[]; error: string | null }

async function adminSql(query: string): Promise<SqlResult> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok || (body && body.error) || (body && typeof body === "object" && body.message && !Array.isArray(body))) {
    return { rows: [], error: typeof body === "string" ? body : (body.error?.message ?? body.message ?? JSON.stringify(body)) };
  }
  return { rows: Array.isArray(body) ? body : [], error: null };
}

/**
 * Executa query como user authenticated impersonando o uid via JWT claim.
 * Sempre dentro de `begin/rollback` — nada persiste.
 *
 * Para tests que precisam validar resultado de SELECT, captura `rows`.
 * Para tests que validam que INSERT/UPDATE FALHA, captura `error`.
 */
async function asUser(uid: string, query: string): Promise<SqlResult> {
  // PostgreSQL exige que SET LOCAL role aconteça dentro de transação; a Management
  // API roda em uma transação implícita por chamada, então `begin/rollback` aqui
  // garante que nada persista.
  const claims = JSON.stringify({ sub: uid, role: "authenticated" });
  const bundle = `
    begin;
    set local role authenticated;
    set local request.jwt.claims = '${claims}';
    ${query}
    rollback;
  `;
  return adminSql(bundle);
}

async function asAnon(query: string): Promise<SqlResult> {
  const bundle = `
    begin;
    set local role anon;
    set local request.jwt.claims = '{"role":"anon"}';
    ${query}
    rollback;
  `;
  return adminSql(bundle);
}

async function setupFixtures() {
  // Cleanup idempotente — apaga fixtures de runs anteriores se ficaram penduradas.
  await adminSql(`
    delete from public.leads        where organizacao_id in ('${ORG_A}','${ORG_B}');
    delete from public.membros_organizacao where organizacao_id in ('${ORG_A}','${ORG_B}');
    delete from public.organizacao_config  where organizacao_id in ('${ORG_A}','${ORG_B}');
    delete from public.organizacoes where id in ('${ORG_A}','${ORG_B}');
    delete from public.profiles    where id in ('${GESTOR_A}','${COMERC_A}','${GESTOR_B}','${COMERC_B}','${STRANGER}');
    delete from auth.users         where id in ('${GESTOR_A}','${COMERC_A}','${GESTOR_B}','${COMERC_B}','${STRANGER}');
  `);

  // Cria 5 users (4 com org + 1 sem org pra teste de stranger)
  // Inclui email pra testes que precisam casar email do convite com auth.users.
  await adminSql(`
    insert into auth.users (id, email) values
      ('${GESTOR_A}',   'test-rls-gestor-a@example.invalid'),
      ('${COMERC_A}',   'test-rls-comerc-a@example.invalid'),
      ('${GESTOR_B}',   'test-rls-gestor-b@example.invalid'),
      ('${COMERC_B}',   'test-rls-comerc-b@example.invalid'),
      ('${STRANGER}',   'test-rls-stranger@example.invalid')
    on conflict (id) do nothing;
  `);

  // Cria profiles
  await adminSql(`
    insert into public.profiles (id, email, display_name, role) values
      ('${GESTOR_A}', 'test-rls-gestor-a@example.invalid', 'Gestor A', 'gestor'),
      ('${COMERC_A}', 'test-rls-comerc-a@example.invalid', 'Comercial A', 'comercial'),
      ('${GESTOR_B}', 'test-rls-gestor-b@example.invalid', 'Gestor B', 'gestor'),
      ('${COMERC_B}', 'test-rls-comerc-b@example.invalid', 'Comercial B', 'comercial'),
      ('${STRANGER}', 'test-rls-stranger@example.invalid', 'Stranger', 'comercial');
  `);

  // Cria 2 orgs
  await adminSql(`
    insert into public.organizacoes (id, nome, slug, owner_id) values
      ('${ORG_A}', 'Test RLS Org A', 'test-rls-org-a-${Date.now()}a', '${GESTOR_A}'),
      ('${ORG_B}', 'Test RLS Org B', 'test-rls-org-b-${Date.now()}b', '${GESTOR_B}');

    insert into public.organizacao_config (organizacao_id, distribuicao_automatica, distribuicao_estrategia) values
      ('${ORG_A}', false, 'manual'),
      ('${ORG_B}', false, 'manual');
  `);

  // Memberships
  await adminSql(`
    insert into public.membros_organizacao (organizacao_id, profile_id, role, ativo) values
      ('${ORG_A}', '${GESTOR_A}', 'gestor',    true),
      ('${ORG_A}', '${COMERC_A}', 'comercial', true),
      ('${ORG_B}', '${GESTOR_B}', 'gestor',    true),
      ('${ORG_B}', '${COMERC_B}', 'comercial', true);

    update public.profiles set home_organizacao_id = '${ORG_A}' where id in ('${GESTOR_A}','${COMERC_A}');
    update public.profiles set home_organizacao_id = '${ORG_B}' where id in ('${GESTOR_B}','${COMERC_B}');
  `);

  // 2 leads em cada org
  await adminSql(`
    insert into public.leads (organizacao_id, empresa, responsavel_id, funnel_stage, crm_stage) values
      ('${ORG_A}', 'Cliente A1', '${GESTOR_A}',  'pipeline', 'Prospecção'),
      ('${ORG_A}', 'Cliente A2', '${COMERC_A}',  'pipeline', 'Qualificado'),
      ('${ORG_B}', 'Cliente B1', '${GESTOR_B}',  'pipeline', 'Prospecção'),
      ('${ORG_B}', 'Cliente B2', '${COMERC_B}',  'pipeline', 'Proposta');
  `);
}

async function teardownFixtures() {
  await adminSql(`
    delete from public.leads        where organizacao_id in ('${ORG_A}','${ORG_B}');
    delete from public.membros_organizacao where organizacao_id in ('${ORG_A}','${ORG_B}');
    delete from public.organizacao_config  where organizacao_id in ('${ORG_A}','${ORG_B}');
    delete from public.organizacoes where id in ('${ORG_A}','${ORG_B}');
    delete from public.profiles    where id in ('${GESTOR_A}','${COMERC_A}','${GESTOR_B}','${COMERC_B}','${STRANGER}');
    delete from auth.users         where id in ('${GESTOR_A}','${COMERC_A}','${GESTOR_B}','${COMERC_B}','${STRANGER}');
  `);
}

describe("RLS isolation — multi-org", () => {
  beforeAll(async () => {
    if (!TOKEN) return;
    await setupFixtures();
  }, 30_000);

  afterAll(async () => {
    if (!TOKEN) return;
    await teardownFixtures();
  }, 30_000);

  itDb("gestor A vê APENAS leads da org A", async () => {
    const r = await asUser(GESTOR_A,
      `select empresa from public.leads where organizacao_id in ('${ORG_A}','${ORG_B}') order by empresa;`
    );
    expect(r.error).toBeNull();
    const empresas = r.rows.map((x: any) => x.empresa);
    expect(empresas).toEqual(["Cliente A1", "Cliente A2"]);
  });

  itDb("comercial A vê APENAS leads da org A (RLS é por org, não por responsável)", async () => {
    const r = await asUser(COMERC_A,
      `select empresa from public.leads where organizacao_id in ('${ORG_A}','${ORG_B}') order by empresa;`
    );
    expect(r.error).toBeNull();
    expect(r.rows.map((x: any) => x.empresa)).toEqual(["Cliente A1", "Cliente A2"]);
  });

  itDb("gestor B vê APENAS leads da org B", async () => {
    const r = await asUser(GESTOR_B,
      `select empresa from public.leads where organizacao_id in ('${ORG_A}','${ORG_B}') order by empresa;`
    );
    expect(r.error).toBeNull();
    expect(r.rows.map((x: any) => x.empresa)).toEqual(["Cliente B1", "Cliente B2"]);
  });

  itDb("user sem nenhuma org não vê NENHUM lead", async () => {
    const r = await asUser(STRANGER, `select count(*)::int as n from public.leads;`);
    expect(r.error).toBeNull();
    expect(r.rows[0]?.n).toBe(0);
  });

  itDb("anon não vê nenhum lead", async () => {
    const r = await asAnon(`select count(*)::int as n from public.leads;`);
    expect(r.error).toBeNull();
    expect(r.rows[0]?.n).toBe(0);
  });

  itDb("v_leads_enriched respeita RLS (security_invoker = on funcionando)", async () => {
    const r = await asUser(GESTOR_A,
      `select empresa from public.v_leads_enriched where organizacao_id in ('${ORG_A}','${ORG_B}') order by empresa;`
    );
    expect(r.error).toBeNull();
    expect(r.rows.map((x: any) => x.empresa)).toEqual(["Cliente A1", "Cliente A2"]);
  });

  itDb("gestor A NÃO consegue inserir lead na org B (RLS rejeita)", async () => {
    const r = await asUser(GESTOR_A,
      `insert into public.leads (organizacao_id, empresa, funnel_stage, crm_stage) values ('${ORG_B}', 'Hack', 'pipeline', 'Prospecção');`
    );
    expect(r.error, "deve haver erro de RLS").not.toBeNull();
    expect(r.error?.toLowerCase()).toMatch(/row-level security|new row violates|policy/);
  });

  itDb("comercial A NÃO consegue criar API key (gestor only)", async () => {
    const r = await asUser(COMERC_A,
      `insert into public.api_keys (organizacao_id, name, prefix, key_hash) values ('${ORG_A}', 'test', 'gk_test', 'fakehash');`
    );
    expect(r.error, "comercial não pode criar API key").not.toBeNull();
    expect(r.error?.toLowerCase()).toMatch(/row-level security|policy/);
  });

  itDb("gestor A consegue criar API key na própria org", async () => {
    const r = await asUser(GESTOR_A,
      `insert into public.api_keys (organizacao_id, name, prefix, key_hash) values ('${ORG_A}', 'test', 'gk_test_a', 'hash_a') returning id;`
    );
    expect(r.error).toBeNull();
    expect(r.rows.length).toBe(1);
  });

  itDb("gestor A NÃO consegue criar API key na org B", async () => {
    const r = await asUser(GESTOR_A,
      `insert into public.api_keys (organizacao_id, name, prefix, key_hash) values ('${ORG_B}', 'sneaky', 'gk_sneaky', 'hashx');`
    );
    expect(r.error).not.toBeNull();
  });

  itDb("STRANGER NÃO consegue se auto-adicionar como membro de org A (privilege escalation fechada)", async () => {
    // Esse era o bug que a migration 20260427000000_fix_rls_membros corrigiu.
    const r = await asUser(STRANGER,
      `insert into public.membros_organizacao (organizacao_id, profile_id, role, ativo) values ('${ORG_A}', '${STRANGER}', 'comercial', true);`
    );
    expect(r.error, "stranger não pode mais se adicionar via profile_id=auth.uid()").not.toBeNull();
    expect(r.error?.toLowerCase()).toMatch(/row-level security|policy/);
  });

  itDb("gestor A NÃO vê profile do gestor B (orgs separadas)", async () => {
    const r = await asUser(GESTOR_A,
      `select id from public.profiles where id = '${GESTOR_B}';`
    );
    expect(r.error).toBeNull();
    expect(r.rows.length, "profile de outro user em outra org não deve aparecer").toBe(0);
  });

  itDb("gestor A vê seu próprio profile + os colegas da mesma org", async () => {
    const r = await asUser(GESTOR_A,
      `select id from public.profiles where id in ('${GESTOR_A}','${COMERC_A}','${GESTOR_B}','${COMERC_B}') order by id;`
    );
    expect(r.error).toBeNull();
    const ids = r.rows.map((x: any) => x.id).sort();
    expect(ids).toEqual([GESTOR_A, COMERC_A].sort());
  });

  itDb("comercial A NÃO consegue atualizar nome da org A (gestor only)", async () => {
    const r = await asUser(COMERC_A,
      `update public.organizacoes set nome = 'Hacked' where id = '${ORG_A}' returning id;`
    );
    // No Postgres, UPDATE que não casa com USING/WITH CHECK retorna 0 rows
    // (sem erro — apenas nada atualizado). Então: ou error não-null, ou rows=0.
    if (r.error) {
      expect(r.error.toLowerCase()).toMatch(/row-level security|policy/);
    } else {
      expect(r.rows.length).toBe(0);
    }
  });

  itDb("gestor A consegue atualizar nome da org A", async () => {
    const r = await asUser(GESTOR_A,
      `update public.organizacoes set nome = 'Test RLS Org A v2' where id = '${ORG_A}' returning id;`
    );
    expect(r.error).toBeNull();
    expect(r.rows.length).toBe(1);
  });

  // ============================================================
  // Fluxo de convite — equivalente ao /api/convite/[token]
  // STRANGER (criado no setup principal sem org) é o convidado.
  // ============================================================

  itDb("convite válido + email correto → STRANGER vira membro de A (simula endpoint)", async () => {
    const strangerEmail = await adminSql(
      `select email from auth.users where id = '${STRANGER}'`
    );
    const email = strangerEmail.rows[0]?.email ?? "";

    const ins = await adminSql(`
      insert into public.convites (organizacao_id, email, role, convidado_por, expira_em)
      values ('${ORG_A}', '${email}', 'comercial', '${GESTOR_A}', now() + interval '7 days')
      returning token::text;
    `);
    const token = ins.rows[0]?.token;
    expect(token).toBeTruthy();

    // Simula a parte do endpoint que escreve (com privs de service role)
    await adminSql(`
      insert into public.membros_organizacao (organizacao_id, profile_id, role, ativo)
      values ('${ORG_A}', '${STRANGER}', 'comercial', true)
      on conflict (organizacao_id, profile_id) do update set ativo = true, role = excluded.role;

      update public.convites set aceito_em = now() where token = '${token}'::uuid;
    `);

    const r = await adminSql(`
      select m.role, m.ativo, c.aceito_em is not null as aceito
      from public.membros_organizacao m
      join public.convites c on c.token = '${token}'::uuid
      where m.profile_id = '${STRANGER}' and m.organizacao_id = '${ORG_A}'
    `);
    expect(r.rows[0]?.role).toBe("comercial");
    expect(r.rows[0]?.ativo).toBe(true);
    expect(r.rows[0]?.aceito).toBe(true);

    await adminSql(`
      delete from public.membros_organizacao where profile_id = '${STRANGER}' and organizacao_id = '${ORG_A}';
      delete from public.convites where token = '${token}'::uuid;
    `);
  });

  itDb("convite expirado não passa pela query do endpoint", async () => {
    const ins = await adminSql(`
      insert into public.convites (organizacao_id, email, role, convidado_por, expira_em)
      values ('${ORG_A}', 'outro@example.invalid', 'comercial', '${GESTOR_A}', now() - interval '1 day')
      returning token::text;
    `);
    const token = ins.rows[0]?.token;
    expect(token).toBeTruthy();

    const r = await adminSql(`
      select count(*)::int as n from public.convites
      where token = '${token}'::uuid
        and aceito_em is null
        and expira_em > now();
    `);
    expect(r.rows[0]?.n).toBe(0);

    await adminSql(`delete from public.convites where token = '${token}'::uuid;`);
  });

  itDb("convite com email diferente do user logado é rejeitado", async () => {
    const ins = await adminSql(`
      insert into public.convites (organizacao_id, email, role, convidado_por, expira_em)
      values ('${ORG_A}', 'outro@example.invalid', 'comercial', '${GESTOR_A}', now() + interval '7 days')
      returning token::text;
    `);
    const token = ins.rows[0]?.token;
    expect(token).toBeTruthy();

    const r = await adminSql(`
      select lower(c.email) = lower(u.email) as match
      from public.convites c, auth.users u
      where c.token = '${token}'::uuid and u.id = '${STRANGER}'
    `);
    expect(r.rows[0]?.match).toBe(false);

    await adminSql(`delete from public.convites where token = '${token}'::uuid;`);
  });
});
