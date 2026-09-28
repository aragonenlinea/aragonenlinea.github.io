-- =====================================================================
-- Aragón en línea · Pruebas del tablero de cartera (historial_cartera)
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Crea datos de PRUEBA y al final DESHACE TODO. El resultado sale en ROJO a propósito:
--   "PRUEBAS TABLERO: NN de NN correctas" → todo bien.
-- Requiere haber aplicado 001 a 015.
-- =====================================================================
do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-00000000e001';
  u_cons  uuid := '00000000-0000-4000-8000-00000000e002';
  u_p1    uuid := '00000000-0000-4000-8000-00000000e011';
  u_t1    uuid := '00000000-0000-4000-8000-00000000e021';
  u_x     uuid := '00000000-0000-4000-8000-00000000e099';
  r jsonb; h jsonb; n bigint; ok boolean; imp bigint;
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

  -- Aislar: casa 1 sin cuentas reales y ninguna cartera real vigente durante la prueba (se deshace).
  update public.perfiles set estado = 'retirado' where unidad_id in (1) and estado in ('pendiente', 'activo');
  update public.cartera_importaciones set estado = 'anulada' where estado = 'publicada';
  insert into auth.users (id, email, aud, role) values
    (u_admin, 'ptab.admin@aragon.test', 'authenticated', 'authenticated'),
    (u_cons,  'ptab.consejo@aragon.test', 'authenticated', 'authenticated'),
    (u_p1,    'ptab.casa1@aragon.test', 'authenticated', 'authenticated'),
    (u_t1,    'ptab.arrendatario1@aragon.test', 'authenticated', 'authenticated'),
    (u_x,     'ptab.extrano@aragon.test', 'authenticated', 'authenticated');
  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo) values
    (u_admin, null, 'administracion', 'activo', 'Admin tablero', 'ptab.admin@aragon.test'),
    (u_cons,  null, 'consejo', 'activo', 'Consejo tablero', 'ptab.consejo@aragon.test'),
    (u_p1,    1, 'propietario', 'activo', 'Propietario Uno', 'ptab.casa1@aragon.test'),
    (u_t1,    1, 'arrendatario', 'activo', 'Arrendatario Uno', 'ptab.arrendatario1@aragon.test');

  -- Dos cortes: agosto (casa 5 debe 600.000) y septiembre (casa 5 debe 1.200.000 con antigüedad; casa 6 a favor).
  perform pg_temp.como(u_admin);
  r := public.importar_cartera('2026-08-31', 'Agosto prueba', 600000, 'a.xlsx',
         '[{"unidad":5,"cuota_administracion":600000,"saldo_total":600000}]');
  if not (r ->> 'ok')::boolean then raise exception 'No se pudo preparar el corte de agosto: %', r; end if;
  r := public.importar_cartera('2026-09-30', 'Septiembre prueba', 650000, 'b.xlsx',
         '[{"unidad":5,"saldo_anterior":600000,"cuota_administracion":600000,"saldo_total":1200000,"mora_1_30":600000,"mora_91_180":600000},
           {"unidad":6,"pagos_periodo":550000,"saldo_total":-550000}]');
  if not (r ->> 'ok')::boolean then raise exception 'No se pudo preparar el corte de septiembre: %', r; end if;
  perform pg_temp.base();

  -- ---------- 1. Quién ve ----------
  perform pg_temp.como(u_p1);
  h := public.historial_cartera();
  perform pg_temp.base();
  total := total + 1; if coalesce(jsonb_array_length(h), 0) <> 2 then fallas := array_append(fallas, '1a: el propietario no ve los dos cortes'); end if;

  perform pg_temp.como(u_t1);
  r := public.historial_cartera();
  perform pg_temp.base();
  total := total + 1; if coalesce(jsonb_array_length(r), 0) <> 2 then fallas := array_append(fallas, '1b: el arrendatario no ve el tablero'); end if;

  perform pg_temp.como(u_cons);
  r := public.historial_cartera();
  perform pg_temp.base();
  total := total + 1; if coalesce(jsonb_array_length(r), 0) <> 2 then fallas := array_append(fallas, '1c: el consejo no ve el tablero'); end if;

  perform pg_temp.como(u_x);
  r := public.historial_cartera();
  perform pg_temp.base();
  total := total + 1; if r is not null then fallas := array_append(fallas, '1d: una cuenta sin casa aprobada ve el tablero'); end if;

  perform pg_temp.como(null);
  begin
    r := public.historial_cartera();
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.base();
  total := total + 1; if not ok then fallas := array_append(fallas, '1e: un visitante anónimo ve el tablero'); end if;

  -- ---------- 2. Contenido: solo totales, cifras correctas ----------
  total := total + 1; if h::text ~* '"unidad|casa_|nombre|correo' then fallas := array_append(fallas, '2a: el tablero revela casas o personas'); end if;
  total := total + 1;
  if (h -> 1 ->> 'fecha_corte') <> '2026-09-30' or (h -> 1 ->> 'cartera_total')::bigint <> 1200000
     or (h -> 1 ->> 'saldos_a_favor')::bigint <> 550000 or (h -> 1 ->> 'casas_en_mora')::int <> 1
     or (h -> 1 ->> 'casas_al_dia')::int <> 39 or (h -> 1 ->> 'casas_mora_mas_90')::int <> 1
     or (h -> 1 -> 'edades' ->> 'mora_91_180')::bigint <> 600000 then
    fallas := array_append(fallas, '2b: los totales de septiembre no son correctos: ' || (h -> 1)::text);
  end if;
  total := total + 1;
  if (h -> 0 ->> 'fecha_corte') <> '2026-08-31' or (h -> 0 -> 'edades' ->> 'sin_clasificar')::bigint <> 600000 then
    fallas := array_append(fallas, '2c: el corte de agosto (sin antigüedad) no es correcto: ' || (h -> 0)::text);
  end if;

  -- ---------- 3. Un corte anulado deja de verse ----------
  select id into imp from public.cartera_importaciones where fecha_corte = '2026-09-30' and estado = 'publicada';
  perform pg_temp.como(u_admin);
  r := public.admin_anular_importacion(imp);
  perform pg_temp.base();
  perform pg_temp.como(u_p1);
  h := public.historial_cartera();
  perform pg_temp.base();
  total := total + 1; if coalesce(jsonb_array_length(h), 0) <> 1 then fallas := array_append(fallas, '3a: se sigue viendo un corte anulado'); end if;

  if array_length(fallas, 1) is null then
    raise exception 'PRUEBAS TABLERO: % de % correctas. Todo bien. (Este mensaje en rojo es normal: deshace los datos de prueba.)', total, total;
  else
    raise exception 'PRUEBAS TABLERO: FALLARON % de %: %', array_length(fallas, 1), total, array_to_string(fallas, ' | ');
  end if;
end;
$$;
