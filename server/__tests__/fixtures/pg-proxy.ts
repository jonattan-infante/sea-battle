// Proxy TCP delante del Postgres de los tests, para cortar la BD sin pararla (AC-131, AC-132): `cut` rechaza las
// conexiones nuevas y corta las abiertas (BD parada), `hang` acepta y no contesta (BD colgada) y `restore` vuelve a
// reenviar. Lo usan Jest y los e2e (el servidor propio recibe la URL del proxy como DATABASE_URL)
import net from 'net';

export type ProxyMode = 'pass' | 'cut' | 'hang';

export interface PgProxy {
  url: string; // la URL de la BD con el host y el puerto del proxy (conserva usuario, base y options)
  mode: () => ProxyMode;
  cut: () => void;
  hang: () => void;
  restore: () => void;
  close: () => Promise<void>;
}

export async function startPgProxy(targetUrl: string): Promise<PgProxy> {
  const target = new URL(targetUrl);
  const targetHost = target.hostname;
  const targetPort = Number(target.port || 5432);
  let mode: ProxyMode = 'pass';
  const sockets = new Set<net.Socket>();
  const track = (s: net.Socket) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    s.on('error', () => s.destroy());
  };

  const server = net.createServer((client) => {
    track(client);
    if (mode === 'cut') {
      client.destroy();
      return;
    }
    if (mode === 'hang') {
      client.pause(); // aceptada, pero nadie contesta
      return;
    }
    const upstream = net.connect(targetPort, targetHost);
    track(upstream);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = new URL(targetUrl);
  url.hostname = '127.0.0.1';
  url.port = String((server.address() as net.AddressInfo).port);

  const dropAll = () => sockets.forEach((s) => s.destroy());
  return {
    url: url.toString(),
    mode: () => mode,
    cut: () => {
      mode = 'cut';
      dropAll();
    },
    // Las conexiones abiertas dejan de reenviar en los dos sentidos: las consultas se quedan sin respuesta
    hang: () => {
      mode = 'hang';
      for (const s of sockets) {
        s.unpipe();
        s.pause();
      }
    },
    // Las conexiones colgadas no se pueden reanudar con seguridad (el protocolo quedó a medias): se cierran y el pool
    // abre otras
    restore: () => {
      if (mode === 'hang') dropAll();
      mode = 'pass';
    },
    close: async () => {
      dropAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}
