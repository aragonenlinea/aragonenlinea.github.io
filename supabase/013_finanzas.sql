-- =====================================================================
-- Aragón en línea · Fase 3 · Informes financieros: presupuesto, ejecución mensual y pagos del mes
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 012).
--
-- Reglas que hace cumplir:
--  * RLS en todas las tablas. Ven los informes: propietarios, arrendatarios vigentes,
--    consejo y administración (cualquier cuenta activa). El público no.
--  * Solo la administración (o el script de su PC) importa, siempre con validaciones:
--    rubros existentes en el presupuesto del año, pesos enteros, totales iguales a los
--    del informe contable. Si algo falla no se guarda nada.
--  * En los pagos del mes no se publican nombres de personas naturales: el campo
--    "beneficiario" solo acepta empresas o entidades (SAS, LTDA, S.A., E.S.P., DIAN, ...).
--    Los pagos a personas se identifican por el rubro (ej.: "Honorarios administrador").
--  * Cada importación queda en el historial; una equivocada se anula (no se borra).
-- =====================================================================

create table public.presupuestos (
  id bigint generated always as identity primary key,
  anio smallint not null check (anio between 2020 and 2100),
  aprobado_en date,                                  -- fecha de la asamblea que lo aprobó
  nota text check (length(nota) <= 300),             -- ej.: "Aprobado en asamblea ordinaria, acta 01-2026"
  estado text not null default 'publicado' check (estado in ('publicado', 'anulado')),
  archivo text check (length(archivo) <= 200),
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);
create unique index presupuesto_vigente_por_anio on public.presupuestos (anio) where estado = 'publicado';

