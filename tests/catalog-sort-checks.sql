begin;
insert into public.mediuse_catalog_items(code,ref,description,purchase_qty,price_purchase,price_observatory,observatory_code,supplier) values
('__sort_test_1','TEST1','Ζήτα',10000,9,30,'998877.66','SortTest Supplier'),
('__sort_test_2','TEST2','Άλφα',10,0,null,'998877.66','SortTest Supplier'),
('__sort_test_3','TEST3','Βήτα',20,null,0,'998877.66','SortTest Supplier'),
('__sort_test_4','TEST4','Γάμμα',30,15,10,'998877.66','SortTest Supplier'),
('__sort_test_5','TEST5','Δέλτα',40,5,20,'998877.66','SortTest Supplier');
insert into public.mediuse_catalog_items(code,ref,description,purchase_qty,observatory_code,supplier) values ('__collision_99887766','OTHER','Unrelated item',1,'123.45','Other Supplier');
insert into public.mediuse_catalog_items(code,ref,description,purchase_qty,price_purchase,price_observatory,observatory_code,supplier)
select '__sort_page_'||lpad(n::text,3,'0'),'PAGE'||n,'Είδος '||n,n,46-n,46-n,'998877.77',case when n<=30 then 'SortPage A' else 'SortPage B' end from generate_series(1,45) n;
do $$
declare member_id uuid; r jsonb; got text[]; mode text; expected text[];
begin
 select user_id into member_id from public.mediuse_members where user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',member_id::text,true);execute 'set local role authenticated';
 r:=public.mediuse_catalog_search_v2('998877.66');
 if (r->>'total')::int<>5 or r->'items'->0->>'observatory_code'<>'998877.66' then raise exception 'Dotted observatory search failed';end if;
 if (public.mediuse_catalog_search_v2('99887766')->>'total')::int<>6 then raise exception 'Compact observatory search failed';end if;
 if (public.mediuse_catalog_search_v2('SortTest 998877.66')->>'total')::int<>5 then raise exception 'Supplier + observatory failed';end if;
 foreach mode in array array['relevance','alpha','purchase_asc','purchase_desc','observatory_asc','observatory_desc'] loop
  r:=public.mediuse_catalog_search_v2('998877.66','',0,mode);
  select array_agg(value->>'code' order by ord) into got from jsonb_array_elements(r->'items') with ordinality as t(value,ord);
  expected:=case mode when 'relevance' then array['1','5','4','3','2'] when 'alpha' then array['2','3','4','5','1'] when 'purchase_asc' then array['2','5','1','4','3'] when 'purchase_desc' then array['4','1','5','2','3'] when 'observatory_asc' then array['3','4','5','1','2'] when 'observatory_desc' then array['1','5','4','3','2'] end;
  if got<>(select array_agg('__sort_test_'||x) from unnest(expected) x) then raise exception 'Wrong sort order: %: %',mode,got;end if;
  if exists(select 1 from jsonb_array_elements(r->'items') x where x?'purchase_qty' or x?'position') then raise exception 'Internal sort fields leaked';end if;
 end loop;
 r:=public.mediuse_catalog_search_v2('998877.77','',20,'purchase_asc');
 if (r->'items'->0->>'price_purchase')::numeric<>21 or jsonb_array_length(r->'items')<>20 then raise exception 'Global pagination failed';end if;
 r:=public.mediuse_catalog_search_v2('998877.77','SortPage A',20,'purchase_asc');
 if (r->>'total')::int<>30 or (r->'items'->0->>'price_purchase')::numeric<>36 then raise exception 'Filter before sorting/pagination failed';end if;
 if public.mediuse_catalog_search_v2('998877.66','',0,'unknown')<>public.mediuse_catalog_search_v2('998877.66') then raise exception 'Invalid sort fallback failed';end if;
 if public.mediuse_catalog_search('998877.66')<>public.mediuse_catalog_search_v2('998877.66') then raise exception 'Old client compatibility failed';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 if (public.mediuse_catalog_search_v2('998877.66')->>'total')::int<>0 then raise exception 'Nonmember access allowed';end if;
 execute 'reset role';execute 'set local role anon';
 begin perform public.mediuse_catalog_search_v2('998877.66');raise exception 'Anonymous access allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
select 'PASS: dotted codes, combined query, six sort modes, zero/null prices, global pagination, filters and authorization; test rows rolled back' result;
