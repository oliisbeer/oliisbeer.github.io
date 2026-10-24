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
