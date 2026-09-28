-- =====================================================================
-- Aragón en línea · Fase 3a · Cartera y estado de cuenta
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 001 a 009).
--
-- Reglas que hace cumplir:
--  * RLS en todas las tablas. Cada casa solo ve su propia cartera: el propietario
--    siempre; el arrendatario solo si el propietario lo habilitó (puede_ver_cuenta).
--  * El consejo solo ve totales. La administración ve el detalle y es quien importa.
--  * La importación se valida AQUÍ (no solo en la página): casas existentes y sin
--    repetir, montos en pesos enteros, saldo total = suma de componentes, total general
--    = total del informe contable. Si algo falla no se guarda nada.
--  * Cada importación queda en el historial. Una importación equivocada se anula (no se borra).
--  * La plataforma no cobra: la configuración de pago solo guarda el enlace del banco y
--    las instrucciones del convenio.
-- =====================================================================

create table public.cartera_importaciones (
  id bigint generated always as identity primary key,
  fecha_corte date not null,
  periodo text not null check (length(btrim(periodo)) between 3 and 40),
  total bigint not null,                 -- suma de saldo_total de todas las filas
  total_informe bigint not null,         -- total del informe contable escrito por quien importa
  filas integer not null,
  archivo text check (length(archivo) <= 200),
  origen text not null default 'panel' check (origen in ('panel', 'script')),
  estado text not null default 'publicada' check (estado in ('publicada', 'anulada')),
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  anulada_en timestamptz,
  anulada_por uuid references auth.users (id) on delete set null
);

create table public.cartera_unidad (
  id bigint generated always as identity primary key,
  importacion_id bigint not null references public.cartera_importaciones (id) on delete cascade,
  unidad_id smallint not null references public.unidades (id),
  fecha_corte date not null,
  periodo text not null,
  saldo_anterior bigint not null default 0,
  cuota_administracion bigint not null default 0,
  cuota_extraordinaria bigint not null default 0,
  parqueadero bigint not null default 0,
  multas bigint not null default 0,
  intereses_mora bigint not null default 0,
  pagos_periodo bigint not null default 0,
  saldo_total bigint not null,
  -- Antigüedad de la deuda (opcional, como la presenta la contabilidad).
  mora_1_30 bigint, mora_31_90 bigint, mora_91_180 bigint, mora_181_360 bigint, mora_mas_360 bigint,
  unique (importacion_id, unidad_id),
  check (saldo_total = saldo_anterior + cuota_administracion + cuota_extraordinaria + parqueadero
                       + multas + intereses_mora - pagos_periodo)
);
create index cartera_unidad_por_casa on public.cartera_unidad (unidad_id, fecha_corte desc);

-- Configuración del pago (una sola fila). Solo enlaces e instrucciones; ningún dato bancario de residentes.
create table public.configuracion_pagos (
  id smallint primary key default 1 check (id = 1),
  url_pago text check (url_pago is null or url_pago ~ '^https://[^\s]+$'),
  texto_boton text not null default 'Pagar' check (length(texto_boton) between 2 and 40),
  instrucciones text check (length(instrucciones) <= 1500),
  aviso_pronto_pago text check (length(aviso_pronto_pago) <= 300),
  actualizado_en timestamptz not null default now()
);
-- Datos del convenio tomados de un comprobante de Recaudo Empresarial Davivienda (sin datos personales).
-- El enlace de PSE (url_pago) se configura en el panel cuando la administración lo tenga.
insert into public.configuracion_pagos (id, instrucciones, aviso_pronto_pago) values
  (1, E'Banco Davivienda · Recaudo Empresarial\nConvenio: CONJUNTO RESIDENCIAL ARAGON · Código de convenio 01660018\nReferencia 1: el número de su casa ({casa})\nPuede pagar en oficinas y corresponsales Davivienda con estos datos, o en línea por PSE desde cualquier banco con el botón de pago.',
      'Pronto pago: si paga dentro de los 10 primeros días del mes, la cuota es de $550.000 (Circular 03-2026).');

