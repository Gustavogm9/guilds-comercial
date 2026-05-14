-- Hardening multi-tenant para relacoes sem organizacao_id direto.
-- Usa os joins de lead/produto -> organizacao e membros_organizacao -> profile_id
-- para evitar que FKs N:N vazem ou cruzem dados entre orgs.

alter table public.lead_produtos enable row level security;
alter table public.produto_responsaveis enable row level security;

drop policy if exists lead_produtos_org_member_rw on public.lead_produtos;
create policy lead_produtos_org_member_rw on public.lead_produtos
  for all to authenticated
  using (
    exists (
      select 1
      from public.leads l
      join public.produtos p
        on p.id = lead_produtos.produto_id
       and p.organizacao_id = l.organizacao_id
      join public.membros_organizacao m
        on m.organizacao_id = l.organizacao_id
       and m.profile_id = auth.uid()
       and m.ativo = true
      where l.id = lead_produtos.lead_id
    )
  )
  with check (
    exists (
      select 1
      from public.leads l
      join public.produtos p
        on p.id = lead_produtos.produto_id
       and p.organizacao_id = l.organizacao_id
      join public.membros_organizacao m
        on m.organizacao_id = l.organizacao_id
       and m.profile_id = auth.uid()
       and m.ativo = true
      where l.id = lead_produtos.lead_id
    )
  );

drop policy if exists produto_responsaveis_org_member_rw on public.produto_responsaveis;
create policy produto_responsaveis_org_member_rw on public.produto_responsaveis
  for all to authenticated
  using (
    exists (
      select 1
      from public.produtos p
      join public.membros_organizacao viewer
        on viewer.organizacao_id = p.organizacao_id
       and viewer.profile_id = auth.uid()
       and viewer.ativo = true
      where p.id = produto_responsaveis.produto_id
    )
  )
  with check (
    exists (
      select 1
      from public.produtos p
      join public.membros_organizacao viewer
        on viewer.organizacao_id = p.organizacao_id
       and viewer.profile_id = auth.uid()
       and viewer.ativo = true
      join public.membros_organizacao responsavel
        on responsavel.organizacao_id = p.organizacao_id
       and responsavel.profile_id = produto_responsaveis.profile_id
       and responsavel.ativo = true
      where p.id = produto_responsaveis.produto_id
    )
  );

create or replace view public.v_prospeccao_alertas_org
with (security_invoker = true) as
select distinct on (a.id)
  a.id,
  a.empresa_id,
  a.tipo,
  a.payload,
  a.visto,
  a.created_at,
  e.cnpj,
  e.razao_social,
  e.nome_fantasia,
  l.id as lead_id,
  l.organizacao_id,
  l.empresa as lead_empresa,
  l.responsavel_id
from public.prospeccao_alerta_mudanca a
join public.prospeccao_empresa e on e.id = a.empresa_id
join public.leads l on (l.origem_prospeccao->>'cnpj' = e.cnpj or l.observacoes ilike '%' || e.cnpj || '%')
where l.organizacao_id in (select public.orgs_do_usuario())
order by a.id, a.created_at desc;

grant select on public.v_prospeccao_alertas_org to authenticated;
