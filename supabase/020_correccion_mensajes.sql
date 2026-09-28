-- =====================================================================
-- Aragón en línea · Corrección de mensajes de error en las importaciones
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 019).
--
-- Qué corrige: cuando llegaba un dato inválido (por ejemplo, cartera sin fecha de corte o un
-- informe con un mes que no existe), en vez del mensaje explicativo salía un error técnico
-- ("malformed array literal"). Nunca se publicaba nada incorrecto; solo el mensaje era confuso.
-- Vuelve a crear importar_cartera, importar_presupuesto e importar_informe_mes con el arreglo.
-- Las reglas y validaciones son exactamente las mismas.
-- =====================================================================

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
