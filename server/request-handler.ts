import type { IncomingMessage, ServerResponse } from 'http';
import type { Health } from './health';

// Peticiones HTTP que no son de Socket.IO, en este orden: /healthz, que nunca se redirige (Railway comprueba la salud con
// el host healthcheck.railway.app y solo vale un 2xx); el 301 al dominio propio (AC-139, paso 3); y Next
export function requestHandler(opts: {
  health: () => Health;
  redirect: (host: string | undefined, url: string) => string | null;
  next: (req: IncomingMessage, res: ServerResponse) => void;
}) {
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(opts.health()));
      return;
    }
    const location = opts.redirect(req.headers.host, req.url || '/');
    if (location) {
      res.writeHead(301, { Location: location });
      res.end();
      return;
    }
    opts.next(req, res);
  };
}
