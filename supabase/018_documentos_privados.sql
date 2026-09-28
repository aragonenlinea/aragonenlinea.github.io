-- =====================================================================
-- Aragón en línea · Fase 3b · Documentos privados del conjunto
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 017).
--
-- Actas, estados financieros, informes de gestión y demás documentos que solo deben ver
-- los copropietarios (no los arrendatarios ni el público). Algunos se marcan "solo consejo".
--
-- Reglas que hace cumplir:
--  * Los PDF se guardan en un espacio privado de Supabase Storage ("privados"): no tienen
--    dirección pública. Cada vez que alguien abre uno se crea un enlace que vence en minutos.
--  * Ven los documentos para copropietarios: propietarios con cuenta activa, consejo y administración.
--    Los de "solo consejo": consejo (principales y suplentes) y administración.
--    Arrendatarios, cuentas sin casa aprobada y visitantes: nada.
--  * Solo la administración (o el programa del PC con su clave) sube, registra y retira documentos.
--    Al registrar debe confirmar que el documento fue revisado y que se taparon los datos personales.
--  * Un documento retirado deja de verse y su archivo se puede borrar; el registro queda en el historial.
-- =====================================================================

-- Espacio privado para los PDF (máximo 50 MB por archivo, solo PDF).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('privados', 'privados', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['application/pdf'];

create table public.documentos_privados (
  id bigint generated always as identity primary key,
  titulo text not null check (length(btrim(titulo)) between 3 and 150),
  categoria text not null check (categoria in ('Actas de asamblea', 'Actas de consejo', 'Estados financieros',
                                               'Informes de gestión', 'Contratos', 'Pólizas', 'Otros')),
  fecha date not null,                                   -- fecha del documento (no la de subida)
  descripcion text check (length(descripcion) <= 500),
  audiencia text not null default 'copropietarios' check (audiencia in ('copropietarios', 'consejo')),
  ruta text not null unique check (ruta ~ '^docs/[0-9]{4}/[0-9a-f-]{36}\.pdf$'),   -- nombre aleatorio, sin datos personales
  tamano bigint check (tamano between 1 and 52428800),
  paginas integer check (paginas between 1 and 5000),
  revisado_confirmado boolean not null check (revisado_confirmado),
  hallazgos integer not null default 0 check (hallazgos >= 0),   -- posibles datos personales que la administración revisó y confirmó
  estado text not null default 'publicado' check (estado in ('publicado', 'retirado')),
  origen text not null default 'panel' check (origen in ('panel', 'script')),
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  retirado_por uuid references auth.users (id) on delete set null,
  retirado_en timestamptz
);
create index documentos_privados_fecha on public.documentos_privados (fecha desc);
alter table public.documentos_privados enable row level security;

-- ¿Es propietario con cuenta activa y vigente en alguna casa? (el arrendatario no cuenta)
create or replace function privado.es_copropietario() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = (select auth.uid()) and p.rol = 'propietario' and p.estado = 'activo'
      and (p.vence_el is null or p.vence_el >= current_date)
  );
$$;

-- ¿Puede ver un documento con esta audiencia?
create or replace function privado.puede_ver_documento(p_audiencia text) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.es_admin() or privado.es_consejo()
      or (p_audiencia = 'copropietarios' and privado.es_copropietario());
$$;

-- ¿Puede abrir el archivo? Solo si está registrado, publicado y le corresponde (la administración, siempre).
create or replace function privado.puede_abrir_archivo(p_ruta text) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.es_admin() or exists (
    select 1 from public.documentos_privados d
    where d.ruta = p_ruta and d.estado = 'publicado' and privado.puede_ver_documento(d.audiencia)
  );
$$;

revoke execute on function privado.es_copropietario(), privado.puede_ver_documento(text), privado.puede_abrir_archivo(text) from public, anon;
grant execute on function privado.es_copropietario(), privado.puede_ver_documento(text), privado.puede_abrir_archivo(text) to authenticated;

create policy "ver documentos privados" on public.documentos_privados for select to authenticated
  using ((select privado.es_admin()) or (estado = 'publicado' and privado.puede_ver_documento(audiencia)));

revoke all on public.documentos_privados from anon, authenticated;
grant select on public.documentos_privados to authenticated;

-- Reglas del espacio de archivos "privados".
create policy "privados: leer si le corresponde" on storage.objects for select to authenticated
  using (bucket_id = 'privados' and privado.puede_abrir_archivo(name));
