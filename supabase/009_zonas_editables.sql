-- =====================================================================
-- Aragón en línea · Zonas reservables editables por la administración
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 007).
--
-- * La administración cambia turnos, horarios, tarifas, anticipación, capacidad y
--   reglas desde el panel (pestaña "Zonas"), según lo que apruebe la asamblea o el
--   consejo. Puede agregar zonas o desactivarlas (no se borran: guardan su historial).
-- * El público ve la configuración de las zonas activas (no tiene datos personales),
--   para mostrar horarios y tarifas en la página de zonas comunes.
-- * Horarios aclarados: "12:00 de la noche" en vez de "12:00 a. m.", que se confundía con mediodía.
-- =====================================================================

-- Estructura mínima de los turnos: lista de 1 a 8 turnos, cada uno con id y nombre.
create or replace function privado.turnos_validos(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 1 and 8
     and not exists (
       select 1 from jsonb_array_elements(p) t
       where coalesce(t ->> 'id', '') !~ '^[a-z0-9_-]{1,40}$'
          or length(btrim(coalesce(t ->> 'nombre', ''))) < 2)
     and (select count(distinct t ->> 'id') from jsonb_array_elements(p) t) = jsonb_array_length(p);
$$;

alter table public.zonas_reservables
  add constraint zonas_turnos_validos check (privado.turnos_validos(turnos)),
  add constraint zonas_id_valido check (id ~ '^[a-z0-9_-]{2,40}$'),
  add constraint zonas_nombre_valido check (length(btrim(nombre)) between 2 and 60),
  add constraint zonas_anticipacion_valida check (anticipacion_dias_habiles between 0 and 60),
  add constraint zonas_max_valido check (max_dias_adelante between 1 and 365),
  add constraint zonas_capacidad_valida check (capacidad is null or capacidad between 1 and 500),
  add constraint zonas_reglas_validas check (reglas is null or length(reglas) <= 1000);

-- El público ve las zonas activas; la administración las crea y las cambia.
create policy "publico ve zonas activas" on public.zonas_reservables for select to anon using (activa);
create policy "admin crea zonas" on public.zonas_reservables for insert to authenticated
  with check ((select privado.es_admin()));
create policy "admin cambia zonas" on public.zonas_reservables for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));

grant select on public.zonas_reservables to anon;
grant insert, update on public.zonas_reservables to authenticated;

create trigger auditar_zonas after insert or update or delete on public.zonas_reservables
  for each row execute function privado.auditar();

-- Horarios aclarados (mismo contenido del Manual de convivencia, art. 57).
update public.zonas_reservables
set turnos = '[{"id":"dia","nombre":"Turno de día","horario":"10:00 a. m. a 6:00 p. m.","tarifa":"2,7 SMDLV"},
               {"id":"noche","nombre":"Turno de noche","horario":"6:00 p. m. a 12:00 de la noche (medianoche)","tarifa":"3,3 SMDLV"}]'
where id = 'salon';
update public.zonas_reservables
set turnos = '[{"id":"unico","nombre":"Turno único","horario":"10:00 a. m. a 12:00 de la noche (medianoche)","tarifa":"1 SMDLV"}]'
where id = 'bbq';
