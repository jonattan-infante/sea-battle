// AC-126 (DT-03): la landing la sirve el mismo proceso que el juego. Con el servidor caído, navegar acabaría en la
// página de error del navegador, así que antes se sondea /healthz durante 2 s. Los sondeos se solapan: sale uno nuevo
// cada 200 ms aunque los anteriores sigan sin respuesta, porque en un redeploy la conexión puede quedarse colgada y el
// servidor volver antes de que acabe. Ni una conexión rechazada ni una colgada cortan el sondeo, y una respuesta lenta
// pero válida tampoco se corta. Con la primera respuesta válida se resuelve true; si no llega en 2 s, false. Al
// terminar no queda ninguna petición pendiente.
export const EXIT_PROBE_MS = 2000;
export const EXIT_PROBE_EVERY_MS = 200; // ≤ 250 ms con margen para el retraso de setTimeout
export const EXIT_PROBE_MAX = 10;

export function probeServer(url: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  return new Promise((resolve) => {
    const pending = new Set<AbortController>();
    const timers: ReturnType<typeof setTimeout>[] = [];
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      pending.forEach((c) => c.abort());
      pending.clear();
      resolve(ok);
    };
    const probe = () => {
      if (settled) return;
      const controller = new AbortController();
      pending.add(controller);
      fetchFn(url, { cache: 'no-store', signal: controller.signal })
        .then((res) => {
          if (res.ok) finish(true);
        })
        .catch(() => {
          // Rechazada o abortada: el sondeo sigue con las demás
        })
        .finally(() => pending.delete(controller));
    };
    // Cada lanzamiento se fija desde el inicio (0, 200, …, 1 800 ms): el retraso de un setTimeout no se acumula
    for (let i = 0; i < EXIT_PROBE_MAX && i * EXIT_PROBE_EVERY_MS < EXIT_PROBE_MS; i++) {
      if (i === 0) probe();
      else timers.push(setTimeout(probe, i * EXIT_PROBE_EVERY_MS));
    }
    timers.push(setTimeout(() => finish(false), EXIT_PROBE_MS));
  });
}

// H-16: pulsar Salir otra vez mientras sondea no lanza otro sondeo: se devuelve el que está en curso (≤ 10 peticiones en
// total con 1, 2 o 3 clics) y, al terminar, el siguiente clic vuelve a sondear
let inflight: Promise<boolean> | null = null;
export function probeServerOnce(url: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  inflight ??= probeServer(url, fetchFn).finally(() => {
    inflight = null;
  });
  return inflight;
}
