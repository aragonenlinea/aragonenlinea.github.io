-- =====================================================================
-- Aragón en línea · Pruebas de los documentos de proveedores
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS DOCUMENTOS DE PROVEEDORES: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 029.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000d201';
  u_cons  uuid := '00000000-0000-4000-8000-00000000d202';
  u_p1    uuid := '00000000-0000-4000-8000-00000000d211';
  ruta text := 'docs/2099/' || gen_random_uuid() || '.pdf';
  prov bigint; doc bigint; vin bigint;
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
    (u_admin, 'ppdoc.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'ppdoc.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'ppdoc.casa1@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin', 'ppdoc.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo', 'ppdoc.consejo@aragon.test'),
    (u_p1,    1, 'propietario', 'activo', 'Propietario Uno', 'ppdoc.casa1@aragon.test');
  insert into storage.objects (bucket_id, name) values ('privados', ruta);

  -- ---------- 1. Registrar ----------
  perform pg_temp.como(u_admin);
  r := public.registrar_documento('RUT de prueba', 'Proveedores', current_date, null, 'consejo', ruta, 1000, 1, true);
  insert into public.proveedores (nombre, servicio) values ('Aseo de Prueba S.A.S.', 'Aseo y servicios generales') returning id into prov;
  perform pg_temp.base();
  doc := (r ->> 'id')::bigint;
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '1a: no se aceptó la categoría Proveedores: ' || (r ->> 'mensaje')); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into public.proveedor_documentos (proveedor_id, documento_id, tipo, vence_el) values (prov, doc, 'RUT', null) returning id into vin;
    ok := true;
  exception when others then ok := false; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1b: la administración no pudo enlazar el documento al proveedor'); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into public.proveedor_documentos (proveedor_id, documento_id, tipo) values (prov, doc, 'Certificado bancario');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1c: se aceptó un tipo de documento no permitido (certificado bancario)'); end if;

  -- ---------- 2. Quién ve y quién cambia ----------
  perform pg_temp.como(u_cons);
  select count(*) into n from public.proveedor_documentos where id = vin;
  perform pg_temp.base();
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '2a: el consejo no ve los documentos del proveedor'); end if;

  perform pg_temp.como(u_p1);
  select count(*) into n from public.proveedor_documentos;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2b: un propietario ve los documentos de proveedores'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.proveedor_documentos;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2c: un visitante anónimo ve los documentos de proveedores'); end if;

  perform pg_temp.como(u_cons);
  begin
    insert into public.proveedor_documentos (proveedor_id, documento_id, tipo) values (prov, doc, 'Otro');
    ok := false;
  exception when others then ok := true; end;
  delete from public.proveedor_documentos where id = vin;
  perform pg_temp.base();
  select count(*) into n from public.proveedor_documentos where id = vin;
  total := total + 1; if not ok or n <> 1 then fallas := array_append(fallas, '2d: el consejo agregó o quitó documentos de un proveedor'); end if;

  perform pg_temp.como(u_admin);
  delete from public.proveedor_documentos where id = vin;
  perform pg_temp.base();
  select count(*) into n from public.proveedor_documentos where id = vin;
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2e: la administración no pudo quitar el documento del proveedor'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS DOCUMENTOS DE PROVEEDORES: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS DOCUMENTOS DE PROVEEDORES: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
