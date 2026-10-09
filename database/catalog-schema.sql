create function public.mediuse_catalog_normalize(t text) returns text language sql immutable parallel safe set search_path=pg_catalog as $$ select translate(lower(coalesce(t,'')),'άέήίόύώϊΐϋΰς','αεηιουωιιυυσ') $$;
create function public.mediuse_catalog_compact(t text) returns text language sql immutable parallel safe set search_path=pg_catalog,public as $$ select regexp_replace(public.mediuse_catalog_normalize(t),'[^a-z0-9α-ω]','','g') $$;
create function public.mediuse_catalog_terms(t text) returns text language sql immutable parallel safe set search_path=pg_catalog,public as $$ select public.mediuse_catalog_normalize(t) || case when public.mediuse_catalog_normalize(t) ~ '\mκαθετ' or lower(t) ~ '\mcath' then ' καθετ catheter cath' else '' end || case when public.mediuse_catalog_normalize(t) ~ '\mγαντ' or lower(t) ~ '\mglove' then ' γαντ gloves glove' else '' end || case when lower(t) like '%medtronic%' then ' μεντρονικ medtronic' else '' end || case when lower(t) like '%boston%' then ' μποστον boston' else '' end || case when lower(t) like '%zimmer%' then ' ζιμερ zimmer' else '' end || case when lower(t) like '%johnson%' then ' τζονσον johnson' else '' end || case when lower(t) like '%abbott%' then ' αμποτ abbott' else '' end $$;
create table public.mediuse_catalog_items(code text primary key check(length(trim(code))>0),ref text not null check(length(trim(ref))>0),description text not null check(length(trim(description))>0),purchase_qty numeric not null check(purchase_qty>=0),price_purchase numeric check(price_purchase>=0),price_package numeric check(price_package>=0),price_observatory numeric check(price_observatory>=0),observatory_code text,ekapty text,supplier text,search_text text generated always as(public.mediuse_catalog_terms(ref||' '||code||' '||description||' '||coalesce(supplier,''))) stored,search_compact text generated always as(public.mediuse_catalog_compact(ref||' '||code||' '||description||' '||coalesce(supplier,''))) stored);
comment on column public.mediuse_catalog_items.purchase_qty is 'Cumulative purchases since 2018. Ranking only, not stock.';
create index mediuse_catalog_supplier on public.mediuse_catalog_items(supplier);
create table public.mediuse_catalog_meta(id boolean primary key default true check(id),version integer not null default 0,updated_at timestamptz,source_name text,row_count integer not null default 0,updated_by uuid references auth.users(id) on delete set null);
insert into public.mediuse_catalog_meta(id) values(true);
alter table public.mediuse_catalog_items enable row level security;
alter table public.mediuse_catalog_meta enable row level security;
revoke all on public.mediuse_catalog_items,public.mediuse_catalog_meta from anon,authenticated;
grant select,insert,update,delete on public.mediuse_catalog_items to authenticated;
grant select,update on public.mediuse_catalog_meta to authenticated;
create policy mediuse_catalog_members on public.mediuse_catalog_items for all to authenticated using(exists(select 1 from public.mediuse_members where user_id=(select auth.uid())) and exists(select 1 from public.mediuse_config where active)) with check(exists(select 1 from public.mediuse_members where user_id=(select auth.uid())) and exists(select 1 from public.mediuse_config where active));
create policy mediuse_catalog_meta_read on public.mediuse_catalog_meta for select to authenticated using(exists(select 1 from public.mediuse_members where user_id=(select auth.uid())) and exists(select 1 from public.mediuse_config where active));
create policy mediuse_catalog_meta_update on public.mediuse_catalog_meta for update to authenticated using(exists(select 1 from public.mediuse_members where user_id=(select auth.uid())) and exists(select 1 from public.mediuse_config where active)) with check(exists(select 1 from public.mediuse_members where user_id=(select auth.uid())) and exists(select 1 from public.mediuse_config where active));
create function public.mediuse_catalog_search_v2(p_query text default '',p_supplier text default '',p_offset integer default 0,p_sort text default 'relevance') returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
with parameters as (
 select left(public.mediuse_catalog_normalize(trim(coalesce(p_query,''))),160) q,
 public.mediuse_catalog_compact(left(trim(coalesce(p_query,'')),160)) compact,
 case when p_sort in ('alpha','purchase_asc','purchase_desc','observatory_asc','observatory_desc') then p_sort else 'relevance' end sorting
),tokens as (
 select case when token like 'καθετ%' or token like 'cath%' then 'καθετ' when token like 'γαντ%' then 'γαντ' else token end token
 from parameters,unnest(regexp_split_to_array(q,'\s+')) token where token<>''
),matched as materialized (
 select i.*,case
 when public.mediuse_catalog_normalize(i.ref)=p.q or public.mediuse_catalog_normalize(i.code)=p.q or (coalesce(i.observatory_code,'')<>'' and public.mediuse_catalog_normalize(i.observatory_code)=p.q) then 100
 when public.mediuse_catalog_compact(i.ref)=p.compact or public.mediuse_catalog_compact(i.code)=p.compact or (coalesce(i.observatory_code,'')<>'' and public.mediuse_catalog_compact(i.observatory_code)=p.compact) then 95
 when exists(select 1 from tokens t where public.mediuse_catalog_compact(t.token) in(public.mediuse_catalog_compact(i.ref),public.mediuse_catalog_compact(i.code),nullif(public.mediuse_catalog_compact(i.observatory_code),''))) then 90
 when strpos(public.mediuse_catalog_normalize(i.description),p.q)>0 then 70 else 50 end relevance
 from public.mediuse_catalog_items i cross join parameters p
 where not exists(select 1 from tokens t where case
 when t.token ~ '^[0-9]+(\.[0-9]+)+$' then public.mediuse_catalog_compact(coalesce(i.observatory_code,'')) <> public.mediuse_catalog_compact(t.token)
 when t.token='καθετ' then not(i.search_text ~ '\mκαθετ' or i.search_text ~ '\mcath')
 when t.token='γαντ' then not(i.search_text ~ '\mγαντ' or i.search_text ~ '\mglove')
 else strpos(i.search_text,t.token)=0 and strpos(public.mediuse_catalog_normalize(i.observatory_code),t.token)=0
 and (public.mediuse_catalog_compact(t.token)='' or (strpos(i.search_compact,public.mediuse_catalog_compact(t.token))=0 and strpos(public.mediuse_catalog_compact(i.observatory_code),public.mediuse_catalog_compact(t.token))=0)) end)
),filtered as materialized (
 select * from matched where coalesce(p_supplier,'')='' or coalesce(supplier,'')=p_supplier
),ranked as (
 select f.*,row_number() over(order by
 case when p.sorting='relevance' then relevance end desc,
 case when p.sorting='alpha' then public.mediuse_catalog_normalize(description) end collate "el-x-icu" asc,
 case when p.sorting='purchase_asc' then price_purchase end asc nulls last,
 case when p.sorting='purchase_desc' then price_purchase end desc nulls last,
 case when p.sorting='observatory_asc' then price_observatory end asc nulls last,
 case when p.sorting='observatory_desc' then price_observatory end desc nulls last,
 case when p.sorting='relevance' then purchase_qty end desc,
 case when p.sorting='relevance' then code end asc,
 public.mediuse_catalog_normalize(description) collate "el-x-icu" asc,code asc) position
 from filtered f cross join parameters p
),page as (
 select code,ref,description,price_purchase,price_package,price_observatory,observatory_code,ekapty,supplier,relevance,position
 from ranked where(select q<>'' from parameters) order by position limit 20 offset greatest(coalesce(p_offset,0),0)
)
select jsonb_build_object(
 'items',coalesce((select jsonb_agg(to_jsonb(page)-'position' order by position) from page),'[]'::jsonb),
 'total',(select count(*) from filtered),
 'suppliers',coalesce((select jsonb_agg(jsonb_build_object('supplier',supplier,'count',n) order by n desc,supplier) from(select supplier,count(*) n from matched where coalesce(supplier,'')<>'' group by supplier) f),'[]'::jsonb),
 'meta',(select to_jsonb(m)-'updated_by' from public.mediuse_catalog_meta m where id)) $$;
