-- =====================================================================
-- Aragón en línea · Pruebas del módulo financiero (presupuesto, ejecución y pagos del mes)
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS FINANZAS: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 013.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000d001';
  u_cons  uuid := '00000000-0000-4000-8000-00000000d002';
  u_p1    uuid := '00000000-0000-4000-8000-00000000d011';
  u_t1    uuid := '00000000-0000-4000-8000-00000000d021';
  u_x     uuid := '00000000-0000-4000-8000-00000000d099';
  anio_p smallint := 2099;
  pres jsonb := '[{"tipo":"ingreso","grupo":"INGRESOS OPERACIONALES","rubro":"Cuotas de administracion","valor_anual":237600000},
                  {"tipo":"ingreso","grupo":"INGRESOS OPERACIONALES","rubro":"Descuento pronto pago","valor_anual":0},
                  {"tipo":"gasto","grupo":"SERVICIOS","rubro":"Servicio de vigilancia","valor_anual":138504000},
                  {"tipo":"gasto","grupo":"HONORARIOS","rubro":"Administrador","valor_anual":13920000}]';
  ejec jsonb := '[{"tipo":"ingreso","rubro":"Cuotas de administracion","valor":24900000},
                  {"tipo":"ingreso","rubro":"descuento  PRONTO pago","valor":-1465000},
                  {"tipo":"gasto","rubro":"Servicio de vigilancia","valor":11541942},
                  {"tipo":"gasto","rubro":"Administrador","valor":1160000}]';
  pagos jsonb := '[{"fecha":"2099-07-15","rubro":"Servicio de vigilancia","beneficiario":"Seguridad Privada Prueba LTDA","concepto":"Saldo abril y julio","valor":23022720},
                   {"fecha":"2099-07-30","rubro":"Honorarios administrador","beneficiario":"","concepto":"Servicios de julio","valor":1585333}]';
  r jsonb; n bigint; ok boolean; iid bigint;
  total int := 0; fallas text[] := '{}';
