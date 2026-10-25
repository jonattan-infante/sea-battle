// Proxy TCP delante del Postgres de los tests, para cortar la BD sin pararla (AC-131, AC-132): `cut` rechaza las
// conexiones nuevas y corta las abiertas (BD parada), `hang` acepta y no contesta (BD colgada) y `restore` vuelve a
// reenviar. `delay` retrasa lo que va hacia la BD, en orden (AC-129: ver si el apagado escribe antes de cerrar), y
// `delayReplies` lo que vuelve de ella (O-42: la escritura llega y se aplica, pero su respuesta no llega en el plazo). Lo
// usan Jest y los e2e (el servidor propio recibe la URL del proxy como DATABASE_URL)
import net from 'net';

export type ProxyMode = 'pass' | 'cut' | 'hang';

export interface PgProxy {
  url: string; // la URL de la BD con el host y el puerto del proxy (conserva usuario, base y options)
  mode: () => ProxyMode;
  cut: () => void;
  hang: () => void;
  restore: () => void;
  delay: (ms: number) => void;
  delayReplies: (ms: number) => void;
  close: () => Promise<void>;
}

export async function startPgProxy(targetUrl: string): Promise<PgProxy> {
  const target = new URL(targetUrl);
  const targetHost = target.hostname;
  const targetPort = Number(target.port || 5432);
  let mode: ProxyMode = 'pass';
  let delayMs = 0;
  let replyDelayMs = 0;
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
    // Hacia la BD, cada trozo sale con el retraso vigente; el orden se conserva porque cada uno espera a que salga el anterior
    let last = Date.now();
    client.on('data', (chunk) => {
      const at = Math.max(last, Date.now() + delayMs);
      last = at;
      setTimeout(() => upstream.writable && upstream.write(chunk), at - Date.now());
    });
    // Desde la BD, igual; sin retraso ni nada en cola, sale en el acto, como con un pipe
    let lastReply = Date.now();
    upstream.on('data', (chunk) => {
      const at = Math.max(lastReply, Date.now() + replyDelayMs);
      lastReply = at;
      const send = () => client.writable && client.write(chunk);
      if (at <= Date.now()) send();
      else setTimeout(send, at - Date.now());
    });
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
        s.removeAllListeners('data');
        s.pause();
      }
    },
    // Las conexiones colgadas no se pueden reanudar con seguridad (el protocolo quedó a medias): se cierran y el pool
    // abre otras
    restore: () => {
      if (mode === 'hang') dropAll();
      mode = 'pass';
    },
    delay: (ms) => {
      delayMs = ms;
    },
    delayReplies: (ms) => {
      replyDelayMs = ms;
    },
    close: async () => {
      dropAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}