alter table public.cartera_importaciones enable row level security;
alter table public.cartera_unidad enable row level security;
alter table public.configuracion_pagos enable row level security;

-- ¿Puede la persona ver la cuenta de esta casa? Propietario activo, o arrendatario vigente habilitado.
create or replace function privado.puede_ver_cuenta(p_unidad smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = (select auth.uid()) and p.unidad_id = p_unidad and p.estado = 'activo'
      and (p.vence_el is null or p.vence_el >= current_date)
      and (p.rol = 'propietario' or (p.rol = 'arrendatario' and p.puede_ver_cuenta))
  );
$$;
revoke execute on function privado.puede_ver_cuenta(smallint) from public, anon;
grant execute on function privado.puede_ver_cuenta(smallint) to authenticated;

-- ¿Quien llama es el script del PC de la administración (clave de servicio)?
create or replace function privado.es_servicio() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;
revoke execute on function privado.es_servicio() from public, anon;

-- ¿La importación está publicada? (Los residentes no pueden leer el historial de importaciones.)
create or replace function privado.importacion_publicada(p_importacion bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cartera_importaciones where id = p_importacion and estado = 'publicada');
$$;
revoke execute on function privado.importacion_publicada(bigint) from public, anon;
grant execute on function privado.importacion_publicada(bigint) to authenticated;

create policy "ver mi cartera" on public.cartera_unidad for select to authenticated
  using (
    (select privado.es_admin())
    or (privado.puede_ver_cuenta(unidad_id) and privado.importacion_publicada(importacion_id))
  );
create policy "admin ve importaciones" on public.cartera_importaciones for select to authenticated
  using ((select privado.es_admin()));
create policy "ver configuracion de pago" on public.configuracion_pagos for select to authenticated using (true);
create policy "admin cambia configuracion de pago" on public.configuracion_pagos for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));

revoke all on public.cartera_importaciones, public.cartera_unidad, public.configuracion_pagos from anon, authenticated;
grant select on public.cartera_importaciones, public.cartera_unidad, public.configuracion_pagos to authenticated;
grant update (url_pago, texto_boton, instrucciones, aviso_pronto_pago, actualizado_en) on public.configuracion_pagos to authenticated;