create function public.mediuse_catalog_search(p_query text default '',p_supplier text default '',p_offset integer default 0) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$ select public.mediuse_catalog_search_v2(p_query,p_supplier,p_offset,'relevance') $$;
create function public.mediuse_catalog_validate(p_rows jsonb) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$ begin
if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 50000 then raise exception 'invalid_catalog'; end if;
if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'code') is distinct from 'string' or trim(r->>'code')='' or jsonb_typeof(r->'ref') is distinct from 'string' or trim(r->>'ref')='' or jsonb_typeof(r->'description') is distinct from 'string' or trim(r->>'description')='' or jsonb_typeof(r->'purchase_qty') is distinct from 'number' or(r->>'purchase_qty')::numeric<0 or exists(select 1 from unnest(array['price_purchase','price_package','price_observatory']) k where r->k is not null and r->k<>'null'::jsonb and(jsonb_typeof(r->k)<>'number' or(r->>k)::numeric<0))) then raise exception 'invalid_catalog_row'; end if;
if(select count(distinct r->>'code') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows) then raise exception 'duplicate_catalog_code'; end if;
end $$;
create function public.mediuse_catalog_preview(p_rows jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$ declare result jsonb; begin
if not exists(select 1 from public.mediuse_catalog_meta where id) then raise exception 'access_denied'; end if; perform public.mediuse_catalog_validate(p_rows);
with incoming as(select * from jsonb_to_recordset(p_rows) as x(code text,ref text,description text,purchase_qty numeric,price_purchase numeric,price_package numeric,price_observatory numeric,observatory_code text,ekapty text,supplier text))
select jsonb_build_object('total',jsonb_array_length(p_rows),'added',(select count(*) from incoming x left join public.mediuse_catalog_items i using(code) where i.code is null),'changed',(select count(*) from incoming x join public.mediuse_catalog_items i using(code) where row(x.ref,x.description,x.purchase_qty,x.price_purchase,x.price_package,x.price_observatory,x.observatory_code,x.ekapty,x.supplier) is distinct from row(i.ref,i.description,i.purchase_qty,i.price_purchase,i.price_package,i.price_observatory,i.observatory_code,i.ekapty,i.supplier)),'removed',(select count(*) from public.mediuse_catalog_items where code not in(select code from incoming)),'missing_prices',(select count(*) from incoming where price_purchase is null or price_package is null or price_observatory is null),'version',(select version from public.mediuse_catalog_meta where id)) into result; return result;
end $$;
create function public.mediuse_catalog_import(p_rows jsonb,p_source text,p_expected_version integer) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$ declare v integer; begin
select version into v from public.mediuse_catalog_meta where id for update; if v is null then raise exception 'access_denied'; end if; if v is distinct from p_expected_version then raise exception 'catalog_conflict'; end if; perform public.mediuse_catalog_validate(p_rows);
insert into public.mediuse_catalog_items(code,ref,description,purchase_qty,price_purchase,price_package,price_observatory,observatory_code,ekapty,supplier) select code,ref,description,purchase_qty,price_purchase,price_package,price_observatory,observatory_code,ekapty,supplier from jsonb_to_recordset(p_rows) as x(code text,ref text,description text,purchase_qty numeric,price_purchase numeric,price_package numeric,price_observatory numeric,observatory_code text,ekapty text,supplier text) on conflict(code) do update set ref=excluded.ref,description=excluded.description,purchase_qty=excluded.purchase_qty,price_purchase=excluded.price_purchase,price_package=excluded.price_package,price_observatory=excluded.price_observatory,observatory_code=excluded.observatory_code,ekapty=excluded.ekapty,supplier=excluded.supplier;
delete from public.mediuse_catalog_items where code not in(select r->>'code' from jsonb_array_elements(p_rows) r);
update public.mediuse_catalog_meta set version=v+1,updated_at=clock_timestamp(),source_name=left(p_source,200),row_count=jsonb_array_length(p_rows),updated_by=auth.uid() where id; return(select to_jsonb(m)-'updated_by' from public.mediuse_catalog_meta m where id);
end $$;
revoke all on function public.mediuse_catalog_normalize(text),public.mediuse_catalog_compact(text),public.mediuse_catalog_terms(text),public.mediuse_catalog_search(text,text,integer),public.mediuse_catalog_validate(jsonb),public.mediuse_catalog_preview(jsonb),public.mediuse_catalog_import(jsonb,text,integer) from public,anon;
grant execute on function public.mediuse_catalog_normalize(text),public.mediuse_catalog_compact(text),public.mediuse_catalog_terms(text),public.mediuse_catalog_search(text,text,integer),public.mediuse_catalog_validate(jsonb),public.mediuse_catalog_preview(jsonb),public.mediuse_catalog_import(jsonb,text,integer) to authenticated;

revoke all on function public.mediuse_catalog_search_v2(text,text,integer,text) from public,anon;
grant execute on function public.mediuse_catalog_search_v2(text,text,integer,text) to authenticated;