create policy "privados: la administración sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'privados' and (select privado.es_admin()) and name ~ '^docs/[0-9]{4}/[0-9a-f-]{36}\.pdf$');
create policy "privados: la administración borra" on storage.objects for delete to authenticated
  using (bucket_id = 'privados' and (select privado.es_admin()));

-- ---------------------------------------------------------------------
-- Registrar un documento ya subido al espacio privado.
-- ---------------------------------------------------------------------
create or replace function public.registrar_documento(
  p_titulo text, p_categoria text, p_fecha date, p_descripcion text, p_audiencia text,
  p_ruta text, p_tamano bigint, p_paginas integer, p_revisado boolean, p_origen text default 'panel',
  p_hallazgos integer default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  errores text[] := '{}';
  nid bigint;
begin
  if not (privado.es_admin() or privado.es_servicio()) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede publicar documentos.');
  end if;
  if coalesce(p_revisado, false) is not true then
    errores := errores || 'Confirme que revisó el documento y que se taparon los datos personales.'::text;
  end if;
  if length(btrim(coalesce(p_titulo, ''))) not between 3 and 150 then errores := errores || 'El título debe tener entre 3 y 150 caracteres.'::text; end if;
  if p_categoria is null or p_categoria not in ('Actas de asamblea', 'Actas de consejo', 'Estados financieros',
                                                'Informes de gestión', 'Contratos', 'Pólizas', 'Otros') then
    errores := errores || 'La categoría no es válida.'::text;
  end if;
  if p_fecha is null or p_fecha > current_date + 31 or p_fecha < date '1990-01-01' then errores := errores || 'La fecha del documento no es válida.'::text; end if;
  if coalesce(p_audiencia, '') not in ('copropietarios', 'consejo') then errores := errores || 'Elija quién puede ver el documento.'::text; end if;
  if coalesce(p_ruta, '') !~ '^docs/[0-9]{4}/[0-9a-f-]{36}\.pdf$' then
    errores := errores || 'La ubicación del archivo no es válida.'::text;
  elsif not exists (select 1 from storage.objects o where o.bucket_id = 'privados' and o.name = p_ruta) then
    errores := errores || 'El archivo no se encuentra en el espacio privado. Súbalo de nuevo.'::text;
  elsif exists (select 1 from public.documentos_privados where ruta = p_ruta) then
    errores := errores || 'Ese archivo ya está registrado.'::text;
  end if;
  if array_length(errores, 1) is not null then
    return jsonb_build_object('ok', false, 'mensaje', 'No se publicó: ' || array_to_string(errores, ' '), 'errores', to_jsonb(errores));
  end if;

  insert into public.documentos_privados (titulo, categoria, fecha, descripcion, audiencia, ruta, tamano, paginas,
                                          revisado_confirmado, hallazgos, origen, creado_por)
  values (btrim(p_titulo), p_categoria, p_fecha, nullif(btrim(coalesce(p_descripcion, '')), ''), p_audiencia, p_ruta,
          p_tamano, p_paginas, true, greatest(coalesce(p_hallazgos, 0), 0), case when p_origen = 'script' then 'script' else 'panel' end, auth.uid())
  returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid,
    'mensaje', case when p_audiencia = 'consejo' then 'Documento publicado para el consejo.' else 'Documento publicado para los copropietarios.' end);
end;
$$;

create or replace function public.retirar_documento(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede retirar documentos.');
  end if;
  update public.documentos_privados set estado = 'retirado', retirado_por = auth.uid(), retirado_en = now()
  where id = p_id and estado = 'publicado' returning ruta into r;
  if r is null then return jsonb_build_object('ok', false, 'mensaje', 'No existe o ya estaba retirado.'); end if;
  return jsonb_build_object('ok', true, 'ruta', r, 'mensaje', 'Documento retirado. Ya nadie lo ve; queda en el historial.');
end;
$$;

create trigger auditar_documentos_privados after insert or update or delete on public.documentos_privados
  for each row execute function privado.auditar();

revoke execute on function public.registrar_documento(text, text, date, text, text, text, bigint, integer, boolean, text, integer),
  public.retirar_documento(bigint) from public, anon;
grant execute on function public.registrar_documento(text, text, date, text, text, text, bigint, integer, boolean, text, integer),
  public.retirar_documento(bigint) to authenticated, service_role;