-- ---------------------------------------------------------------------
-- Importar cartera (panel o script). Todo o nada.
-- p_filas: [{"unidad":7,"saldo_anterior":0,"cuota_administracion":600000,...,"saldo_total":600000}, ...]
-- ---------------------------------------------------------------------
create or replace function public.importar_cartera(
  p_fecha_corte date, p_periodo text, p_total_informe bigint, p_archivo text, p_filas jsonb, p_origen text default 'panel'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  errores text[] := '{}';
  f jsonb;
  n integer := 0;
  suma bigint := 0;
  vistos smallint[] := '{}';
  u smallint;
  campos constant text[] := array['saldo_anterior', 'cuota_administracion', 'cuota_extraordinaria', 'parqueadero',
                                  'multas', 'intereses_mora', 'pagos_periodo', 'saldo_total'];
  edades constant text[] := array['mora_1_30', 'mora_31_90', 'mora_91_180', 'mora_181_360', 'mora_mas_360'];
  c text;
  v jsonb;
  calc bigint;
  suma_edades bigint;
  hay_edades boolean;
  imp bigint;
begin
  if not (privado.es_admin() or privado.es_servicio()) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede importar cartera.');
  end if;
  if p_fecha_corte is null or p_fecha_corte > privado.hoy() + 31 then
    errores := errores || 'La fecha de corte falta o no es válida.'::text;
  end if;
  if length(btrim(coalesce(p_periodo, ''))) < 3 then
    errores := errores || 'Falta el periodo (por ejemplo: Septiembre 2026).'::text;
  end if;
  if p_total_informe is null then
    errores := errores || 'Falta el total del informe contable.'::text;
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    errores := errores || 'El archivo no tiene filas.'::text;
  elsif jsonb_array_length(p_filas) > 40 then
    errores := errores || 'El archivo tiene más de 40 filas.'::text;
  end if;

  if array_length(errores, 1) is null then
    for f in select * from jsonb_array_elements(p_filas) loop
      n := n + 1;
      -- Casa
      if coalesce(f ->> 'unidad', '') !~ '^\d{1,3}$' then
        errores := errores || format('Fila %s: la casa "%s" no es un número.', n, coalesce(f ->> 'unidad', ''));
        continue;
      end if;
      u := (f ->> 'unidad')::smallint;
      if not exists (select 1 from public.unidades where id = u) then
        errores := errores || format('Fila %s: la Casa %s no existe.', n, u);
      elsif u = any (vistos) then
        errores := errores || format('Fila %s: la Casa %s está repetida.', n, u);
      end if;
      vistos := vistos || u;
      -- Montos: enteros (pesos sin decimales)
      foreach c in array campos || edades loop
        v := f -> c;
        if v is null or jsonb_typeof(v) = 'null' then
          if c = 'saldo_total' then errores := errores || format('Casa %s: falta el saldo total.', u); end if;
          continue;
        end if;
        if jsonb_typeof(v) <> 'number' or (v::text)::numeric <> trunc((v::text)::numeric) or abs((v::text)::numeric) > 1e12 then
          errores := errores || format('Casa %s: el valor de %s no es un número entero en pesos.', u, c);
        end if;
      end loop;
      if array_length(errores, 1) is not null then continue; end if;
      -- Cuadre de la fila
      calc := coalesce((f ->> 'saldo_anterior')::bigint, 0) + coalesce((f ->> 'cuota_administracion')::bigint, 0)
            + coalesce((f ->> 'cuota_extraordinaria')::bigint, 0) + coalesce((f ->> 'parqueadero')::bigint, 0)
            + coalesce((f ->> 'multas')::bigint, 0) + coalesce((f ->> 'intereses_mora')::bigint, 0)
            - coalesce((f ->> 'pagos_periodo')::bigint, 0);
      if calc <> (f ->> 'saldo_total')::bigint then
        errores := errores || format('Casa %s: el saldo total (%s) no cuadra con la suma de sus componentes (%s).',
                                     u, f ->> 'saldo_total', calc);
      end if;
      -- Antigüedad (opcional): si viene, debe sumar el saldo total cuando hay deuda.
      hay_edades := exists (select 1 from unnest(edades) e where f ? e and jsonb_typeof(f -> e) = 'number');
      if hay_edades then
        select coalesce(sum((f ->> e)::bigint), 0) into suma_edades from unnest(edades) e where f ? e and jsonb_typeof(f -> e) = 'number';
        if (f ->> 'saldo_total')::bigint > 0 and suma_edades <> (f ->> 'saldo_total')::bigint then
          errores := errores || format('Casa %s: la antigüedad de la deuda (%s) no suma el saldo total (%s).',
                                       u, suma_edades, f ->> 'saldo_total');
        end if;
      end if;
      suma := suma + (f ->> 'saldo_total')::bigint;
    end loop;

    if array_length(errores, 1) is null and suma <> p_total_informe then
      errores := errores || format('El total del archivo (%s) no coincide con el total del informe contable (%s).', suma, p_total_informe);
    end if;
  end if;

  if array_length(errores, 1) is not null then
    return jsonb_build_object('ok', false, 'mensaje', 'No se publicó: revise los errores.', 'errores', to_jsonb(errores[1:50]));
  end if;

  insert into public.cartera_importaciones (fecha_corte, periodo, total, total_informe, filas, archivo, origen, creado_por)
  values (p_fecha_corte, btrim(p_periodo), suma, p_total_informe, n, left(p_archivo, 200),
          case when p_origen = 'script' then 'script' else 'panel' end, auth.uid())
  returning id into imp;

  insert into public.cartera_unidad (importacion_id, unidad_id, fecha_corte, periodo, saldo_anterior, cuota_administracion,
    cuota_extraordinaria, parqueadero, multas, intereses_mora, pagos_periodo, saldo_total,
    mora_1_30, mora_31_90, mora_91_180, mora_181_360, mora_mas_360)
  select imp, (x ->> 'unidad')::smallint, p_fecha_corte, btrim(p_periodo),
    coalesce((x ->> 'saldo_anterior')::bigint, 0), coalesce((x ->> 'cuota_administracion')::bigint, 0),
    coalesce((x ->> 'cuota_extraordinaria')::bigint, 0), coalesce((x ->> 'parqueadero')::bigint, 0),
    coalesce((x ->> 'multas')::bigint, 0), coalesce((x ->> 'intereses_mora')::bigint, 0),
    coalesce((x ->> 'pagos_periodo')::bigint, 0), (x ->> 'saldo_total')::bigint,
    (x ->> 'mora_1_30')::bigint, (x ->> 'mora_31_90')::bigint, (x ->> 'mora_91_180')::bigint,
    (x ->> 'mora_181_360')::bigint, (x ->> 'mora_mas_360')::bigint
  from jsonb_array_elements(p_filas) x;

  return jsonb_build_object('ok', true, 'importacion', imp, 'filas', n, 'total', suma,
    'mensaje', format('Cartera publicada: %s casas, corte %s.', n, to_char(p_fecha_corte, 'DD/MM/YYYY')));
end;
$$;

-- Anular una importación equivocada (queda en el historial, deja de verse).
create or replace function public.admin_anular_importacion(p_importacion bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede anular importaciones.');
  end if;
  update public.cartera_importaciones set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid()
  where id = p_importacion and estado = 'publicada';
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La importación no existe o ya estaba anulada.');
  end if;
  return jsonb_build_object('ok', true, 'mensaje', 'Importación anulada. Los residentes ven de nuevo el corte anterior.');
end;
$$;

-- Totales de la última cartera publicada (administración y consejo). Sin detalle por casa.
create or replace function public.resumen_cartera() returns jsonb
language sql stable security definer set search_path = '' as $$
  with ultima as (
    select * from public.cartera_importaciones where estado = 'publicada'
    order by fecha_corte desc, id desc limit 1
  ), filas as (
    select cu.* from public.cartera_unidad cu join ultima on cu.importacion_id = ultima.id
  )
  select case when (privado.es_admin() or privado.es_consejo()) and exists (select 1 from ultima) then jsonb_build_object(
    'fecha_corte', (select fecha_corte from ultima),
    'periodo', (select periodo from ultima),
    'cartera_total', (select coalesce(sum(saldo_total), 0) from filas where saldo_total > 0),
    'saldos_a_favor', (select coalesce(-sum(saldo_total), 0) from filas where saldo_total < 0),
    'casas_en_mora', (select count(*) from filas where saldo_total > 0),
    'casas_al_dia', (select count(*) from filas where saldo_total <= 0) + (40 - (select count(*) from filas)),
    'casas_mora_mas_90', (select count(*) from filas
                          where coalesce(mora_91_180, 0) + coalesce(mora_181_360, 0) + coalesce(mora_mas_360, 0) > 0),
    'cartera_mas_360', (select coalesce(sum(mora_mas_360), 0) from filas)
  ) end;
$$;

create trigger auditar_cartera_importaciones after insert or update or delete on public.cartera_importaciones
  for each row execute function privado.auditar();
create trigger auditar_configuracion_pagos after insert or update or delete on public.configuracion_pagos
  for each row execute function privado.auditar();

revoke execute on function public.importar_cartera(date, text, bigint, text, jsonb, text),
  public.admin_anular_importacion(bigint), public.resumen_cartera() from public, anon;
grant execute on function public.importar_cartera(date, text, bigint, text, jsonb, text),
  public.admin_anular_importacion(bigint), public.resumen_cartera() to authenticated, service_role;
