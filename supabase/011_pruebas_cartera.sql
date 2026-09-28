-- =====================================================================
-- Aragón en línea · Pruebas de seguridad y validación de la cartera (Fase 3a)
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA, prueba las validaciones de la importación y quién ve qué,
-- y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS CARTERA: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 010 y 012.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000c001';
  u_cons  uuid := '00000000-0000-4000-8000-00000000c002';
  u_p1    uuid := '00000000-0000-4000-8000-00000000c011';
  u_p2    uuid := '00000000-0000-4000-8000-00000000c012';
  u_t1    uuid := '00000000-0000-4000-8000-00000000c021';
  perfil_t1 uuid;
  fila_ok jsonb := '[{"unidad":1,"saldo_anterior":600000,"cuota_administracion":600000,"cuota_extraordinaria":0,"parqueadero":0,"multas":0,"intereses_mora":12000,"pagos_periodo":0,"saldo_total":1212000},
                     {"unidad":2,"saldo_anterior":0,"cuota_administracion":600000,"pagos_periodo":600000,"saldo_total":0},
                     {"unidad":3,"saldo_anterior":-550000,"cuota_administracion":600000,"pagos_periodo":600000,"saldo_total":-550000}]';
  imp bigint;
  r jsonb; n bigint; ok boolean;
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
    create function pg_temp.servicio() returns void language plpgsql as $b$
    begin
      perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
      perform set_config('request.jwt.claim.sub', '', true);
      set local role service_role;
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

  -- Aislar: casas 1-3 sin cuentas reales y ninguna cartera real vigente durante la prueba (se deshace).
  update public.perfiles set estado = 'retirado' where unidad_id in (1, 2, 3) and estado in ('pendiente', 'activo');
  update public.cartera_importaciones set estado = 'anulada' where estado = 'publicada';

  insert into auth.users (id, email, aud, role) values
    (u_admin, 'pcartera.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'pcartera.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'pcartera.casa1@aragon.test', 'authenticated', 'authenticated'),
    (u_p2,    'pcartera.casa2@aragon.test', 'authenticated', 'authenticated'),
    (u_t1,    'pcartera.arrendatario1@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin cartera', 'pcartera.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo cartera', 'pcartera.consejo@aragon.test'),
    (u_p1,    1, 'propietario', 'activo', 'Propietario Uno', 'pcartera.casa1@aragon.test'),
    (u_p2,    2, 'propietario', 'activo', 'Propietario Dos', 'pcartera.casa2@aragon.test');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo, puede_ver_cuenta)
    values (u_t1, 1, 'arrendatario', 'activo', 'Arrendatario Uno', 'pcartera.arrendatario1@aragon.test', false)
    returning id into perfil_t1;

  -- ---------- 1. Validaciones de la importación ----------
  perform pg_temp.como(u_p1);
  r := public.importar_cartera(current_date, 'Prueba', 662000, 'x.xlsx', fila_ok);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1a: un residente importó cartera'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_cartera(current_date, 'Prueba', 999, 'x.xlsx', fila_ok);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1b: se publicó con un total distinto al del informe contable'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_cartera(current_date, 'Prueba', 0, 'x.xlsx', '[{"unidad":41,"saldo_total":0}]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1c: se aceptó una casa que no existe'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_cartera(current_date, 'Prueba', 0, 'x.xlsx', '[{"unidad":5,"saldo_total":0},{"unidad":5,"saldo_total":0}]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1d: se aceptó una casa repetida'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_cartera(current_date, 'Prueba', 700000, 'x.xlsx', '[{"unidad":5,"cuota_administracion":600000,"saldo_total":700000}]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1e: se aceptó un saldo que no cuadra con sus componentes'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_cartera(current_date, 'Prueba', 600000, 'x.xlsx', '[{"unidad":5,"cuota_administracion":600000.5,"saldo_total":600000.5}]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1f: se aceptaron centavos'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_cartera(current_date, 'Prueba', 1200000, 'x.xlsx',
         '[{"unidad":5,"saldo_anterior":600000,"cuota_administracion":600000,"saldo_total":1200000,"mora_1_30":600000,"mora_31_90":100000}]');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1g: se aceptó una antigüedad de deuda que no suma el saldo'); end if;

  select count(*) into n from public.cartera_importaciones where estado = 'publicada';
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1h: una importación con errores dejó datos guardados'); end if;

  perform pg_temp.como(u_admin);
  r := public.importar_cartera(current_date, 'Prueba', 662000, 'prueba.xlsx', fila_ok);
  perform pg_temp.base();
  total := total + 1;
  if not (r ->> 'ok')::boolean then
    fallas := array_append(fallas, '1i: una importación correcta fue rechazada: ' || coalesce(r ->> 'errores', r ->> 'mensaje', ''));
  end if;
  imp := (r ->> 'importacion')::bigint;

  -- ---------- 2. Quién ve qué ----------
  perform pg_temp.como(u_p1);
  select count(*) into n from public.cartera_unidad where unidad_id = 1;
  perform pg_temp.base();
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '2a: el propietario no ve su estado de cuenta'); end if;

  perform pg_temp.como(u_p1);
  select count(*) into n from public.cartera_unidad where unidad_id <> 1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2b: el propietario ve la cartera de otras casas'); end if;

  perform pg_temp.como(u_t1);
  select count(*) into n from public.cartera_unidad;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2c: el arrendatario ve la cuenta sin permiso del propietario'); end if;

  update public.perfiles set puede_ver_cuenta = true where id = perfil_t1;
  perform pg_temp.como(u_t1);
  select count(*) into n from public.cartera_unidad where unidad_id = 1;
  perform pg_temp.base();
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '2d: el arrendatario habilitado no ve la cuenta de su casa'); end if;

  perform pg_temp.como(u_cons);
  select count(*) into n from public.cartera_unidad;
  r := public.resumen_cartera();
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2e: el consejo ve el detalle por casa'); end if;
  total := total + 1;
  if r is null or (r ->> 'cartera_total')::bigint <> 1212000 or (r ->> 'casas_en_mora')::int <> 1 or (r ->> 'saldos_a_favor')::bigint <> 550000 then
    fallas := array_append(fallas, '2f: el resumen de cartera del consejo no es correcto: ' || coalesce(r::text, 'vacío'));
  end if;

  perform pg_temp.como(u_p1);
  r := public.resumen_cartera();
  select count(*) into n from public.cartera_importaciones;
  perform pg_temp.base();
  total := total + 1; if r is not null or n <> 0 then fallas := array_append(fallas, '2g: un residente ve los totales o el historial de cartera del conjunto'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.cartera_unidad;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2h: un visitante anónimo puede consultar la cartera'); end if;

  perform pg_temp.como(u_admin);
  select count(*) into n from public.cartera_unidad where importacion_id = imp;
  perform pg_temp.base();
  total := total + 1; if n <> 3 then fallas := array_append(fallas, '2i: la administración no ve el detalle por casa'); end if;

  -- ---------- 3. Configuración de pago ----------
  perform pg_temp.como(u_p1);
  update public.configuracion_pagos set url_pago = 'https://sitio-falso.example' where id = 1;
  get diagnostics n = row_count;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3a: un residente cambió el enlace de pago'); end if;

  perform pg_temp.como(u_admin);
  begin
    update public.configuracion_pagos set url_pago = 'http://inseguro.example' where id = 1;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3b: se aceptó un enlace de pago sin https'); end if;

  perform pg_temp.como(u_admin);
  update public.configuracion_pagos set url_pago = 'https://banco.example/pagos' where id = 1;
  get diagnostics n = row_count;
  perform pg_temp.base();
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '3c: la administración no pudo configurar el enlace de pago'); end if;

  -- Requiere 012: segundo botón (banco del convenio) y totales por antigüedad.
  perform pg_temp.como(u_p1);
  update public.configuracion_pagos set url_banco = 'https://sitio-falso.example' where id = 1;
  get diagnostics n = row_count;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3d: un residente cambió el enlace del banco'); end if;

  perform pg_temp.como(u_admin);
  begin
    update public.configuracion_pagos set url_banco = 'javascript:alert(1)' where id = 1;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3e: se aceptó un enlace del banco que no es https'); end if;

  perform pg_temp.como(u_cons);
  r := public.resumen_cartera();
  perform pg_temp.base();
  total := total + 1;
  if r -> 'edades' is null or (r -> 'edades' ->> 'sin_clasificar')::bigint <> 1212000 then
    fallas := array_append(fallas, '3f: los totales por antigüedad no son correctos: ' || coalesce((r -> 'edades')::text, 'vacío'));
  end if;

  -- ---------- 4. Anular y script ----------
  perform pg_temp.como(u_p2);
  r := public.admin_anular_importacion(imp);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '4a: un residente anuló una importación'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_anular_importacion(imp);
  perform pg_temp.base();
  perform pg_temp.como(u_p1);
  select count(*) into n from public.cartera_unidad;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '4b: los residentes siguen viendo una importación anulada'); end if;

  perform pg_temp.servicio();
  r := public.importar_cartera(current_date, 'Prueba script', 662000, 'script.xlsx', fila_ok, 'script');
  perform pg_temp.base();
  total := total + 1;
  if not (r ->> 'ok')::boolean or (select origen from public.cartera_importaciones where id = (r ->> 'importacion')::bigint) <> 'script' then
    fallas := array_append(fallas, '4c: el script de la administración no pudo importar: ' || coalesce(r ->> 'mensaje', ''));
  end if;

  perform pg_temp.como(null);
  begin
    r := public.importar_cartera(current_date, 'Prueba', 662000, 'x.xlsx', fila_ok);
    ok := not coalesce((r ->> 'ok')::boolean, false);
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '4d: un visitante anónimo importó cartera'); end if;

  -- Datos inválidos: mensaje claro, no error técnico.
  perform pg_temp.como(u_admin);
  begin
    r := public.importar_cartera(null, 'Prueba', 0, 'x.xlsx', '[]'::jsonb);
    ok := not (r ->> 'ok')::boolean and r ->> 'mensaje' is not null;
  exception when others then ok := false; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '9a: un dato inválido produjo un error técnico en vez de un mensaje'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS CARTERA: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS CARTERA: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
