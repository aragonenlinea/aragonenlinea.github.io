# Plantillas de correo de acceso (Supabase)

Supabase → **Authentication** → **Emails** → pestaña **Templates**. Hay que cambiar **dos** plantillas, porque a quien entra por primera vez le llega "Confirm signup" y a quien ya entró antes le llega "Magic Link". Copie el asunto y el cuerpo de cada una y guarde (**Save**).

Las dos incluyen el enlace **y** el código de 6 dígitos: así la persona puede abrir el correo en el celular y escribir el código en el computador.

---

## Confirm signup

**Asunto:**

```
Su acceso a Aragón en línea
```

**Cuerpo:**

```html
<h2>Aragón en línea · Conjunto Residencial Aragón</h2>
<p>Para ingresar, abra este enlace:</p>
<p><a href="{{ .ConfirmationURL }}">Ingresar a Aragón en línea</a></p>
<p>O escriba este código en la página de ingreso:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>El enlace y el código sirven una sola vez y vencen en una hora.</p>
<p>Si usted no pidió este acceso, ignore este mensaje.</p>
```

## Magic Link

**Asunto:**

```
Su acceso a Aragón en línea
```

**Cuerpo:** el mismo de arriba.

## Reset Password (¿Olvidó su contraseña?)

**Asunto:**

```
Crear una contraseña nueva · Aragón en línea
```

**Cuerpo:**

```html
<h2>Aragón en línea · Conjunto Residencial Aragón</h2>
<p>Recibimos una solicitud para crear una contraseña nueva para esta cuenta.</p>
<p><a href="{{ .ConfirmationURL }}">Crear mi contraseña nueva</a></p>
<p>El enlace sirve una sola vez y vence en una hora.</p>
<p>Si usted no lo pidió, ignore este mensaje: su contraseña actual sigue igual.</p>
```

---

## Configuración del envío (SMTP con el Gmail del proyecto)

Supabase → **Authentication** → **Emails** → pestaña **SMTP Settings** → **Enable custom SMTP**:

| Campo | Valor |
|---|---|
| Sender email | `aragonenlinea.neiva@gmail.com` |
| Sender name | `Aragón en línea` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `aragonenlinea.neiva@gmail.com` |
| Password | la **contraseña de aplicación** de Google (ver abajo). **Nunca** la contraseña normal del correo. |

**Contraseña de aplicación:** en la cuenta de Google del proyecto → **Seguridad** → **Verificación en dos pasos** (debe estar activa) → al final, **Contraseñas de aplicaciones** → nombre `Supabase` → **Crear**. Google muestra 16 letras una sola vez: cópielas directamente en el campo Password de Supabase. No las guarde en ningún otro lugar ni las envíe por chat.

Después, en **Authentication** → **Rate Limits**, suba "Rate limit for sending emails" a **30 por hora**. Gmail permite unos 500 correos por día.
