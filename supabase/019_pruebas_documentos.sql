-- =====================================================================
-- Aragón en línea · Pruebas de los documentos privados
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS DOCUMENTOS: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 018.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000f001';
  u_cons  uuid := '00000000-0000-4000-8000-00000000f002';
  u_supl  uuid := '00000000-0000-4000-8000-00000000f003';
  u_p1    uuid := '00000000-0000-4000-8000-00000000f011';
  u_t1    uuid := '00000000-0000-4000-8000-00000000f021';
  u_x     uuid := '00000000-0000-4000-8000-00000000f099';
  ruta_a text := 'docs/2099/' || gen_random_uuid() || '.pdf';   -- para copropietarios
  ruta_b text := 'docs/2099/' || gen_random_uuid() || '.pdf';   -- solo consejo
  ruta_c text := 'docs/2099/' || gen_random_uuid() || '.pdf';   -- subido pero sin registrar
  ruta_d text := 'docs/2099/' || gen_random_uuid() || '.pdf';   -- lo sube la administración en la prueba
  id_a bigint; id_b bigint;
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
  update public.perfiles set estado = 'retirado' where unidad_id in (1) and estado in ('pendiente', 'activo');
  insert into auth.users (id, email, aud, role) values
    (u_admin, 'pdoc.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'pdoc.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_supl,  'pdoc.suplente@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'pdoc.casa1@aragon.test', 'authenticated', 'authenticated'),
    (u_t1,    'pdoc.arrendatario1@aragon.test', 'authenticated', 'authenticated'),
    (u_x,     'pdoc.extrano@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin doc', 'pdoc.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejero doc', 'pdoc.consejo@aragon.test'),
    (u_supl,  null, 'consejo', 'activo', 'Suplente doc', 'pdoc.suplente@aragon.test'),
    (u_p1,    1, 'propietario', 'activo', 'Propietario Uno', 'pdoc.casa1@aragon.test'),
    (u_t1,    1, 'arrendatario', 'activo', 'Arrendatario Uno', 'pdoc.arrendatario1@aragon.test');
  -- Archivos "subidos" al espacio privado (como lo haría el panel).
  insert into storage.objects (bucket_id, name) values ('privados', ruta_a), ('privados', ruta_b), ('privados', ruta_c);

  -- ---------- 1. Registrar ----------
  perform pg_temp.como(u_p1);
  r := public.registrar_documento('Acta de prueba', 'Actas de asamblea', current_date, null, 'copropietarios', ruta_a, 1000, 3, true);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1a: un propietario publicó un documento'); end if;

  perform pg_temp.como(u_admin);
  r := public.registrar_documento('Acta de prueba', 'Actas de asamblea', current_date, null, 'copropietarios', ruta_a, 1000, 3, false);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1b: se publicó sin confirmar la revisión de datos personales'); end if;

  perform pg_temp.como(u_admin);
  r := public.registrar_documento('Acta de prueba', 'Actas de asamblea', current_date, null, 'copropietarios',
                                  'docs/2099/' || gen_random_uuid() || '.pdf', 1000, 3, true);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1c: se registró un archivo que no existe'); end if;

  perform pg_temp.como(u_admin);
  r := public.registrar_documento('Acta de prueba', 'Actas de asamblea', current_date, null, 'copropietarios',
                                  'docs/2099/acta-juan-perez.pdf', 1000, 3, true);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1d: se aceptó un archivo con nombre no aleatorio'); end if;

  perform pg_temp.como(u_admin);
  r := public.registrar_documento('Acta de prueba', 'Actas de asamblea', current_date, 'Asamblea ordinaria', 'copropietarios', ruta_a, 1000, 3, true);
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '1e: un documento correcto fue rechazado: ' || (r ->> 'mensaje')); end if;
  id_a := (r ->> 'id')::bigint;

  perform pg_temp.como(u_admin);
  r := public.registrar_documento('Relación de pagos', 'Informes de gestión', current_date, null, 'consejo', ruta_b, 1000, 2, true);
  perform pg_temp.base();
  total := total + 1; if not (r ->> 'ok')::boolean then fallas := array_append(fallas, '1f: un documento del consejo fue rechazado: ' || (r ->> 'mensaje')); end if;
  id_b := (r ->> 'id')::bigint;

  perform pg_temp.como(u_admin);
  r := public.registrar_documento('Otra vez', 'Otros', current_date, null, 'copropietarios', ruta_a, 1000, 3, true);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '1g: se registró dos veces el mismo archivo'); end if;

  -- ---------- 2. Quién ve la lista ----------
  perform pg_temp.como(u_p1);
  select count(*) filter (where id = id_a) * 10 + count(*) filter (where id = id_b) into n from public.documentos_privados;
  perform pg_temp.base();
  total := total + 1; if n <> 10 then fallas := array_append(fallas, '2a: el propietario no ve lo suyo o ve lo del consejo (' || n || ')'); end if;

  perform pg_temp.como(u_t1);
  select count(*) into n from public.documentos_privados where id in (id_a, id_b);
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2b: el arrendatario ve documentos de copropietarios'); end if;

  perform pg_temp.como(u_supl);
  select count(*) into n from public.documentos_privados where id in (id_a, id_b);
  perform pg_temp.base();
  total := total + 1; if n <> 2 then fallas := array_append(fallas, '2c: el suplente del consejo no ve todo'); end if;

  perform pg_temp.como(u_x);
  select count(*) into n from public.documentos_privados where id in (id_a, id_b);
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2d: una cuenta sin casa aprobada ve documentos'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.documentos_privados;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2e: un visitante anónimo ve la lista'); end if;

  -- ---------- 3. Quién abre los archivos ----------
  perform pg_temp.como(u_p1);
  select count(*) filter (where name = ruta_a) * 100 + count(*) filter (where name = ruta_b) * 10 + count(*) filter (where name = ruta_c)
    into n from storage.objects where bucket_id = 'privados';
  perform pg_temp.base();
  total := total + 1; if n <> 100 then fallas := array_append(fallas, '3a: el propietario no abre su documento o abre otros (' || n || ')'); end if;

  perform pg_temp.como(u_t1);
  select count(*) into n from storage.objects where bucket_id = 'privados' and name in (ruta_a, ruta_b, ruta_c);
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3b: el arrendatario abre archivos privados'); end if;

  perform pg_temp.como(u_cons);
  select count(*) into n from storage.objects where bucket_id = 'privados' and name in (ruta_a, ruta_b, ruta_c);
  perform pg_temp.base();
  total := total + 1; if n <> 2 then fallas := array_append(fallas, '3c: el consejo no abre los documentos publicados o abre uno sin registrar'); end if;

  perform pg_temp.como(null);
  select count(*) into n from storage.objects where bucket_id = 'privados' and name in (ruta_a, ruta_b, ruta_c);
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '3d: un visitante anónimo abre archivos privados'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into storage.objects (bucket_id, name) values ('privados', 'docs/2099/' || gen_random_uuid() || '.pdf');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3e: un propietario subió un archivo al espacio privado'); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into storage.objects (bucket_id, name) values ('privados', ruta_d);
    ok := true;
  exception when others then ok := false; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3f: la administración no pudo subir un archivo'); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into storage.objects (bucket_id, name) values ('privados', 'docs/2099/estados-financieros-juan.pdf');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3g: se aceptó un archivo con nombre no aleatorio'); end if;

  -- Supabase además bloquea con un error todo borrado directo por SQL (storage.protect_delete):
  -- cualquiera de las dos cosas (error o nada borrado) sirve, lo importante es que el archivo siga ahí.
  perform pg_temp.como(u_p1);
  begin
    delete from storage.objects where bucket_id = 'privados' and name = ruta_a;
  exception when others then null; end;
  perform pg_temp.base();
  select count(*) into n from storage.objects where bucket_id = 'privados' and name = ruta_a;
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '3h: un propietario borró un archivo privado'); end if;

  perform pg_temp.como(u_admin);
  begin
    update public.documentos_privados set audiencia = 'copropietarios' where id = id_b;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3i: se cambió un documento sin pasar por las funciones'); end if;

  -- ---------- 4. Retirar ----------
  perform pg_temp.como(u_p1);
  r := public.retirar_documento(id_a);
  perform pg_temp.base();
  total := total + 1; if (r ->> 'ok')::boolean then fallas := array_append(fallas, '4a: un propietario retiró un documento'); end if;

  perform pg_temp.como(u_admin);
  r := public.retirar_documento(id_a);
  perform pg_temp.base();
  perform pg_temp.como(u_p1);
  select (select count(*) from public.documentos_privados where id = id_a)
       + (select count(*) from storage.objects where bucket_id = 'privados' and name = ruta_a) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 or not (r ->> 'ok')::boolean then fallas := array_append(fallas, '4b: se sigue viendo un documento retirado'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS DOCUMENTOS: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS DOCUMENTOS: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
