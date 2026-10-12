-- =====================================================================
-- Aragón en línea · Fase 3c (complemento) · Documentos de los proveedores
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 028).
--
-- Cada proveedor puede tener sus documentos (RUT, Cámara de Comercio, planilla de seguridad social,
-- licencias o permisos, referencias), con fecha de vencimiento cuando aplique.
-- El PDF se sube en Documentos con la categoría nueva «Proveedores» y aquí se enlaza al proveedor.
-- No se guardan certificados bancarios (la plataforma no maneja datos bancarios).
-- Lo ven el consejo y la administración; lo registra la administración.
-- =====================================================================

-- Categoría nueva de documentos privados.
alter table public.documentos_privados drop constraint documentos_privados_categoria_check;
alter table public.documentos_privados add constraint documentos_privados_categoria_check
  check (categoria in ('Actas de asamblea', 'Actas de consejo', 'Estados financieros', 'Informes de gestión',
                       'Contratos', 'Pólizas', 'Proveedores', 'Otros'));

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
                                                'Informes de gestión', 'Contratos', 'Pólizas', 'Proveedores', 'Otros') then
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

create table public.proveedor_documentos (
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references public.proveedores (id),
  documento_id bigint not null references public.documentos_privados (id),
  tipo text not null check (tipo in ('RUT', 'Cámara de Comercio', 'Seguridad social (PILA)', 'Licencia o permiso',
                                     'Experiencia o referencias', 'Otro')),
  vence_el date,
  notas text check (length(notas) <= 300),
  creado_en timestamptz not null default now(),
  unique (proveedor_id, documento_id)
);
alter table public.proveedor_documentos enable row level security;

create policy "consejo y administración ven documentos de proveedores" on public.proveedor_documentos for select to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "administración agrega documentos de proveedores" on public.proveedor_documentos for insert to authenticated
  with check ((select privado.es_admin()));
create policy "administración cambia documentos de proveedores" on public.proveedor_documentos for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "administración quita documentos de proveedores" on public.proveedor_documentos for delete to authenticated
  using ((select privado.es_admin()));

revoke all on public.proveedor_documentos from anon, authenticated;
grant select, insert, update, delete on public.proveedor_documentos to authenticated;

create trigger auditar_proveedor_documentos after insert or update or delete on public.proveedor_documentos
  for each row execute function privado.auditar();