create table public.presupuesto_rubros (
  id bigint generated always as identity primary key,
  presupuesto_id bigint not null references public.presupuestos (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  grupo text not null check (length(btrim(grupo)) between 2 and 80),
  rubro text not null check (length(btrim(rubro)) between 2 and 80),
  orden integer not null,
  valor_anual bigint not null check (valor_anual >= 0),
  unique (presupuesto_id, tipo, rubro)
);

create table public.informes_mensuales (
  id bigint generated always as identity primary key,
  anio smallint not null,
  mes smallint not null check (mes between 1 and 12),
  total_ingresos bigint not null,
  total_gastos bigint not null,
  total_pagos bigint,
  estado text not null default 'publicado' check (estado in ('publicado', 'anulado')),
  archivo text check (length(archivo) <= 200),
  origen text not null default 'panel' check (origen in ('panel', 'script')),
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);
create unique index informe_vigente_por_mes on public.informes_mensuales (anio, mes) where estado = 'publicado';

create table public.ejecucion_mensual (
  id bigint generated always as identity primary key,
  informe_id bigint not null references public.informes_mensuales (id) on delete cascade,
  anio smallint not null,
  mes smallint not null,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  rubro text not null,
  valor bigint not null,                             -- puede ser negativo (ej.: descuentos por pronto pago)
  unique (informe_id, tipo, rubro)
);

create table public.pagos_mes (
  id bigint generated always as identity primary key,
  informe_id bigint not null references public.informes_mensuales (id) on delete cascade,
  fecha date,
  rubro text not null check (length(btrim(rubro)) between 2 and 80),
  beneficiario text check (length(beneficiario) <= 120),
  concepto text check (length(concepto) <= 200),
  valor bigint not null
);

alter table public.presupuestos enable row level security;
alter table public.presupuesto_rubros enable row level security;
alter table public.informes_mensuales enable row level security;
alter table public.ejecucion_mensual enable row level security;
alter table public.pagos_mes enable row level security;

-- ¿Puede ver los informes? Cualquier cuenta activa y vigente (propietario, arrendatario, consejo, administración).
create or replace function privado.puede_ver_finanzas() returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.es_admin() or privado.es_consejo() or exists (select 1 from privado.mis_perfiles());
$$;
create or replace function privado.presupuesto_publicado(p_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.presupuestos where id = p_id and estado = 'publicado');
$$;
create or replace function privado.informe_publicado(p_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.informes_mensuales where id = p_id and estado = 'publicado');
$$;
revoke execute on function privado.puede_ver_finanzas(), privado.presupuesto_publicado(bigint), privado.informe_publicado(bigint) from public, anon;
grant execute on function privado.puede_ver_finanzas(), privado.presupuesto_publicado(bigint), privado.informe_publicado(bigint) to authenticated;

create policy "ver presupuestos" on public.presupuestos for select to authenticated
  using ((select privado.es_admin()) or (estado = 'publicado' and (select privado.puede_ver_finanzas())));
create policy "ver rubros" on public.presupuesto_rubros for select to authenticated
  using ((select privado.es_admin()) or ((select privado.puede_ver_finanzas()) and privado.presupuesto_publicado(presupuesto_id)));
create policy "ver informes" on public.informes_mensuales for select to authenticated
  using ((select privado.es_admin()) or (estado = 'publicado' and (select privado.puede_ver_finanzas())));
create policy "ver ejecucion" on public.ejecucion_mensual for select to authenticated
  using ((select privado.es_admin()) or ((select privado.puede_ver_finanzas()) and privado.informe_publicado(informe_id)));
create policy "ver pagos" on public.pagos_mes for select to authenticated
  using ((select privado.es_admin()) or ((select privado.puede_ver_finanzas()) and privado.informe_publicado(informe_id)));

revoke all on public.presupuestos, public.presupuesto_rubros, public.informes_mensuales, public.ejecucion_mensual, public.pagos_mes from anon, authenticated;
grant select on public.presupuestos, public.presupuesto_rubros, public.informes_mensuales, public.ejecucion_mensual, public.pagos_mes to authenticated;

-- Utilidades de validación.
create or replace function privado.es_entero(v jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select v is not null and jsonb_typeof(v) = 'number' and (v::text)::numeric = trunc((v::text)::numeric) and abs((v::text)::numeric) <= 1e13;
$$;
create or replace function privado.clave_rubro(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'));
$$;
-- Beneficiario permitido: empresa o entidad (nunca nombres de personas naturales).
create or replace function privado.beneficiario_es_entidad(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t is null or btrim(t) = ''
      or upper(t) ~ '(^|[^A-Z])(S\.?\s?A\.?\s?S\.?|LTDA\.?|S\.?\s?A\.?|S\.?\s?EN\s?C\.?|E\.?\s?S\.?\s?P\.?|SOCIEDAD|COOPERATIVA|CORPORACI[OÓ]N|FUNDACI[OÓ]N|EMPRESA[S]?|BANCO|DAVIVIENDA|DIAN|MUNICIPIO|ALCALD[IÍ]A|GOBERNACI[OÓ]N|SUPERINTENDENCIA|ELECTROHUILA|EMPRESAS P[UÚ]BLICAS|CLARO|MOVISTAR|TIGO|SEGUROS|ASEGURADORA)([^A-Z]|$)';
$$;
revoke execute on function privado.es_entero(jsonb), privado.clave_rubro(text), privado.beneficiario_es_entidad(text) from public, anon;

-- ---------------------------------------------------------------------
-- Importar el presupuesto anual aprobado.
-- p_rubros: [{"tipo":"gasto","grupo":"SERVICIOS","rubro":"Servicio de vigilancia","valor_anual":138504000}, ...]
-- Reemplaza el presupuesto vigente de ese año (el anterior queda anulado en el historial).
-- ---------------------------------------------------------------------
create or replace function public.importar_presupuesto(
  p_anio smallint, p_aprobado_en date, p_nota text, p_archivo text, p_rubros jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  errores text[] := '{}';
  r jsonb; n integer := 0; claves text[] := '{}'; k text;
  pid bigint;
begin
  if not (privado.es_admin() or privado.es_servicio()) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede importar el presupuesto.');
  end if;
  if p_anio is null or p_anio not between 2020 and 2100 then errores := errores || 'El año no es válido.'::text; end if;
  if jsonb_typeof(p_rubros) <> 'array' or jsonb_array_length(p_rubros) = 0 then errores := errores || 'El archivo no tiene rubros.'::text;
  elsif jsonb_array_length(p_rubros) > 300 then errores := errores || 'El archivo tiene más de 300 rubros.'::text; end if;
  if array_length(errores, 1) is null then
    for r in select * from jsonb_array_elements(p_rubros) loop
      n := n + 1;
      if coalesce(r ->> 'tipo', '') not in ('ingreso', 'gasto') then errores := errores || format('Fila %s: el tipo debe ser "ingreso" o "gasto".', n); end if;
      if length(btrim(coalesce(r ->> 'grupo', ''))) < 2 then errores := errores || format('Fila %s: falta el grupo.', n); end if;
      if length(btrim(coalesce(r ->> 'rubro', ''))) < 2 then errores := errores || format('Fila %s: falta el rubro.', n); end if;
      if not privado.es_entero(r -> 'valor_anual') or (r ->> 'valor_anual')::numeric < 0 then
        errores := errores || format('Fila %s (%s): el valor anual debe ser un número entero en pesos, cero o mayor.', n, coalesce(r ->> 'rubro', ''));
      end if;
      k := coalesce(r ->> 'tipo', '') || '|' || privado.clave_rubro(r ->> 'rubro');
      if k = any (claves) then errores := errores || format('Fila %s: el rubro "%s" está repetido.', n, r ->> 'rubro'); end if;
      claves := claves || k;
    end loop;
  end if;
  if array_length(errores, 1) is not null then
    return jsonb_build_object('ok', false, 'mensaje', 'No se publicó: revise los errores.', 'errores', to_jsonb(errores[1:50]));
  end if;

  update public.presupuestos set estado = 'anulado' where anio = p_anio and estado = 'publicado';
  insert into public.presupuestos (anio, aprobado_en, nota, archivo, creado_por)
  values (p_anio, p_aprobado_en, nullif(btrim(coalesce(p_nota, '')), ''), left(p_archivo, 200), auth.uid())
  returning id into pid;
  insert into public.presupuesto_rubros (presupuesto_id, tipo, grupo, rubro, orden, valor_anual)
  select pid, x ->> 'tipo', btrim(x ->> 'grupo'), btrim(x ->> 'rubro'), o::integer, (x ->> 'valor_anual')::bigint
  from jsonb_array_elements(p_rubros) with ordinality as t(x, o);

  return jsonb_build_object('ok', true, 'mensaje', format('Presupuesto %s publicado con %s rubros.', p_anio, n));
end;
$$;

-- ---------------------------------------------------------------------
-- Importar el informe de un mes: ejecución por rubro y pagos realizados.
-- p_ejecucion: [{"tipo":"gasto","rubro":"Servicio de vigilancia","valor":11541942}, ...]
-- p_pagos:     [{"fecha":"2026-07-15","rubro":"Servicio de vigilancia","beneficiario":"Seguridad X LTDA","concepto":"...","valor":23022720}, ...]
-- ---------------------------------------------------------------------
create or replace function public.importar_informe_mes(
  p_anio smallint, p_mes smallint, p_total_ingresos bigint, p_total_gastos bigint, p_total_pagos bigint,
  p_archivo text, p_ejecucion jsonb, p_pagos jsonb default '[]'::jsonb, p_origen text default 'panel'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  errores text[] := '{}';
  pres bigint;
  r jsonb; n integer := 0; claves text[] := '{}'; k text;
  s_ing bigint := 0; s_gas bigint := 0; s_pag bigint := 0;
  iid bigint;
begin
  if not (privado.es_admin() or privado.es_servicio()) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede importar informes.');
  end if;
  if p_anio is null or p_mes is null or p_mes not between 1 and 12 then errores := errores || 'El año o el mes no son válidos.'::text; end if;
  select id into pres from public.presupuestos where anio = p_anio and estado = 'publicado';
  if pres is null then errores := errores || format('Primero publique el presupuesto de %s.', p_anio); end if;
  if p_total_ingresos is null or p_total_gastos is null then errores := errores || 'Escriba los totales de ingresos y gastos del informe contable.'::text; end if;
  if jsonb_typeof(p_ejecucion) <> 'array' or jsonb_array_length(p_ejecucion) = 0 then errores := errores || 'La hoja de ejecución no tiene filas.'::text; end if;
  if jsonb_typeof(coalesce(p_pagos, '[]')) <> 'array' then errores := errores || 'La hoja de pagos no es válida.'::text; end if;

  if array_length(errores, 1) is null then
    for r in select * from jsonb_array_elements(p_ejecucion) loop
      n := n + 1;
      if coalesce(r ->> 'tipo', '') not in ('ingreso', 'gasto') then
        errores := errores || format('Ejecución, fila %s: el tipo debe ser "ingreso" o "gasto".', n); continue;
      end if;
      if not exists (select 1 from public.presupuesto_rubros pr where pr.presupuesto_id = pres and pr.tipo = r ->> 'tipo'
                     and privado.clave_rubro(pr.rubro) = privado.clave_rubro(r ->> 'rubro')) then
        errores := errores || format('Ejecución, fila %s: el rubro de %s "%s" no está en el presupuesto %s (agréguelo al presupuesto, aunque sea con valor 0).',
                                     n, r ->> 'tipo', coalesce(r ->> 'rubro', ''), p_anio);
      end if;
      if not privado.es_entero(r -> 'valor') then
        errores := errores || format('Ejecución, fila %s (%s): el valor debe ser un número entero en pesos.', n, coalesce(r ->> 'rubro', '')); continue;
      end if;
      k := (r ->> 'tipo') || '|' || privado.clave_rubro(r ->> 'rubro');
      if k = any (claves) then errores := errores || format('Ejecución, fila %s: el rubro "%s" está repetido.', n, r ->> 'rubro'); end if;
      claves := claves || k;
      if r ->> 'tipo' = 'ingreso' then s_ing := s_ing + (r ->> 'valor')::bigint; else s_gas := s_gas + (r ->> 'valor')::bigint; end if;
    end loop;
    n := 0;
    for r in select * from jsonb_array_elements(coalesce(p_pagos, '[]')) loop
      n := n + 1;
      if length(btrim(coalesce(r ->> 'rubro', ''))) < 2 then errores := errores || format('Pagos, fila %s: falta el rubro.', n); end if;
      if not privado.es_entero(r -> 'valor') then
        errores := errores || format('Pagos, fila %s: el valor debe ser un número entero en pesos.', n); continue;
      end if;
      if not privado.beneficiario_es_entidad(r ->> 'beneficiario') then
        errores := errores || format('Pagos, fila %s: "%s" parece el nombre de una persona. Deje el beneficiario vacío y use el rubro (ej.: Honorarios administrador).', n, r ->> 'beneficiario');
      end if;
      if r ? 'fecha' and coalesce(r ->> 'fecha', '') <> '' and (r ->> 'fecha') !~ '^\d{4}-\d{2}-\d{2}$' then
        errores := errores || format('Pagos, fila %s: la fecha debe ser año-mes-día.', n);
      end if;
      s_pag := s_pag + (r ->> 'valor')::bigint;
    end loop;
    if s_ing <> p_total_ingresos then errores := errores || format('Los ingresos del archivo (%s) no coinciden con el total de ingresos del informe (%s).', s_ing, p_total_ingresos); end if;
    if s_gas <> p_total_gastos then errores := errores || format('Los gastos del archivo (%s) no coinciden con el total de gastos del informe (%s).', s_gas, p_total_gastos); end if;
    if n > 0 and (p_total_pagos is null or s_pag <> p_total_pagos) then
      errores := errores || format('Los pagos del archivo (%s) no coinciden con el total de pagos del informe (%s).', s_pag, coalesce(p_total_pagos::text, 'sin total'));
    end if;
  end if;

  if array_length(errores, 1) is not null then
    return jsonb_build_object('ok', false, 'mensaje', 'No se publicó: revise los errores.', 'errores', to_jsonb(errores[1:50]));
  end if;

  update public.informes_mensuales set estado = 'anulado' where anio = p_anio and mes = p_mes and estado = 'publicado';
  insert into public.informes_mensuales (anio, mes, total_ingresos, total_gastos, total_pagos, archivo, origen, creado_por)
  values (p_anio, p_mes, p_total_ingresos, p_total_gastos, case when n > 0 then p_total_pagos end, left(p_archivo, 200),
          case when p_origen = 'script' then 'script' else 'panel' end, auth.uid())
  returning id into iid;
  -- Se guarda el rubro con el nombre exacto del presupuesto.
  insert into public.ejecucion_mensual (informe_id, anio, mes, tipo, rubro, valor)
  select iid, p_anio, p_mes, x ->> 'tipo',
         (select pr.rubro from public.presupuesto_rubros pr where pr.presupuesto_id = pres and pr.tipo = x ->> 'tipo'
            and privado.clave_rubro(pr.rubro) = privado.clave_rubro(x ->> 'rubro') limit 1),
         (x ->> 'valor')::bigint
  from jsonb_array_elements(p_ejecucion) x;
  insert into public.pagos_mes (informe_id, fecha, rubro, beneficiario, concepto, valor)
  select iid, nullif(x ->> 'fecha', '')::date, btrim(x ->> 'rubro'), nullif(btrim(coalesce(x ->> 'beneficiario', '')), ''),
         nullif(btrim(coalesce(x ->> 'concepto', '')), ''), (x ->> 'valor')::bigint
  from jsonb_array_elements(coalesce(p_pagos, '[]')) x;

  return jsonb_build_object('ok', true, 'mensaje', format('Informe de %s/%s publicado.', lpad(p_mes::text, 2, '0'), p_anio));
end;
$$;

create or replace function public.admin_anular_financiero(p_tipo text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede anular.');
  end if;
  if p_tipo = 'presupuesto' then
    update public.presupuestos set estado = 'anulado' where id = p_id and estado = 'publicado';
  elsif p_tipo = 'informe' then
    update public.informes_mensuales set estado = 'anulado' where id = p_id and estado = 'publicado';
  else
    return jsonb_build_object('ok', false, 'mensaje', 'Tipo no válido.');
  end if;
  if not found then return jsonb_build_object('ok', false, 'mensaje', 'No existe o ya estaba anulado.'); end if;
  return jsonb_build_object('ok', true, 'mensaje', 'Anulado. Queda en el historial.');
end;
$$;

create trigger auditar_presupuestos after insert or update or delete on public.presupuestos
  for each row execute function privado.auditar();
create trigger auditar_informes after insert or update or delete on public.informes_mensuales
  for each row execute function privado.auditar();

revoke execute on function public.importar_presupuesto(smallint, date, text, text, jsonb),
  public.importar_informe_mes(smallint, smallint, bigint, bigint, bigint, text, jsonb, jsonb, text),
  public.admin_anular_financiero(text, bigint) from public, anon;
grant execute on function public.importar_presupuesto(smallint, date, text, text, jsonb),
  public.importar_informe_mes(smallint, smallint, bigint, bigint, bigint, text, jsonb, jsonb, text),
  public.admin_anular_financiero(text, bigint) to authenticated, service_role;
