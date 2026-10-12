-- =====================================================================
-- Aragón en línea · Pruebas de la Mesa del Consejo
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS MESA DEL CONSEJO: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 027.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000c101';
  u_c1    uuid := '00000000-0000-4000-8000-00000000c102';
  u_c2    uuid := '00000000-0000-4000-8000-00000000c103';
  u_p1    uuid := '00000000-0000-4000-8000-00000000c111';
  pf_c1 uuid; pf_c2 uuid; pf_p1 uuid;
  reu bigint; inf bigint; sol bigint; doc bigint; comp bigint;
  ruta text := 'docs/2099/' || gen_random_uuid() || '.pdf';
  r jsonb; n bigint; ok boolean; txt text;
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
          json_build_object('sub', p_user, 'role', 'authenticated', 'email', (select email from auth.users where id = p_user))::text, true);
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

  update public.perfiles set estado = 'retirado' where unidad_id in (1) and estado in ('pendiente', 'activo', 'suspendido');
  update public.perfiles set cargo_consejo = null where cargo_consejo = 'presidente';   -- aislar (se deshace)
  insert into auth.users (id, email, aud, role) values
    (u_admin, 'pmesa.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_c1,    'pmesa.consejo1@aragon.test', 'authenticated', 'authenticated'),
    (u_c2,    'pmesa.consejo2@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'pmesa.casa1@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin mesa', 'pmesa.admin@aragon.test');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values (u_c1, null, 'consejo', 'activo', 'Consejero Uno', 'pmesa.consejo1@aragon.test') returning id into pf_c1;
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values (u_c2, null, 'consejo', 'activo', 'Consejera Dos', 'pmesa.consejo2@aragon.test') returning id into pf_c2;
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values (u_p1, 1, 'propietario', 'activo', 'Propietario Uno', 'pmesa.casa1@aragon.test') returning id into pf_p1;
  insert into storage.objects (bucket_id, name) values ('privados', ruta);
  insert into public.documentos_privados (titulo, categoria, fecha, audiencia, ruta, revisado_confirmado)
    values ('Acta de prueba', 'Actas de consejo', current_date, 'consejo', ruta, true) returning id into doc;

  -- ---------- 1. Integrantes ----------
  perform pg_temp.como(u_admin);
  r := public.admin_cargo_consejo(pf_c1, 'presidente');
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '1a: la administración no pudo asignar el cargo: ' || (r ->> 'mensaje')); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_cargo_consejo(pf_c2, 'presidente');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1b: quedaron dos presidentes'); end if;

  perform pg_temp.como(u_c1);
  r := public.admin_cargo_consejo(pf_c2, 'secretario');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1c: un consejero asignó cargos'); end if;

  perform pg_temp.como(u_c2);
  select count(*) into n from public.consejo_integrantes() where perfil_id in (pf_c1, pf_c2);
  perform pg_temp.base();
  total := total + 1; if n <> 2 then fallas := array_append(fallas, '1d: el consejo no ve a sus integrantes'); end if;

  perform pg_temp.como(u_p1);
  select count(*) into n from public.consejo_integrantes();
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1e: un propietario ve los integrantes del consejo'); end if;

  -- ---------- 2. Reuniones y asistencia ----------
  perform pg_temp.como(u_c1);
  begin
    insert into public.reuniones (tipo, fecha, lugar, orden_dia) values ('ordinaria', current_date + 10, 'Salón social', '1. Verificación del quórum') returning id into reu;
    ok := true;
  exception when others then ok := false; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2a: el consejo no pudo programar una reunión'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into public.reuniones (tipo, fecha) values ('ordinaria', current_date);
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2b: un propietario programó una reunión'); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into public.asistencia (reunion_id, perfil_id, estado) values (reu, pf_p1, 'presente');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2c: se registró asistencia de alguien que no es del consejo'); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into public.asistencia (reunion_id, perfil_id, estado) values (reu, pf_c1, 'presente'), (reu, pf_c2, 'excusado');
    ok := true;
  exception when others then ok := false; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2d: no se pudo registrar la asistencia del consejo'); end if;

  -- ---------- 3. Informe del administrador ----------
  perform pg_temp.como(u_admin);
  insert into public.informes_administrador (anio, mes, mantenimiento, estado, presentado_en) values (2099, 7, 'Cambio de bombillos', 'presentado', now()) returning id into inf;
  begin
    update public.informes_administrador set estado = 'aprobado' where id = inf;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3a: la administración aprobó su propio informe'); end if;

  perform pg_temp.como(u_admin);
  begin
    update public.informes_administrador set decision_por = u_admin where id = inf;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3b: la administración escribió quién decidió'); end if;

  perform pg_temp.como(u_admin);
  r := public.consejo_decidir_informe(inf, true, null);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3c: la administración registró la decisión del consejo'); end if;

  perform pg_temp.como(u_c2);
  r := public.consejo_decidir_informe(inf, false, 'no');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3d: se improbó el informe sin observaciones'); end if;

  perform pg_temp.como(u_c2);
  r := public.consejo_decidir_informe(inf, true, 'Aprobado sin observaciones', reu);
  perform pg_temp.base();
  perform pg_temp.como(u_admin);
  update public.informes_administrador set mantenimiento = 'Cambiado después' where id = inf;
  perform pg_temp.base();
  select mantenimiento into txt from public.informes_administrador where id = inf;
  total := total + 1; if not (r ->> 'ok')::boolean or txt <> 'Cambio de bombillos' then
    fallas := array_append(fallas, '3e: la decisión no quedó o la administración cambió un informe ya aprobado'); end if;

  -- ---------- 4. Solicitudes de autorización ----------
  perform pg_temp.como(u_admin);
  insert into public.solicitudes_autorizacion (tipo, titulo, valor) values ('Contrato mayor a 2 SMMLV', 'Pintura de fachadas', 6000000) returning id into sol;
  r := public.consejo_decidir_solicitud(sol, 'aprobada', null);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '4a: la administración aprobó su propia solicitud'); end if;

  perform pg_temp.como(u_c1);
  begin
    insert into public.solicitudes_autorizacion (tipo, titulo) values ('Otra', 'Solicitud del consejo');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '4b: un consejero creó una solicitud (las presenta la administración)'); end if;

  perform pg_temp.como(u_c1);
  r := public.consejo_decidir_solicitud(sol, 'aplazada', 'corto');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '4c: se aplazó sin motivo suficiente'); end if;

  perform pg_temp.como(u_c1);
  r := public.consejo_decidir_solicitud(sol, 'aplazada', 'Traer tres cotizaciones', reu);
  perform pg_temp.base();
  perform pg_temp.como(u_admin);
  update public.solicitudes_autorizacion set descripcion = 'Con tres cotizaciones', estado = 'pendiente' where id = sol;
  perform pg_temp.base();
  perform pg_temp.como(u_c2);
  r := public.consejo_decidir_solicitud(sol, 'aprobada', null, reu);
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '4d: no funcionó aplazar, completar y aprobar: ' || (r ->> 'mensaje')); end if;

  perform pg_temp.como(u_admin);
  update public.solicitudes_autorizacion set valor = 99999999 where id = sol;
  perform pg_temp.base();
  select count(*) into n from public.solicitudes_autorizacion where id = sol and valor = 6000000 and estado = 'aprobada' and decision_por = u_c2;
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '4e: la administración cambió una solicitud ya aprobada'); end if;

  -- ---------- 5. Acta ----------
  perform pg_temp.como(u_admin);
  update public.reuniones set acta_documento_id = doc, estado = 'realizada' where id = reu;
  r := public.consejo_aprobar_acta(reu);
  perform pg_temp.base();
  select acta_estado into txt from public.reuniones where id = reu;
  total := total + 1; if txt <> 'borrador' or (r ->> 'ok')::boolean then fallas := array_append(fallas, '5a: el acta no quedó en borrador o la administración la aprobó'); end if;

  perform pg_temp.como(u_c1);
  r := public.consejo_aprobar_acta(reu);
  perform pg_temp.base();
  perform pg_temp.como(u_admin);
  begin
    update public.reuniones set acta_documento_id = null where id = reu;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean or not ok then fallas := array_append(fallas, '5b: el consejo no pudo aprobar el acta o se cambió un acta aprobada'); end if;

  -- ---------- 6. Compromisos y obligaciones ----------
  perform pg_temp.como(u_c1);
  insert into public.compromisos (reunion_id, descripcion, responsable, fecha_limite) values (reu, 'Pedir cotizaciones de pintura', 'Administración', current_date + 15) returning id into comp;
  perform pg_temp.base();
  perform pg_temp.como(u_admin);
  update public.compromisos set estado = 'cumplido', avance = 'Tres cotizaciones recibidas' where id = comp;
  perform pg_temp.base();
  select count(*) into n from public.compromisos where id = comp and estado = 'cumplido';
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '6a: no se pudo crear o actualizar un compromiso'); end if;

  perform pg_temp.como(u_c1);
  begin
    insert into public.obligaciones (nombre) values ('Obligación del consejo');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '6b: un consejero creó una obligación (las mantiene la administración)'); end if;

  -- ---------- 7. Nadie más ve la Mesa ----------
  perform pg_temp.como(u_p1);
  select (select count(*) from public.reuniones) + (select count(*) from public.informes_administrador) + (select count(*) from public.solicitudes_autorizacion)
       + (select count(*) from public.compromisos) + (select count(*) from public.obligaciones) + (select count(*) from public.asistencia) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '7a: un propietario ve información de la Mesa del Consejo'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.reuniones;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '7b: un visitante anónimo ve las reuniones'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS MESA DEL CONSEJO: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS MESA DEL CONSEJO: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
