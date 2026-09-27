-- =====================================================================
-- Aragón en línea · Pruebas de seguridad (reglas de acceso por casa y por rol)
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea usuarios y datos de PRUEBA, simula a cada uno intentando ver o cambiar
-- lo que no debe, y al final DESHACE TODO. No deja ningún dato guardado.
--
-- El resultado aparece como un mensaje en ROJO (es a propósito: así se deshacen
-- los cambios). Léalo:
--   "PRUEBAS DE SEGURIDAD: 57 de 57 correctas"  → todo bien (requiere haber aplicado 005).
--   Si dice "FALLARON", copie el mensaje completo y envíelo al equipo técnico.
-- =====================================================================
do $$
declare
  -- Usuarios de prueba
  u_admin  uuid := '00000000-0000-4000-8000-00000000a001';
  u_cons   uuid := '00000000-0000-4000-8000-00000000a002';
  u_p1     uuid := '00000000-0000-4000-8000-00000000a011';  -- propietario Casa 1
  u_p2     uuid := '00000000-0000-4000-8000-00000000a012';  -- propietario Casa 2
  u_t1     uuid := '00000000-0000-4000-8000-00000000a021';  -- arrendatario Casa 1
  u_n3     uuid := '00000000-0000-4000-8000-00000000a033';  -- nuevo propietario Casa 3
  u_x      uuid := '00000000-0000-4000-8000-00000000a099';  -- usuario sin casa
  version_activa text;
  perfil_p1 uuid; perfil_p2 uuid; perfil_t1 uuid; perfil_n3 uuid;
  hab_p1 uuid; hab_t1 uuid;
  r jsonb; n bigint; ok boolean; txt text; codigo text;
  total int := 0; fallas text[] := '{}';
