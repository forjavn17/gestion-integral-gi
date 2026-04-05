# OficiosYA

**Stack:** HTML · CSS · JavaScript · Supabase

---

## 1. Configurar Supabase

### Crear el proyecto
1. Ir a [supabase.com](https://supabase.com) → New project
2. Copiar `Project URL` y `anon public key`
3. Pegar en `supabaseClient.js`:

```js
const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

---

## 2. SQL — Ejecutar en Supabase → SQL Editor

```sql
-- ═══════════════════════════════════════
--  TABLAS
-- ═══════════════════════════════════════

create table if not exists profesionales (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  oficio      text not null,
  telefono    text not null,
  ubicacion   text not null,
  descripcion text,
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  views       integer default 0
);

create table if not exists comentarios (
  id              uuid primary key default gen_random_uuid(),
  profesional_id  uuid references profesionales(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  comentario      text not null,
  created_at      timestamptz default now()
);

create table if not exists calificaciones (
  id              uuid primary key default gen_random_uuid(),
  profesional_id  uuid references profesionales(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  estrellas       integer check (estrellas between 1 and 5),
  unique (profesional_id, user_id)
);

-- ═══════════════════════════════════════
--  RPC — increment_views (atómico)
-- ═══════════════════════════════════════

create or replace function increment_views(prof_id uuid)
returns void language sql security definer as $$
  update profesionales set views = views + 1 where id = prof_id;
$$;

-- ═══════════════════════════════════════
--  RLS — Row Level Security
-- ═══════════════════════════════════════

alter table profesionales  enable row level security;
alter table comentarios    enable row level security;
alter table calificaciones enable row level security;

-- PROFESIONALES: lectura pública, escritura autenticada, borrado solo dueño o admin
create policy "Leer todos" on profesionales for select using (true);
create policy "Insertar autenticado" on profesionales for insert
  with check (auth.uid() = user_id);
create policy "Borrar dueño o admin" on profesionales for delete
  using (
    auth.uid() = user_id
    or auth.email() = 'admin@oficiosya.com'
  );
create policy "Update vistas" on profesionales for update
  using (true) with check (true);

-- COMENTARIOS: lectura pública, escritura autenticada
create policy "Leer comentarios" on comentarios for select using (true);
create policy "Insertar comentario" on comentarios for insert
  with check (auth.uid() = user_id);

-- CALIFICACIONES: lectura pública, upsert autenticado
create policy "Leer calificaciones" on calificaciones for select using (true);
create policy "Insertar calificación" on calificaciones for insert
  with check (auth.uid() = user_id);
create policy "Actualizar calificación" on calificaciones for update
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════
--  ÍNDICES
-- ═══════════════════════════════════════

create index if not exists idx_prof_oficio    on profesionales(oficio);
create index if not exists idx_prof_user      on profesionales(user_id);
create index if not exists idx_com_prof       on comentarios(profesional_id);
create index if not exists idx_cal_prof       on calificaciones(profesional_id);
```

---

## 3. Crear usuario admin en Supabase

1. **Supabase Dashboard → Authentication → Users → Invite user**
2. Email: `admin@oficiosya.com`
3. Password: `Hernancho17`

O bien desde SQL:

```sql
-- Esto crea el usuario directamente (solo en entorno con acceso)
select auth.create_user(
  '{"email":"admin@oficiosya.com","password":"Hernancho17","email_confirm":true}'::jsonb
);
```

---

## 4. Deploy en producción

### Opción A — GitHub Pages (gratis)
```bash
git init
git add .
git commit -m "OficiosYA v1.0"
git remote add origin https://github.com/TU_USUARIO/oficiosya.git
git push -u origin main
# Activar GitHub Pages → Settings → Pages → Branch: main
```

### Opción B — Netlify (gratis)
```bash
npx netlify-cli deploy --prod --dir .
```

### Opción C — Vercel (gratis)
```bash
npx vercel --prod
```

> **Nota:** Como la app usa ES Modules (`type="module"`), necesita servirse desde HTTP/HTTPS, no desde `file://`. En desarrollo usá `npx serve .` o la extensión Live Server de VS Code.

---

## 5. Estructura de archivos

```
/oficiosya
├── index.html          # UI completa
├── styles.css          # Estilos (tema rojo/negro)
├── app.js              # Lógica principal (ES Module)
├── supabaseClient.js   # Conexión a Supabase
└── README.md
```

---

## 6. Variables a configurar

| Archivo            | Variable           | Descripción                    |
|--------------------|--------------------|--------------------------------|
| supabaseClient.js  | SUPABASE_URL       | URL del proyecto Supabase      |
| supabaseClient.js  | SUPABASE_ANON_KEY  | Clave pública anon             |
| app.js             | ADMIN_EMAIL        | Email del administrador        |

---

## 7. Funcionalidades incluidas

- ✅ Auth (login / registro / logout) con Supabase
- ✅ Sesión persistente
- ✅ Roles: admin / usuario
- ✅ CRUD profesionales (con RLS)
- ✅ Sistema de vistas (+1 por apertura de perfil, RPC atómico)
- ✅ Calificaciones 1–5 estrellas (upsert por usuario)
- ✅ Comentarios con fecha relativa
- ✅ Filtros por oficio + búsqueda full-text + ordenamiento
- ✅ Botón WhatsApp directo
- ✅ Panel admin con stats y top vistas
- ✅ Validación de inputs + sanitización
- ✅ try/catch en todas las operaciones async
- ✅ Loader + alertas visuales + skeleton-ready
- ✅ Responsive mobile-first
- ✅ Sin dependencias extra (solo Supabase JS via CDN)
