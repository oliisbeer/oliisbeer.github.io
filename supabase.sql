-- ===== ROCKOLA OLII'S BEER =====
-- Pegar todo esto en Supabase → SQL Editor → Run (una sola vez).
-- Antes de correrlo, cambia CAMBIA-ESTA-CLAVE (abajo) por la clave que usará el bar.

-- Canciones pedidas
create table if not exists pedidos (
  id bigint generated always as identity primary key,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  titulo text not null check (char_length(titulo) <= 200),
  canal text check (char_length(canal) <= 120),
  mesa int not null check (mesa between 1 and 50),
  estado text not null default 'cola' check (estado in ('cola', 'sonando', 'hecho', 'saltado')),
  creado timestamptz not null default now()
);
alter table pedidos enable row level security;

-- Los clientes pueden ver la cola de hoy y pedir canciones, nada más
create policy "ver cola" on pedidos for select to anon
  using (creado > now() - interval '1 day');
create policy "pedir cancion" on pedidos for insert to anon
  with check (estado = 'cola');

-- Búsquedas guardadas (para no gastar el cupo diario de YouTube)
create table if not exists busquedas (
  q text primary key check (char_length(q) <= 100),
  resultados jsonb not null,
  creado timestamptz not null default now()
);
alter table busquedas enable row level security;
create policy "leer busquedas" on busquedas for select to anon using (true);
create policy "guardar busquedas" on busquedas for insert to anon with check (true);
create policy "renovar busquedas" on busquedas for update to anon using (true) with check (true);

-- Clave del bar (nadie la puede leer desde internet)
create table if not exists ajustes (clave text not null);
alter table ajustes enable row level security;
insert into ajustes (clave) values ('CAMBIA-ESTA-CLAVE');

-- Solo la pantalla del bar (con la clave) puede cambiar el estado de un pedido
create or replace function bar_verificar(p_clave text) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from ajustes where clave = p_clave);
$$;

create or replace function bar_marcar(p_id bigint, p_estado text, p_clave text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not bar_verificar(p_clave) then
    raise exception 'Clave incorrecta';
  end if;
  update pedidos set estado = p_estado where id = p_id;
end;
$$;

grant select, insert on pedidos to anon;
grant select, insert, update on busquedas to anon;
revoke all on ajustes from anon, authenticated;
grant execute on function bar_verificar(text) to anon;
grant execute on function bar_marcar(bigint, text, text) to anon;

-- ===== PANEL DEL ADMINISTRADOR (se agregó después) =====
-- Órdenes que el panel le manda a la pantalla del TV (saltar, pausa, volumen…)
create table if not exists comandos (
  id bigint generated always as identity primary key,
  accion text not null check (accion in ('saltar', 'pausa', 'seguir', 'volumen_mas', 'volumen_menos')),
  creado timestamptz not null default now()
);
alter table comandos enable row level security;
create policy "ver comandos" on comandos for select to anon using (creado > now() - interval '1 hour');
grant select on comandos to anon;

-- Lo que está sonando en el TV (pedida o automática), para el panel y los clientes
create table if not exists ahora (
  id int primary key default 1 check (id = 1),
  video_id text,
  titulo text,
  mesa int,
  automatica boolean not null default false,
  actualizado timestamptz not null default now()
);
alter table ahora enable row level security;
create policy "ver ahora" on ahora for select to anon using (true);
grant select on ahora to anon;

create or replace function bar_comando(p_clave text, p_accion text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not bar_verificar(p_clave) then raise exception 'Clave incorrecta'; end if;
  insert into comandos (accion) values (p_accion);
end;
$$;

create or replace function bar_ahora(p_clave text, p_video_id text, p_titulo text, p_mesa int, p_automatica boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not bar_verificar(p_clave) then raise exception 'Clave incorrecta'; end if;
  insert into ahora (id, video_id, titulo, mesa, automatica, actualizado)
  values (1, p_video_id, left(p_titulo, 200), p_mesa, p_automatica, now())
  on conflict (id) do update set video_id = excluded.video_id, titulo = excluded.titulo,
    mesa = excluded.mesa, automatica = excluded.automatica, actualizado = now();
end;
$$;

revoke insert, update, delete on comandos, ahora from anon, authenticated;
grant execute on function bar_comando(text, text) to anon;
grant execute on function bar_ahora(text, text, text, int, boolean) to anon;

-- ============================================================
-- Modo "YouTube del TV": los pedidos se mandan a la app de YouTube del televisor
-- (función supabase/functions/tv). Correr esto una vez.
-- ============================================================
alter table pedidos add column if not exists enviado_en timestamptz;  -- cuándo se mandó a la fila del TV
alter table pedidos add column if not exists tras_video text;         -- detrás de qué video quedó en la fila

-- El TV vinculado (solo lo lee la función, con la llave de servicio)
create table if not exists tv (
  id int primary key default 1 check (id = 1),
  screen_id text, token text, nombre text, expira bigint
);
alter table tv enable row level security;
revoke all on tv from anon, authenticated;

-- Cada 30 segundos se revisa qué suena en el TV, aunque nadie tenga el panel abierto
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('rockola-tv', '30 seconds', $$
  select net.http_post(
    url := 'https://gwqadityhvgadixcxviu.supabase.co/functions/v1/tv',
    body := '{"accion":"sincronizar"}'::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3cWFkaXR5aHZnYWRpeGN4dml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3OTQ1NDUsImV4cCI6MjEwODM3MDU0NX0.WDG3GLnTV0TtabI4tyfA91rgI4k3oBNLyy0fMSGZxKg"}'::jsonb
  );
$$);