begin
  -- ---------- Utilidades ----------
  -- Actuar como un usuario (null = visitante anónimo) o volver a administrador de la base.
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

  -- ---------- Datos de prueba (como administrador de la base) ----------
  select version into version_activa from public.politicas where activa;
  if version_activa is null then
    raise exception 'No hay una política activa. Ejecute primero 002_datos_iniciales.sql.';
  end if;

  insert into auth.users (id, email, aud, role) values
    (u_admin, 'prueba.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'prueba.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'prueba.casa1@aragon.test', 'authenticated', 'authenticated'),
    (u_p2,    'prueba.casa2@aragon.test', 'authenticated', 'authenticated'),
    (u_t1,    'prueba.arrendatario1@aragon.test', 'authenticated', 'authenticated'),
    (u_n3,    'prueba.casa3@aragon.test', 'authenticated', 'authenticated'),
    (u_x,     'prueba.extrano@aragon.test', 'authenticated', 'authenticated');

  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Administración de prueba', 'prueba.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo de prueba', 'prueba.consejo@aragon.test');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo)
    values (u_p1, 1, 'propietario', 'activo', 'Propietario Uno', 'prueba.casa1@aragon.test') returning id into perfil_p1;
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo)
    values (u_p2, 2, 'propietario', 'activo', 'Propietario Dos', 'prueba.casa2@aragon.test') returning id into perfil_p2;
  insert into public.autorizaciones_datos (user_id, correo, politica_version)
    select id, email, version_activa from auth.users where id in (u_admin, u_cons, u_p1, u_p2, u_n3);

  -- ---------- 1. Mi hogar: cada casa solo lo suyo ----------
  perform pg_temp.como(u_p1);
  insert into public.habitantes (unidad_id, perfil_id, nombre, relacion, estado)
    values (1, perfil_p1, 'Habitante Uno', 'Titular', 'validado') returning id, estado::text into hab_p1, txt;
  perform pg_temp.base();
  total := total + 1; if txt <> 'pendiente' then fallas := array_append(fallas, '1a: un residente pudo marcar su registro como validado'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into public.habitantes (unidad_id, perfil_id, nombre, relacion) values (2, perfil_p1, 'Intruso', 'Otro');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1b: un residente registró datos en otra casa'); end if;

  perform pg_temp.como(u_p2);
  select count(*) into n from public.habitantes where unidad_id = 1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1c: la Casa 2 ve habitantes de la Casa 1'); end if;

  perform pg_temp.como(u_p2);
  update public.habitantes set nombre = 'Cambiado' where id = hab_p1;
  get diagnostics n = row_count;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1d: la Casa 2 modificó un habitante de la Casa 1'); end if;

  perform pg_temp.como(u_p2);
  delete from public.habitantes where id = hab_p1;
  get diagnostics n = row_count;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '1e: la Casa 2 borró un habitante de la Casa 1'); end if;

  perform pg_temp.como(u_p1);
  update public.habitantes set estado = 'validado' where id = hab_p1;
  perform pg_temp.base();
  select estado::text into txt from public.habitantes where id = hab_p1;
  total := total + 1; if txt <> 'pendiente' then fallas := array_append(fallas, '1f: un residente validó su propio registro'); end if;

  perform pg_temp.como(u_p2);
  begin
    insert into public.vehiculos (unidad_id, perfil_id, placa, tipo) values (1, perfil_p2, 'ZZZ999', 'Automóvil');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1g: la Casa 2 registró un vehículo en la Casa 1'); end if;

  -- ---------- 2. Cuentas y datos protegidos ----------
  perform pg_temp.como(u_p1);
  begin
    update public.perfiles set estado = 'activo', rol = 'administracion' where user_id = u_p1;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2a: un residente cambió su propio rol o estado'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo)
      values (u_p1, 5, 'propietario', 'activo', 'Falso', 'x@x.co');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2b: un residente se creó una cuenta en otra casa'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into public.autorizaciones_datos (user_id, correo, politica_version) values (u_p2, 'x', version_activa);
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2c: se pudo falsificar una autorización de datos'); end if;

  perform pg_temp.como(u_p1);
  select count(*) into n from public.auditoria;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2d: un residente ve la auditoría'); end if;

  perform pg_temp.como(u_p1);
  update public.perfiles set nombre = 'Propietario Uno Actualizado' where user_id = u_p1;
  get diagnostics n = row_count;
  perform pg_temp.base();
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '2e: un residente no pudo corregir su propio nombre'); end if;

  perform pg_temp.como(u_p2);
  select count(*) into n from public.perfiles where user_id <> u_p2;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2f: un propietario ve cuentas de otras casas'); end if;

  -- ---------- 3. Arrendatario ----------
  perform pg_temp.como(u_p2);
  r := public.autorizar_arrendatario(1::smallint, 'prueba.arrendatario1@aragon.test');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3a: la Casa 2 autorizó un arrendatario en la Casa 1'); end if;

  perform pg_temp.como(u_p1);
  r := public.autorizar_arrendatario(1::smallint, 'prueba.arrendatario1@aragon.test', current_date + 180);
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '3b: el propietario no pudo autorizar a su arrendatario: ' || (r ->> 'mensaje')); end if;

  perform pg_temp.como(u_t1);
  r := public.aceptar_invitacion_arrendatario('Arrendatario Uno');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '3c: el arrendatario entró sin aceptar la política de datos'); end if;

  perform pg_temp.como(u_t1);
  r := public.aceptar_politica(version_activa, 'pruebas');
  r := public.aceptar_invitacion_arrendatario('Arrendatario Uno');
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '3d: el arrendatario no pudo aceptar la invitación: ' || (r ->> 'mensaje')); end if;
  select id into perfil_t1 from public.perfiles where user_id = u_t1 and estado = 'activo';

  perform pg_temp.como(u_t1);
  r := public.autorizar_arrendatario(1::smallint, 'otro@aragon.test');
  perform pg_temp.base();
  total := total + 1;
  if (r ->> 'ok')::boolean or position('Solo el propietario' in coalesce(r ->> 'mensaje', '')) = 0 then
    fallas := array_append(fallas, '3e: el arrendatario no fue rechazado como no propietario al autorizar: ' || coalesce(r ->> 'mensaje', ''));
  end if;

  perform pg_temp.como(u_t1);
  r := public.retirar_arrendatario(1::smallint);
  perform pg_temp.base();
  total := total + 1;
  if (r ->> 'ok')::boolean then
    fallas := array_append(fallas, '3f: el arrendatario pudo retirar accesos de la casa');
    update public.perfiles set estado = 'activo' where id = perfil_t1;   -- restaurar para seguir probando
  end if;

  perform pg_temp.como(u_t1);
  begin
    insert into public.habitantes (unidad_id, perfil_id, nombre, relacion) values (1, perfil_t1, 'Hija del arrendatario', 'Hijo(a)')
      returning id into hab_t1;
    insert into public.contactos (perfil_id, celular) values (perfil_t1, '3000000000');
    ok := true;
  exception when others then ok := false; txt := sqlerrm; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3n: el arrendatario activo no pudo registrar su hogar: ' || txt); end if;

  perform pg_temp.como(u_p1);
  select count(*) into n from public.habitantes where perfil_id = perfil_t1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3g: el propietario ve los habitantes del arrendatario'); end if;

  perform pg_temp.como(u_p1);
  select count(*) into n from public.contactos where perfil_id = perfil_t1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3h: el propietario ve el teléfono del arrendatario'); end if;

  perform pg_temp.como(u_p1);
  r := public.resumen_casa(1::smallint);
  perform pg_temp.base();
  total := total + 1; if coalesce((r ->> 'habitantes')::int, 0) <> 2 then fallas := array_append(fallas, '3i: el resumen del propietario no cuenta los registros de la casa'); end if;

  perform pg_temp.como(u_t1);
  r := public.resumen_casa(1::smallint);
  perform pg_temp.base();
  total := total + 1; if r is not null then fallas := array_append(fallas, '3j: el arrendatario ve el resumen reservado al propietario'); end if;

  perform pg_temp.como(u_t1);
  select count(*) into n from public.perfiles where rol = 'propietario';
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3k: el arrendatario ve la cuenta del propietario'); end if;

  perform pg_temp.como(u_p1);
  select count(*) into n from public.perfiles where rol = 'arrendatario' and unidad_id = 1;
  perform pg_temp.base();
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '3l: el propietario no ve quién tiene acceso a su casa'); end if;

  perform pg_temp.como(u_t1);
  select count(*) into n from public.habitantes where perfil_id = perfil_p1;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3m: el arrendatario ve los habitantes registrados por el propietario'); end if;

  -- ---------- 4. Consejo, extraños y visitantes anónimos ----------
  perform pg_temp.como(u_cons);
  select count(*) into n from public.habitantes;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '4a: el consejo ve datos personales de habitantes'); end if;

  perform pg_temp.como(u_cons);
  select count(*) into n from public.censo();
  perform pg_temp.base();
  total := total + 1; if n <> 40 then fallas := array_append(fallas, '4b: el consejo no ve el censo de las 40 casas'); end if;

  perform pg_temp.como(u_cons);
  select count(*) into n from public.contactos;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '4c: el consejo ve teléfonos'); end if;

  perform pg_temp.como(u_x);
  select (select count(*) from public.habitantes) + (select count(*) from public.perfiles)
       + (select count(*) from public.contactos) + (select count(*) from public.censo()) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '4d: un usuario sin casa ve datos'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.perfiles;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '4e: un visitante anónimo puede consultar cuentas'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.habitantes;
    ok := (n = 0);
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '4f: un visitante anónimo ve habitantes'); end if;

  perform pg_temp.como(null);
  begin
    r := public.mi_estado();
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '4g: un visitante anónimo puede usar funciones internas'); end if;

  perform pg_temp.como(null);
  select count(*) into n from public.politicas;
  perform pg_temp.base();
  total := total + 1; if n < 1 then fallas := array_append(fallas, '4h: la política no es visible para quien aún no ha ingresado'); end if;

  -- ---------- 5. Administración ----------
  perform pg_temp.como(u_admin);
  select count(*) into n from public.habitantes;
  perform pg_temp.base();
  total := total + 1; if n <> 2 then fallas := array_append(fallas, '5a: la administración no ve todos los habitantes'); end if;

  perform pg_temp.como(u_admin);
  update public.habitantes set estado = 'validado' where id = hab_t1;
  perform pg_temp.base();
  select estado::text into txt from public.habitantes where id = hab_t1;
  total := total + 1; if txt <> 'validado' then fallas := array_append(fallas, '5b: la administración no pudo validar un registro'); end if;

  perform pg_temp.como(u_t1);
  update public.habitantes set nombre = 'Hija del arrendatario (corregido)' where id = hab_t1;
  perform pg_temp.base();
  select estado::text into txt from public.habitantes where id = hab_t1;
  total := total + 1; if txt <> 'pendiente' then fallas := array_append(fallas, '5c: un cambio a un registro validado no volvió a revisión'); end if;

  perform pg_temp.como(u_p2);
  r := public.admin_generar_codigo(3::smallint);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '5d: un propietario generó códigos de invitación'); end if;

  perform pg_temp.como(u_admin);
  select count(*) into n from public.auditoria;
  perform pg_temp.base();
  total := total + 1; if n = 0 then fallas := array_append(fallas, '5e: la auditoría no registró los cambios'); end if;

  -- ---------- 6. Registro de un propietario con código ----------
  perform pg_temp.como(u_admin);
  r := public.admin_generar_codigo(3::smallint);
  perform pg_temp.base();
  codigo := r ->> 'codigo';
  total := total + 1; if codigo is null or codigo !~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$' then fallas := array_append(fallas, '6a: la administración no pudo generar el código'); end if;

  select count(*) into n from public.invitaciones where codigo_hash = codigo or codigo_hash = replace(codigo, '-', '');
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '6b: el código se guardó sin proteger'); end if;

  perform pg_temp.como(u_x);
  r := public.canjear_codigo(codigo, 'Sin autorización');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '6c: se registró una cuenta sin aceptar la política'); end if;

  perform pg_temp.como(u_n3);
  r := public.canjear_codigo('AAAA-AAAA', 'Propietario Tres');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '6d: se aceptó un código falso'); end if;

  perform pg_temp.como(u_n3);
  r := public.canjear_codigo(lower(codigo), 'Propietario Tres');
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '6e: el código correcto no funcionó: ' || (r ->> 'mensaje')); end if;
  select id, estado::text into perfil_n3, txt from public.perfiles where user_id = u_n3;
  total := total + 1; if txt <> 'pendiente' then fallas := array_append(fallas, '6f: la cuenta nueva no quedó pendiente de aprobación'); end if;

  perform pg_temp.como(u_n3);
  begin
    insert into public.habitantes (unidad_id, perfil_id, nombre, relacion) values (3, perfil_n3, 'Antes de aprobar', 'Titular');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '6g: una cuenta sin aprobar registró datos'); end if;

  perform pg_temp.como(u_x);
  r := public.aceptar_politica(version_activa, 'pruebas');
  r := public.canjear_codigo(codigo, 'Segundo intento');
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '6h: un código se pudo usar dos veces'); end if;

  perform pg_temp.como(u_x);
  for i in 1..12 loop r := public.canjear_codigo('ZZZZ-ZZZ' || (i % 10), 'Adivinador'); end loop;
  perform pg_temp.base();
  total := total + 1; if position('Demasiados intentos' in coalesce(r ->> 'mensaje', '')) = 0 then fallas := array_append(fallas, '6i: no se frenan los intentos de adivinar códigos'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_revisar_perfil(perfil_n3, true);
  perform pg_temp.base();
  select estado::text into txt from public.perfiles where id = perfil_n3;
  total := total + 1; if txt <> 'activo' then fallas := array_append(fallas, '6j: la administración no pudo aprobar la cuenta'); end if;

  perform pg_temp.como(u_admin);
  r := public.admin_generar_codigo(1::smallint);
  perform pg_temp.base();
  perform pg_temp.como(u_cons);   -- usuario con política aceptada y sin intentos fallidos
  r := public.canjear_codigo(r ->> 'codigo', 'Segundo dueño');
  perform pg_temp.base();
  total := total + 1;
  if (r ->> 'ok')::boolean or position('ya tiene una cuenta de propietario' in coalesce(r ->> 'mensaje', '')) = 0 then
    fallas := array_append(fallas, '6k: una casa quedó con dos cuentas de propietario: ' || coalesce(r ->> 'mensaje', ''));
  end if;

  -- ---------- 7. Vencimiento y retiro del arrendatario ----------
  update public.perfiles set vence_el = current_date - 1 where id = perfil_t1;
  perform pg_temp.como(u_t1);
  select (select count(*) from public.habitantes) + (select count(*) from public.contactos) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '7a: el arrendatario con contrato vencido sigue viendo datos'); end if;
  update public.perfiles set vence_el = current_date + 30 where id = perfil_t1;

  perform pg_temp.como(u_p1);
  r := public.retirar_arrendatario(1::smallint);
  perform pg_temp.base();
  select estado::text into txt from public.perfiles where id = perfil_t1;
  total := total + 1; if txt <> 'retirado' then fallas := array_append(fallas, '7b: el propietario no pudo retirar al arrendatario'); end if;

  perform pg_temp.como(u_t1);
  select count(*) into n from public.habitantes;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '7c: el arrendatario retirado sigue viendo datos'); end if;

  -- Requiere 005_mejoras_retiro.sql: los pendientes del retirado se borran y el retirado ve el aviso.
  select count(*) into n from public.habitantes where id = hab_t1;
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '7d: quedaron registros pendientes de una cuenta retirada'); end if;

  perform pg_temp.como(u_t1);
  r := public.mi_estado();
  perform pg_temp.base();
  total := total + 1;
  if not exists (select 1 from jsonb_array_elements(r -> 'perfiles') e where e ->> 'estado' = 'retirado') then
    fallas := array_append(fallas, '7e: el arrendatario retirado no recibe el aviso de acceso retirado');
  end if;

  perform pg_temp.como(u_p1);
  r := public.resumen_casa(1::smallint);
  perform pg_temp.base();
  total := total + 1; if coalesce((r ->> 'habitantes')::int, -1) <> 1 then fallas := array_append(fallas, '7f: el resumen sigue contando registros del arrendatario retirado'); end if;

  -- ---------- Resultado (se deshace todo) ----------
  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS DE SEGURIDAD: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS DE SEGURIDAD: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
