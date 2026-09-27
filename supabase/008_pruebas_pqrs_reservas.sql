-- =====================================================================
-- Aragón en línea · Pruebas de seguridad de PQRS, reservas y comunicados (entrega 2b)
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea usuarios y datos de PRUEBA, simula a cada uno intentando ver o cambiar lo que
-- no debe y al final DESHACE TODO (no deja datos). El resultado sale en ROJO a propósito:
--   "PRUEBAS 2b: NN de NN correctas" → todo bien.
--   Si dice "FALLARON", copie el mensaje completo y envíelo al equipo técnico.
-- Requiere haber aplicado 001 a 007.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000b001';
  u_cons  uuid := '00000000-0000-4000-8000-00000000b002';
  u_p1    uuid := '00000000-0000-4000-8000-00000000b011';  -- propietario Casa 1
  u_p2    uuid := '00000000-0000-4000-8000-00000000b012';  -- propietario Casa 2
  u_t1    uuid := '00000000-0000-4000-8000-00000000b021';  -- arrendatario Casa 1
  perfil_p1 uuid; perfil_t1 uuid;
  q1 uuid; qt1 uuid; res1 uuid; com_oculto bigint;
  fecha_ok date := ((now() at time zone 'UTC') - interval '5 hours')::date + 100;
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

  -- ---------- Datos de prueba ----------
  -- Aislar las Casas 1 y 2 y la fecha de prueba de datos reales (se deshace al final).
  update public.perfiles set estado = 'retirado' where unidad_id in (1, 2) and estado in ('pendiente', 'activo');
  update public.reservas set estado = 'cancelada' where fecha = fecha_ok and estado in ('pendiente', 'aprobada');

  insert into auth.users (id, email, aud, role) values
    (u_admin, 'prueba2b.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'prueba2b.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'prueba2b.casa1@aragon.test', 'authenticated', 'authenticated'),
    (u_p2,    'prueba2b.casa2@aragon.test', 'authenticated', 'authenticated'),
    (u_t1,    'prueba2b.arrendatario1@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin 2b', 'prueba2b.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo 2b', 'prueba2b.consejo@aragon.test'),
    (u_p2,    2, 'propietario', 'activo', 'Propietario Dos', 'prueba2b.casa2@aragon.test');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo)
    values (u_p1, 1, 'propietario', 'activo', 'Propietario Uno', 'prueba2b.casa1@aragon.test') returning id into perfil_p1;
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo, vence_el)
    values (u_t1, 1, 'arrendatario', 'activo', 'Arrendatario Uno', 'prueba2b.arrendatario1@aragon.test', fecha_ok + 200)
    returning id into perfil_t1;

  -- ---------- 1. PQRS ----------
  perform pg_temp.como(u_p1);
  r := public.radicar_pqrs(1::smallint, 'Queja', 'Ruido nocturno', 'Música alta después de medianoche.');
  perform pg_temp.base();
  total := total + 1;
  if not (r ->> 'ok')::boolean or (r ->> 'radicado') !~ '^PQ-\d{4}-\d{4,}$' then
    fallas := array_append(fallas, '1a: el propietario no pudo radicar o el radicado no tiene el formato: ' || coalesce(r ->> 'mensaje', ''));
  end if;
  select id into q1 from public.pqrs where perfil_id = perfil_p1;

  perform pg_temp.como(u_p2);
  r := public.radicar_pqrs(1::smallint, 'Petición', 'Intruso', 'Radicando a nombre de otra casa.');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1b: se radicó una PQRS a nombre de otra casa'); end if;

  perform pg_temp.como(u_p2);
  select count(*) into n from public.pqrs where id = q1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1c: otra casa ve la PQRS'); end if;

  perform pg_temp.como(u_t1);
  select count(*) into n from public.pqrs where id = q1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1d: el arrendatario ve la PQRS del propietario'); end if;

  perform pg_temp.como(u_t1);
  r := public.radicar_pqrs(1::smallint, 'Petición', 'Bombillo dañado', 'El bombillo del frente de la casa no funciona.');
  perform pg_temp.base();
  select id into qt1 from public.pqrs where perfil_id = perfil_t1;
  perform pg_temp.como(u_p1);
  select count(*) into n from public.pqrs where id = qt1;
  perform pg_temp.base();
  total := total + 1; if qt1 is null or n <> 0 then fallas := array_append(fallas, '1e: el propietario ve la PQRS del arrendatario (o el arrendatario no pudo radicar)'); end if;

  perform pg_temp.como(u_p1);
  begin
    update public.pqrs set estado = 'respondida' where id = q1;
    get diagnostics n = row_count;
    ok := (n = 0);
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1f: el residente cambió el estado de su PQRS'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into public.pqrs (radicado, unidad_id, perfil_id, tipo, asunto, descripcion)
      values ('PQ-FALSO', 1, perfil_p1, 'Queja', 'Directo', 'Insertando sin pasar por la función.');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1g: se creó una PQRS sin radicado oficial'); end if;

  perform pg_temp.como(u_p2);
  r := public.escribir_pqrs(q1, 'Me meto en la conversación ajena');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1h: otra casa escribió en una PQRS ajena'); end if;

  perform pg_temp.como(u_admin);
  r := public.escribir_pqrs(q1, 'Se habló con la casa vecina.');
  perform pg_temp.base();
  select estado::text into txt from public.pqrs where id = q1;
  total := total + 1; if txt <> 'respondida' then fallas := array_append(fallas, '1i: la respuesta de la administración no quedó registrada'); end if;

  perform pg_temp.como(u_p1);
  select count(*) into n from public.pqrs_mensajes where pqrs_id = q1;
  perform pg_temp.base();
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '1j: el residente no ve la respuesta a su PQRS'); end if;

  perform pg_temp.como(u_p2);
  select count(*) into n from public.pqrs_mensajes where pqrs_id = q1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1k: otra casa ve la respuesta de una PQRS ajena'); end if;

  perform pg_temp.como(u_p1);
  r := public.escribir_pqrs(q1, 'Sigue pasando.');
  perform pg_temp.base();
  select estado::text into txt from public.pqrs where id = q1;
  total := total + 1; if txt <> 'en_tramite' then fallas := array_append(fallas, '1l: el mensaje del residente no reabrió la PQRS'); end if;

  perform pg_temp.como(u_cons);
  select count(*) into n from public.pqrs;
  r := public.resumen_pqrs();
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1m: el consejo ve el contenido de las PQRS'); end if;
  total := total + 1; if r is null or (r ->> 'total')::int < 2 then fallas := array_append(fallas, '1n: el consejo no ve los totales de PQRS'); end if;

  perform pg_temp.como(u_p1);
  r := public.resumen_pqrs();
  perform pg_temp.base();
  total := total + 1; if r is not null then fallas := array_append(fallas, '1o: un residente ve los totales de PQRS del conjunto'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.pqrs;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1p: un visitante anónimo puede consultar PQRS'); end if;

  -- ---------- 2. Reservas ----------
  perform pg_temp.como(u_p1);
  r := public.solicitar_reserva(1::smallint, 'salon', (((now() at time zone 'UTC') - interval '5 hours')::date + 3), 'noche', 30);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2a: se aceptó una reserva del salón sin la anticipación mínima'); end if;

  perform pg_temp.como(u_p1);
  r := public.solicitar_reserva(1::smallint, 'salon', fecha_ok, 'noche', 80);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2b: se aceptó una reserva por encima de la capacidad'); end if;

  perform pg_temp.como(u_p1);
  r := public.solicitar_reserva(1::smallint, 'salon', fecha_ok, 'noche', 30, 'Cumpleaños');
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '2c: una reserva válida fue rechazada: ' || coalesce(r ->> 'mensaje', '')); end if;
  select id into res1 from public.reservas where perfil_id = perfil_p1 and fecha = fecha_ok;

  perform pg_temp.como(u_p2);
  r := public.solicitar_reserva(2::smallint, 'salon', fecha_ok, 'noche', 20);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2d: se reservó dos veces el mismo turno'); end if;

  perform pg_temp.como(u_p2);
  r := public.solicitar_reserva(2::smallint, 'salon', fecha_ok, 'dia', 20);
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '2e: no se pudo reservar otro turno libre del mismo día: ' || coalesce(r ->> 'mensaje', '')); end if;

  perform pg_temp.como(u_p2);
  select count(*) into n from public.disponibilidad('salon', fecha_ok, fecha_ok);
  perform pg_temp.base();
  total := total + 1; if n <> 2 then fallas := array_append(fallas, '2f: la disponibilidad no muestra los turnos ocupados'); end if;

  perform pg_temp.como(u_p2);
  select count(*) into n from public.reservas where id = res1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2g: otra casa ve quién hizo una reserva'); end if;

  perform pg_temp.como(u_p2);
  r := public.cancelar_reserva(res1);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2h: otra casa canceló una reserva ajena'); end if;

  perform pg_temp.como(u_p1);
  begin
    update public.reservas set estado = 'aprobada' where id = res1;
    get diagnostics n = row_count;
    ok := (n = 0);
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2i: el residente aprobó su propia reserva'); end if;

  perform pg_temp.como(u_p2);
  r := public.admin_revisar_reserva(res1, true);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '2j: un residente usó la función de aprobar reservas'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_revisar_reserva(res1, true);
  perform pg_temp.base();
  select estado::text into txt from public.reservas where id = res1;
  total := total + 1; if txt <> 'aprobada' then fallas := array_append(fallas, '2k: la administración no pudo aprobar la reserva'); end if;

  perform pg_temp.como(u_p1);
  r := public.cancelar_reserva(res1);
  perform pg_temp.base();
  select estado::text into txt from public.reservas where id = res1;
  total := total + 1; if txt <> 'cancelada' then fallas := array_append(fallas, '2l: el residente no pudo cancelar su reserva'); end if;

  perform pg_temp.como(u_t1);
  r := public.solicitar_reserva(1::smallint, 'salon', fecha_ok, 'noche', 25);
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '2m: el turno cancelado no quedó libre o el arrendatario no pudo reservar: ' || coalesce(r ->> 'mensaje', '')); end if;

  perform pg_temp.como(u_cons);
  select count(*) into n from public.reservas;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2n: el consejo ve quién hace las reservas'); end if;

  -- ---------- 3. Comunicados ----------
  perform pg_temp.como(null);
  select count(*) into n from public.comunicados where publicado;
  perform pg_temp.base();
  total := total + 1; if n < 1 then fallas := array_append(fallas, '3a: el público no ve los comunicados publicados'); end if;

  perform pg_temp.como(u_admin);
  insert into public.comunicados (categoria, titulo, texto, publicado) values ('Mantenimiento', 'Borrador interno', 'Texto de prueba', false)
    returning id into com_oculto;
  perform pg_temp.base();

  perform pg_temp.como(null);
  select count(*) into n from public.comunicados where id = com_oculto;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3b: el público ve un comunicado no publicado'); end if;

  perform pg_temp.como(null);
  begin
    insert into public.comunicados (categoria, titulo, texto) values ('Seguridad', 'Falso', 'Comunicado falso');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3c: un visitante anónimo publicó un comunicado'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into public.comunicados (categoria, titulo, texto) values ('Seguridad', 'Falso', 'Comunicado falso');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3d: un residente publicó un comunicado'); end if;

  perform pg_temp.como(u_p1);
  update public.comunicados set titulo = 'Alterado' where id = com_oculto;
  get diagnostics n = row_count;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3e: un residente modificó un comunicado'); end if;

  perform pg_temp.como(u_admin);
  update public.comunicados set publicado = true where id = com_oculto;
  get diagnostics n = row_count;
  perform pg_temp.base();
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '3f: la administración no pudo publicar un comunicado'); end if;

  -- ---------- Resultado (se deshace todo) ----------
  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS 2b: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS 2b: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