begin
  execute $f$
    create function pg_temp.como(p_user uuid) returns void language plpgsql as $b$
    begin
      if p_user is null then
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims',
          json_build_object('sub', p_user, 'role', 'authenticated',
                            'email', (select email from auth.users where id = p_user))::text, true);
        perform set_config('request.jwt.claim.sub', p_user::text, true);
        set local role authenticated;
      end if;
    end $b$;
  $f$;
  execute $f$
    create function pg_temp.base() returns void language plpgsql as $b$
    begin
      reset role;
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
    end $b$;
  $f$;

  update public.perfiles set estado = 'retirado' where unidad_id in (1) and estado in ('pendiente', 'activo');
  insert into auth.users (id, email, aud, role) values
    (u_admin, 'pfin.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'pfin.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'pfin.casa1@aragon.test', 'authenticated', 'authenticated'),
    (u_t1,    'pfin.arrendatario1@aragon.test', 'authenticated', 'authenticated'),
    (u_x,     'pfin.extrano@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin fin', 'pfin.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo fin', 'pfin.consejo@aragon.test'),
    (u_p1,    1, 'propietario', 'activo', 'Propietario Uno', 'pfin.casa1@aragon.test'),
    (u_t1,    1, 'arrendatario', 'activo', 'Arrendatario Uno', 'pfin.arrendatario1@aragon.test');

  -- ---------- 1. Presupuesto ----------
  perform pg_temp.como(u_p1);
  r := public.importar_presupuesto(anio_p, current_date, null, 'p.xlsx', pres);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1a: un residente publicó el presupuesto'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_presupuesto(anio_p, current_date, null, 'p.xlsx',
         '[{"tipo":"gasto","grupo":"X","rubro":"Vigilancia","valor_anual":100},{"tipo":"gasto","grupo":"X","rubro":"vigilancia","valor_anual":5}]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1b: se aceptó un rubro repetido en el presupuesto'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_presupuesto(anio_p, current_date, null, 'p.xlsx', '[{"tipo":"gasto","grupo":"X","rubro":"Vigilancia","valor_anual":100.5}]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1c: se aceptaron centavos en el presupuesto'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_presupuesto(anio_p, current_date, 'Prueba', 'p.xlsx', pres);
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '1d: un presupuesto correcto fue rechazado: ' || coalesce(r ->> 'errores', r ->> 'mensaje', '')); end if;

  -- ---------- 2. Informe del mes ----------
  perform pg_temp.como(u_admin);
  r := public.importar_informe_mes(anio_p, 7::smallint, 23435000, 12701942, 24608053, 'i.xlsx',
         '[{"tipo":"gasto","rubro":"Rubro inventado","valor":1}]', '[]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2a: se aceptó un rubro que no está en el presupuesto'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_informe_mes(anio_p, 7::smallint, 23435000, 99, 24608053, 'i.xlsx', ejec, pagos);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2b: se publicó con un total de gastos distinto al del informe'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_informe_mes(anio_p, 7::smallint, 23435000, 12701942, 24608053, 'i.xlsx', ejec,
         '[{"rubro":"Honorarios contador","beneficiario":"Pedro Pérez Gómez","valor":24608053}]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2c: se publicó el nombre de una persona natural en los pagos'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_informe_mes(anio_p, 7::smallint, 23435000, 12701942, 1, 'i.xlsx', ejec, pagos);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2d: se publicó con un total de pagos distinto al del informe'); end if;

  perform pg_temp.como(u_p1);
  r := public.importar_informe_mes(anio_p, 7::smallint, 23435000, 12701942, 24608053, 'i.xlsx', ejec, pagos);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2e: un residente publicó un informe'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_informe_mes(anio_p, 7::smallint, 23435000, 12701942, 24608053, 'i.xlsx', ejec, pagos);
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '2f: un informe correcto fue rechazado: ' || coalesce(r ->> 'errores', r ->> 'mensaje', '')); end if;
  select id into iid from public.informes_mensuales where anio = anio_p and mes = 7 and estado = 'publicado';
  select count(*) into n from public.ejecucion_mensual where informe_id = iid and rubro = 'Descuento pronto pago';
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '2g: el rubro no quedó con el nombre exacto del presupuesto'); end if;

  -- ---------- 3. Quién ve ----------
  perform pg_temp.como(u_p1);
  select (select count(*) from public.presupuesto_rubros) + (select count(*) from public.ejecucion_mensual where informe_id = iid) + (select count(*) from public.pagos_mes where informe_id = iid) into n;
  perform pg_temp.base();
  total := total + 1; if n < 10 then fallas := array_append(fallas, '3a: el propietario no ve los informes'); end if;

  perform pg_temp.como(u_t1);
  select count(*) into n from public.ejecucion_mensual where informe_id = iid;
  perform pg_temp.base();
  total := total + 1; if n <> 4 then fallas := array_append(fallas, '3b: el arrendatario no ve los informes'); end if;

  perform pg_temp.como(u_cons);
  select count(*) into n from public.pagos_mes where informe_id = iid;
  perform pg_temp.base();
  total := total + 1; if n <> 2 then fallas := array_append(fallas, '3c: el consejo no ve los pagos del mes'); end if;

  perform pg_temp.como(u_x);
  select (select count(*) from public.presupuestos) + (select count(*) from public.ejecucion_mensual) + (select count(*) from public.pagos_mes) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3d: una cuenta sin casa aprobada ve los informes'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.pagos_mes;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3e: un visitante anónimo ve los informes'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into public.pagos_mes (informe_id, rubro, valor) values (iid, 'Falso', 1);
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3f: un residente agregó pagos directamente'); end if;

  -- ---------- 4. Anular ----------
  perform pg_temp.como(u_admin);
  r := public.admin_anular_financiero('informe', iid);
  perform pg_temp.base();
  perform pg_temp.como(u_p1);
  select count(*) into n from public.ejecucion_mensual where informe_id = iid;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '4a: los residentes siguen viendo un informe anulado'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS FINANZAS: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS FINANZAS: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
