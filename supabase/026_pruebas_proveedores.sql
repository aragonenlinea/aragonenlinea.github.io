-- =====================================================================
-- Aragón en línea · Pruebas de proveedores, contratos y pólizas
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS PROVEEDORES: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 025.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000b001';
  u_cons  uuid := '00000000-0000-4000-8000-00000000b002';
  u_p1    uuid := '00000000-0000-4000-8000-00000000b011';
  u_t1    uuid := '00000000-0000-4000-8000-00000000b021';
  u_x     uuid := '00000000-0000-4000-8000-00000000b099';
  prov bigint; contr bigint; pol bigint;
  n bigint; ok boolean; t1 timestamptz; t2 timestamptz;
  total int := 0; fallas text[] := '{}';
begin
  execute $f$
    create function pg_temp.como(p_user uuid, p_clave boolean default false) returns void language plpgsql as $b$
    begin
      if p_user is null then
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims',
          (jsonb_build_object('sub', p_user, 'role', 'authenticated', 'email', (select email from auth.users where id = p_user))
           || case when p_clave then '{"amr":[{"method":"password","timestamp":1}]}'::jsonb else '{}'::jsonb end)::text, true);
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
    (u_admin, 'pprov.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'pprov.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'pprov.casa1@aragon.test', 'authenticated', 'authenticated'),
    (u_t1,    'pprov.arrendatario1@aragon.test', 'authenticated', 'authenticated'),
    (u_x,     'pprov.otro@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin proveedores', 'pprov.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo proveedores', 'pprov.consejo@aragon.test'),
    (u_p1,    1, 'propietario', 'activo', 'Propietario Uno', 'pprov.casa1@aragon.test'),
    (u_t1,    1, 'arrendatario', 'activo', 'Arrendatario Uno', 'pprov.arrendatario1@aragon.test');

  -- ---------- 1. La administración registra ----------
  perform pg_temp.como(u_admin);
  begin
    insert into public.proveedores (nombre, tipo, nit, servicio, funciones, telefono)
      values ('Seguridad de Prueba LTDA', 'empresa', '900.000.001-1', 'Vigilancia', 'Vigilancia 24 horas', '6088000000') returning id into prov;
    insert into public.contratos (proveedor_id, objeto, fecha_inicio, fecha_fin, valor_mensual, rubro)
      values (prov, 'Servicio de vigilancia', current_date - 100, current_date + 20, 11542000, 'Servicio de vigilancia') returning id into contr;
    insert into public.polizas (tipo, aseguradora, numero, valor_asegurado, vigencia_desde, vigencia_hasta)
      values ('Manejo', 'Aseguradora de Prueba S.A.', 'P-1', 5000000, current_date - 10, current_date + 355) returning id into pol;
    ok := true;
  exception when others then ok := false; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1a: la administración no pudo registrar proveedor, contrato y póliza'); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into public.proveedores (nombre, tipo, nit, servicio) values ('Mantenimiento de piscina', 'persona_natural', '12.345.678', 'Mantenimiento de piscina');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1b: se guardó la cédula (NIT) de una persona natural'); end if;

  perform pg_temp.como(u_admin);
  begin
    insert into public.contratos (proveedor_id, objeto, fecha_inicio, fecha_fin) values (prov, 'Fechas al revés', current_date, current_date - 1);
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1c: se aceptó un contrato que termina antes de empezar'); end if;

  -- ---------- 2. Quién ve ----------
  perform pg_temp.como(u_cons);
  select (select count(*) from public.proveedores where id = prov) + (select count(*) from public.contratos where id = contr)
       + (select count(*) from public.polizas where id = pol) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 3 then fallas := array_append(fallas, '2a: el consejo no ve proveedores, contratos o pólizas'); end if;

  perform pg_temp.como(u_p1);
  select (select count(*) from public.proveedores) + (select count(*) from public.contratos) + (select count(*) from public.polizas)
       + (select count(*) from public.configuracion_conjunto) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2b: un propietario ve proveedores, contratos o pólizas'); end if;

  perform pg_temp.como(u_t1);
  select (select count(*) from public.proveedores) + (select count(*) from public.contratos) + (select count(*) from public.polizas) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2c: un arrendatario ve proveedores, contratos o pólizas'); end if;

  perform pg_temp.como(u_x);
  select (select count(*) from public.proveedores) + (select count(*) from public.polizas) into n;
  perform pg_temp.base();
  total := total + 1; if n <> 0 then fallas := array_append(fallas, '2d: una cuenta sin casa ni cargo ve proveedores o pólizas'); end if;

  perform pg_temp.como(null);
  begin
    select count(*) into n from public.polizas;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '2e: un visitante anónimo ve las pólizas'); end if;

  -- ---------- 3. Quién modifica ----------
  perform pg_temp.como(u_cons);
  begin
    insert into public.proveedores (nombre, servicio) values ('Proveedor del consejo', 'Otro');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3a: el consejo registró un proveedor'); end if;

  perform pg_temp.como(u_cons);
  update public.polizas set valor_asegurado = 1 where id = pol;
  perform pg_temp.base();
  select count(*) into n from public.polizas where id = pol and valor_asegurado = 5000000;
  total := total + 1; if n <> 1 then fallas := array_append(fallas, '3b: el consejo cambió una póliza'); end if;

  perform pg_temp.como(u_p1);
  begin
    insert into public.polizas (tipo, aseguradora, vigencia_desde, vigencia_hasta) values ('Otra', 'Falsa S.A.', current_date, current_date + 1);
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3c: un propietario registró una póliza'); end if;

  perform pg_temp.como(u_admin, true);
  begin
    insert into public.proveedores (nombre, servicio) values ('Entró con contraseña', 'Otro');
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '3d: la administración registró un proveedor en una sesión abierta con contraseña'); end if;

  perform pg_temp.como(u_admin);
  begin
    delete from public.polizas where id = pol;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok or not exists (select 1 from public.polizas where id = pol) then fallas := array_append(fallas, '3e: se borró una póliza (debe anularse, no borrarse)'); end if;

  -- ---------- 4. Configuración y fechas ----------
  perform pg_temp.como(u_admin);
  update public.configuracion_conjunto set smmlv = 1500000, smmlv_anio = 2026 where id = 1;
  perform pg_temp.base();
  perform pg_temp.como(u_cons);
  select smmlv into n from public.configuracion_conjunto where id = 1;
  perform pg_temp.base();
  total := total + 1; if coalesce(n, 0) <> 1500000 then fallas := array_append(fallas, '4a: el salario mínimo no quedó guardado o el consejo no lo ve'); end if;

  select actualizado_en into t1 from public.contratos where id = contr;
  perform pg_sleep(0.01);
  perform pg_temp.como(u_admin);
  update public.contratos set estado = 'terminado' where id = contr;
  perform pg_temp.base();
  select actualizado_en into t2 from public.contratos where id = contr;
  total := total + 1; if t2 <= t1 then fallas := array_append(fallas, '4b: no se actualizó la fecha de modificación'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS PROVEEDORES: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS PROVEEDORES: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
