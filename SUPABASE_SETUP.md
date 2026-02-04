# Configuración de Supabase para Divide

## 1) Crear proyecto
1. Entra a Supabase y crea un proyecto nuevo.
2. Anota el **Project URL** y el **anon public key**.

## 2) Crear tablas y políticas
1. Abre el **SQL Editor**.
2. Ejecuta el contenido de `supabase/schema.sql`.

## 3) Configurar Auth
1. Ve a **Authentication → Providers** y habilita **Email**.
2. En **Authentication → URL Configuration**:
   - `Site URL`: tu URL de Vercel (por ejemplo `https://tu-app.vercel.app`).
   - `Redirect URLs`: agrega también tu dominio si aplica.
3. Si quieres requerir confirmación por correo, deja activado **Confirm email**.

## 4) Conectar el frontend
1. Abre `supabase-config.js`.
2. Reemplaza `SUPABASE_URL` y `SUPABASE_ANON_KEY` con tus credenciales.

## 5) Probar en local
```bash
npm start
```

## 6) Deploy en Vercel
- Asegúrate de que `supabase-config.js` tenga las credenciales correctas.
- Vuelve a desplegar el proyecto.
