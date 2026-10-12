-- =====================================================================
-- Aragón en línea · Pruebas de aseguradoras, coberturas y garantías exigidas
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS GARANTÍAS: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 031.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000e301';
  u_cons  uuid := '00000000-0000-4000-8000-00000000e302';
  u_p1    uuid := '00000000-0000-4000-8000-00000000e311';
  aseg bigint; pol bigint; req bigint;
  n bigint; ok boolean;
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
  insert into auth.users (id, email, aud, role) values
    (u_admin, 'pgar.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'pgar.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'pgar.casa1@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin', 'pgar.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo', 'pgar.consejo@aragon.test'),
    (u_p1,    1, 'propietario', 'activo', 'Propietario Uno', 'pgar.casa1@aragon.test');

  -- ---------- 1. Aseguradora como proveedor, póliza y coberturas ----------
  perform pg_temp.como(u_admin);
  begin
    insert into public.proveedores (nombre, tipo, nit, servicio) values ('Aseguradora de Prueba S.A.', 'empresa', '860.000.001-1', 'Seguros') returning id into aseg;
    insert into public.polizas (tipo, aseguradora, aseguradora_id, vigencia_desde, vigencia_hasta)
      values ('Áreas comunes (incendio y terremoto)', 'Aseguradora de Prueba S.A.', aseg, current_date, current_date + 365) returning id into pol;
    insert into public.poliza_coberturas (poliza_id, cobertura, valor_asegurado) values (pol, 'Incendio', 4500000000), (pol, 'Terremoto', 4500000000);
    update public.configuracion_conjunto set avaluo_valor = 5000000000, avaluo_fecha = current_date - 200 where id = 1;
    ok := true;
  exception when others then ok := false; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1a: la administración no pudo registrar aseguradora, póliza, coberturas y avalúo'); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into public.poliza_coberturas (poliza_id, cobertura, valor_asegurado) values (pol, 'Cobertura inventada', 1);
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1b: se aceptó una cobertura que no está en la lista'); end if;

  -- ---------- 2. Quién ve ----------
  perform pg_temp.como(u_cons);
  select (select count(*) from public.poliza_coberturas where poliza_id = pol) * 100 + (select count(*) from public.requisitos_poliza where activo) into n;
  perform pg_temp.base();
  total := total + 1; if n < 214 then fallas := array_append(fallas, '2a: el consejo no ve las coberturas o las garantías exigidas (' || n || ')'); end if;

  perform pg_temp.como(u_p1);
  select (select count(*) from public.poliza_coberturas) + (select count(*) from public.requisitos_poliza) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2b: un propietario ve coberturas o garantías exigidas'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.requisitos_poliza;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2c: un visitante anónimo ve las garantías exigidas'); end if;

  -- ---------- 3. Quién cambia ----------
  perform pg_temp.como(u_cons);
  begin
    insert into public.poliza_coberturas (poliza_id, cobertura, valor_asegurado) values (pol, 'Terrorismo', 1);
    ok := false;
  exception when others then ok := true; end;
  update public.requisitos_poliza set minimo_valor = 1 where cobertura = 'Cumplimiento';
  perform pg_temp.base();
  select count(*) into n from public.requisitos_poliza where cobertura = 'Cumplimiento' and minimo_valor = 1;
  total := total + 1; if not ok or n <> 0 then fallas := array_append(fallas, '3a: el consejo agregó coberturas o cambió una garantía exigida'); end if;

  perform pg_temp.como(u_admin);
  select id into req from public.requisitos_poliza where cobertura = 'Cumplimiento' and ambito = 'Todos los contratistas' limit 1;
  update public.requisitos_poliza set minimo_valor = 20 where id = req;
  begin
    delete from public.requisitos_poliza where id = req;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  select count(*) into n from public.requisitos_poliza where id = req and minimo_valor = 20;
  total := total + 1; if n <> 1 or not ok then fallas := array_append(fallas, '3b: la administración no pudo ajustar una garantía exigida, o pudo borrarla (debe desactivarse)'); end if;

  perform pg_temp.como(u_p1);
  begin
    update public.configuracion_conjunto set avaluo_valor = 1 where id = 1;
    ok := true;
  exception when others then ok := true; end;
  perform pg_temp.base();
  select count(*) into n from public.configuracion_conjunto where avaluo_valor = 5000000000;
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '3c: un propietario cambió el valor del avalúo'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS GARANTÍAS: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS GARANTÍAS: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
