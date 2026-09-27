-- =====================================================================
-- Aragón en línea · Dar el rol de administración a una cuenta
-- Úselo DESPUÉS de que esa persona haya ingresado al sitio al menos una vez
-- (así su correo ya existe en Supabase → Authentication → Users).
-- Cambie el correo si es otra persona y pegue en SQL Editor → Run.
-- =====================================================================
insert into public.perfiles (user_id, rol, estado, nombre, correo, revisado_en)
select u.id, 'administracion', 'activo', 'Administración', u.email, now()
from auth.users u
where u.email = 'aragonenlinea.neiva@gmail.com'
  and not exists (select 1 from public.perfiles p where p.user_id = u.id and p.unidad_id is null
                  and p.estado in ('pendiente', 'activo'));

-- Para dar acceso al CONSEJO (solo ve el censo, sin datos personales), use esto cambiando el correo y el nombre:
-- insert into public.perfiles (user_id, rol, estado, nombre, correo, revisado_en)
-- select id, 'consejo', 'activo', 'Nombre del consejero', email, now() from auth.users where email = 'correo@ejemplo.com';

-- Verificación: debe mostrar la cuenta con rol "administracion" y estado "activo".
select p.rol, p.estado, p.correo from public.perfiles p where p.unidad_id is null;
