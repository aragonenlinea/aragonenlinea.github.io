-- =====================================================================
-- Aragón en línea · Pruebas de cuentas institucionales, contraseña y suspensión
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS CUENTAS: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 022.
-- =====================================================================
do $$
declare
  u_admin  uuid := '00000000-0000-4000-8000-00000000a101';
  u_admin2 uuid := '00000000-0000-4000-8000-00000000a102';   -- administración CON contraseña
  u_cons   uuid := '00000000-0000-4000-8000-00000000a103';   -- consejo CON contraseña
  u_p1     uuid := '00000000-0000-4000-8000-00000000a111';   -- propietario casa 1 (con contraseña, como los residentes)
  u_p1b    uuid := '00000000-0000-4000-8000-00000000a112';   -- otra persona que quiere ser propietaria de la casa 1
  u_x      uuid := '00000000-0000-4000-8000-00000000a199';
  perfil_p1 uuid; perfil_admin uuid;
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
    create function pg_temp.base() returns void language plpgsql as $b$
    begin
      reset role;
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
    end $b$;
  $f$;

  -- Aislar: casa 1 sin cuentas reales durante la prueba (se deshace).
  update public.perfiles set estado = 'retirado' where unidad_id in (1) and estado in ('pendiente', 'activo', 'suspendido');
  insert into auth.users (id, email, aud, role) values
    (u_admin,  'pcta.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_admin2, 'pcta.admin2@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,   'pcta.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,     'pcta.casa1@aragon.test', 'authenticated', 'authenticated'),
    (u_p1b,    'pcta.casa1b@aragon.test', 'authenticated', 'authenticated'),
    (u_x,      'pcta.otro@aragon.test', 'authenticated', 'authenticated');
  -- "Contraseña" de prueba (solo importa que no esté vacía).
  update auth.users set encrypted_password = '$2a$10$contrasenaDePruebaNoReal' where id in (u_admin2, u_cons, u_p1);
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin cuentas', 'pcta.admin@aragon.test'),
    (u_admin2, null, 'administracion', 'activo', 'Admin con clave', 'pcta.admin2@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo con clave', 'pcta.consejo@aragon.test');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo)
    values (u_p1, 1, 'propietario', 'activo', 'Propietario Uno', 'pcta.casa1@aragon.test') returning id into perfil_p1;
  select id into perfil_admin from public.perfiles where user_id = u_admin;
  perform pg_temp.como(u_p1);
  insert into public.habitantes (unidad_id, perfil_id, nombre, relacion) values (1, perfil_p1, 'Habitante Uno', 'Titular');
  perform pg_temp.base();

  -- ---------- 1. Contraseña y permisos institucionales ----------
  perform pg_temp.como(u_admin);
  r := public.mi_estado();
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'es_admin')::boolean or (r ->> 'tiene_contrasena')::boolean or not (r ->> 'institucional')::boolean then
    fallas := array_append(fallas, '1a: la administración sin contraseña no quedó reconocida: ' || r::text); end if;

  perform pg_temp.como(u_admin2);
  r := public.mi_estado();
  select count(*) into n from public.perfiles where unidad_id = 1;
  perform pg_temp.base();
  total := total + 1; if (r ->> 'es_admin')::boolean or n <> 0 then
    fallas := array_append(fallas, '1b: una cuenta de administración con contraseña conservó sus permisos'); end if;

  perform pg_temp.como(u_cons);
  r := public.mi_estado();
  perform pg_temp.base();
  total := total + 1; if (r ->> 'es_consejo')::boolean then fallas := array_append(fallas, '1c: una cuenta del consejo con contraseña conservó sus permisos'); end if;

  perform pg_temp.como(u_p1);
  r := public.mi_estado();
  select count(*) into n from public.habitantes where unidad_id = 1;
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'tiene_contrasena')::boolean or n <> 1 then
    fallas := array_append(fallas, '1d: el propietario con contraseña perdió el acceso a su casa'); end if;

  -- ---------- 2. Cuentas separadas ----------
  begin
    insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values (u_admin, 2, 'propietario', 'pendiente', 'Admin en casa', 'pcta.admin@aragon.test');
    ok := false;
  exception when others then ok := true; end;
  total := total + 1; if not ok then fallas := array_append(fallas, '2a: una cuenta de administración registró una casa'); end if;

  begin
    insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values (u_p1, null, 'consejo', 'activo', 'Propietario consejero', 'pcta.casa1@aragon.test');
    ok := false;
  exception when others then ok := true; end;
  total := total + 1; if not ok then fallas := array_append(fallas, '2b: una cuenta con casa recibió cargo en el consejo'); end if;

  begin
    insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values (u_x, 3, 'propietario', 'pendiente', 'Otro vecino', 'pcta.otro@aragon.test');
    ok := true;
  exception when others then ok := false; end;
  total := total + 1; if not ok then fallas := array_append(fallas, '2c: una cuenta personal normal no pudo registrar su casa'); end if;

  -- ---------- 3. Suspender y reactivar ----------
  perform pg_temp.como(u_p1);
  r := public.admin_suspender_perfil(perfil_admin, 'Prueba de suspensión indebida');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3a: un propietario suspendió una cuenta'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_suspender_perfil(perfil_p1, 'corto');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3b: se suspendió sin un motivo suficiente'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_suspender_perfil(perfil_admin, 'Me suspendo a mí mismo');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3c: la administración suspendió su propia cuenta'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_suspender_perfil(perfil_p1, 'Uso indebido de la plataforma (prueba)');
  perform pg_temp.base();
  perform pg_temp.como(u_p1);
  select count(*) into n from public.habitantes where unidad_id = 1;
  r := public.mi_estado();
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3d: una cuenta suspendida sigue viendo los datos de su casa'); end if;
  total := total + 1; if not exists (select 1 from jsonb_array_elements(r -> 'perfiles') e
                                      where e ->> 'estado' = 'suspendido' and e ->> 'motivo_rechazo' like 'Uso indebido%') then
    fallas := array_append(fallas, '3e: la persona suspendida no ve el motivo'); end if;

  perform pg_temp.como(u_p1);
  r := public.admin_reactivar_perfil(perfil_p1);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3f: una cuenta suspendida se reactivó a sí misma'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_reactivar_perfil(perfil_p1);
  perform pg_temp.base();
  perform pg_temp.como(u_p1);
  select count(*) into n from public.habitantes where unidad_id = 1;
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean or n <> 1 then fallas := array_append(fallas, '3g: la reactivación no devolvió el acceso'); end if;

  -- Suspendido y, mientras tanto, otra persona quedó como propietaria: no se puede reactivar.
  perform pg_temp.como(u_admin);
  r := public.admin_suspender_perfil(perfil_p1, 'Segunda suspensión de prueba');
  perform pg_temp.base();
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values (u_p1b, 1, 'propietario', 'activo', 'Nuevo propietario', 'pcta.casa1b@aragon.test');
  perform pg_temp.como(u_admin);
  r := public.admin_reactivar_perfil(perfil_p1);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3h: se reactivó una cuenta chocando con otro propietario vigente'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_retirar_perfil(perfil_p1, 'Venta de la casa (prueba)');
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean or not exists (select 1 from public.perfiles where id = perfil_p1 and estado = 'retirado') then
    fallas := array_append(fallas, '3i: no se pudo retirar una cuenta suspendida'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS CUENTAS: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS CUENTAS: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
