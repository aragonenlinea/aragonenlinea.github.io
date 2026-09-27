-- =====================================================================
-- Aragón en línea · Borrar TODOS los datos de prueba
-- Úselo UNA vez, justo antes de abrir la plataforma a los residentes reales.
--
-- Borra las cuentas de prueba (correos aragonenlinea.neiva+algo@gmail.com),
-- sus casas registradas, datos de Mi hogar, invitaciones, autorizaciones,
-- intentos de código y el historial de auditoría de las pruebas.
-- NO borra la cuenta de administración (aragonenlinea.neiva@gmail.com sin "+"),
-- ni las casas, ni la política.
-- Al final muestra las cuentas que quedaron.
-- =====================================================================
begin;

create temp table cuentas_prueba on commit drop as
  select id from auth.users where email ilike 'aragonenlinea.neiva+%@gmail.com';

create temp table perfiles_prueba on commit drop as
  select id from public.perfiles where user_id in (select id from cuentas_prueba);

-- Invitaciones de prueba: usadas por cuentas de prueba, hechas a correos de prueba o autorizadas por ellas.
create temp table invitaciones_prueba on commit drop as
  select id from public.invitaciones
  where usada_por in (select id from cuentas_prueba)
     or lower(coalesce(correo, '')) like 'aragonenlinea.neiva+%'
     or autorizado_por in (select id from perfiles_prueba);

delete from public.invitaciones where id in (select id from invitaciones_prueba);
delete from public.intentos_codigo where user_id in (select id from cuentas_prueba);
delete from public.autorizaciones_datos where user_id in (select id from cuentas_prueba);

-- Borra las cuentas; en cascada se borran sus perfiles, contactos, habitantes, mascotas y vehículos.
delete from auth.users where id in (select id from cuentas_prueba);

-- Auditoría: al final, porque los borrados de arriba también quedan anotados (con nombres de prueba).
delete from public.auditoria
where en = now()                                                  -- lo anotado por esta misma limpieza
   or user_id in (select id from cuentas_prueba)
   or registro_id in (select id::text from perfiles_prueba)
   or registro_id in (select id::text from invitaciones_prueba)
   or (despues ->> 'perfil_id') in (select id::text from perfiles_prueba)
   or (antes ->> 'perfil_id') in (select id::text from perfiles_prueba)
   or lower(coalesce(despues ->> 'correo', antes ->> 'correo', '')) like 'aragonenlinea.neiva+%';

commit;

-- Verificación: deben quedar solo las cuentas reales (por ahora, la de administración).
select p.rol, p.estado, p.correo, p.unidad_id from public.perfiles p order by p.unidad_id nulls first;
