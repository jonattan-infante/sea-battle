// AC-131 y AC-133 en el cliente de red (D50, ART-DIRECTION §16.2). Sin progreso no se entra al mundo: el estado pasa a
// 'load-failed' y no se reintenta solo. «Reintentar» lanza un solo intento a la vez, que acaba en welcome (entra) o en el
// mismo fallo. La pestaña vieja (AC-133) se queda en 'kicked', sin los reintentos de AC-99 y sin toast duplicado.
// GameClient real; el socket no se conecta: los eventos se entregan a mano y connect/disconnect/emit se espían.
import { C2S, S2C } from '../../game/protocol';
import { Welcome } from '../../game/types';
import { ConnectionState, GameClient, LOAD_RETRY_TIMEOUT_MS } from '../game-client';

function setup() {
  const client = new GameClient({ url: 'http://localhost:1', auth: async () => ({}) });
  const connect = jest.spyOn(client.socket, 'connect').mockImplementation(() => client.socket);
  const disconnect = jest.spyOn(client.socket, 'disconnect').mockImplementation(() => client.socket);
  const emit = jest.spyOn(client.socket, 'emit').mockImplementation(() => client.socket);
  const deliver = (event: string, ...args: unknown[]) => client.socket.listeners(event).forEach((l) => l(...args));
  const states: ConnectionState[] = [];
  client.onState((s) => states.push(s));
  const notices: string[] = [];
  client.onNotice((n) => notices.push(n.text));
  const welcome = (): void => deliver(S2C.welcome, { playerId: 'u1', shipId: 'me', time: 10, snapshotRate: 10 } as Partial<Welcome>);
  const loadFails = () => {
    deliver(S2C.progressError, { reason: 'load' });
    deliver('disconnect', 'io server disconnect');
  };
  // Primera conexión: el socket conecta, se une y el servidor no puede cargar el progreso
  deliver('connect');
  loadFails();
  connect.mockClear();
  return { client, connect, disconnect, emit, deliver, states, notices, welcome, loadFails };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('AC-131: progreso no disponible', () => {
  test('el fallo de carga deja el estado en load-failed, cierra el socket y no reintenta solo', () => {
    const { client, connect, disconnect, states } = setup();
    expect(client.state).toBe('load-failed');
    expect(states).toEqual(['connecting', 'connected', 'load-failed']);
    expect(disconnect).toHaveBeenCalled();
    jest.advanceTimersByTime(30_000);
    expect(connect).not.toHaveBeenCalled();
    expect(client.state).toBe('load-failed');
  });

  test('3 clics en Reintentar lanzan 1 intento; mientras espera sigue en load-failed y, si falla, se resuelve en false', async () => {
    const { client, connect, emit, deliver, loadFails } = setup();
    const a = client.retryLoad();
    const b = client.retryLoad();
    const c = client.retryLoad();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
    deliver('connect');
    expect(client.state).toBe('load-failed'); // el overlay sigue con «Reintentando…» hasta saber el resultado
    expect(emit).toHaveBeenCalledWith(C2S.join, expect.anything());
    loadFails();
    await expect(a).resolves.toBe(false);
    expect(client.state).toBe('load-failed');
    // Tras el fallo se puede volver a intentar
    void client.retryLoad();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  test('si el intento recibe welcome, entra al mundo: estado connected y se resuelve en true', async () => {
    const { client, deliver, welcome } = setup();
    const attempt = client.retryLoad();
    deliver('connect');
    welcome();
    await expect(attempt).resolves.toBe(true);
    expect(client.state).toBe('connected');
  });

  test('si el servidor no contesta, el intento se resuelve en false a los LOAD_RETRY_TIMEOUT_MS', async () => {
    const { client, deliver } = setup();
    const attempt = client.retryLoad();
    deliver('connect');
    jest.advanceTimersByTime(LOAD_RETRY_TIMEOUT_MS);
    await expect(attempt).resolves.toBe(false);
  });

  test('si el servidor no está (se agotan los reintentos de AC-99), pasa a failed y el intento se resuelve en false', async () => {
    const { client } = setup();
    const attempt = client.retryLoad();
    client.socket.io.listeners('reconnect_failed').forEach((l) => (l as () => void)());
    await expect(attempt).resolves.toBe(false);
    expect(client.state).toBe('failed');
  });
});

describe('AC-133: sesión en otra pestaña', () => {
  test('kicked no reconecta, no pasa por reconnecting y no saca un toast además del overlay', () => {
    const client = new GameClient({ url: 'http://localhost:1', auth: async () => ({}) });
    const connect = jest.spyOn(client.socket, 'connect').mockImplementation(() => client.socket);
    const deliver = (event: string, ...args: unknown[]) => client.socket.listeners(event).forEach((l) => l(...args));
    const states: ConnectionState[] = [];
    const notices: string[] = [];
    client.onState((s) => states.push(s));
    client.onNotice((n) => notices.push(n.text));
    deliver('connect');
    deliver(S2C.kicked, { text: 'Has abierto el juego en otra pestaña' });
    deliver('disconnect', 'io server disconnect');
    jest.advanceTimersByTime(30_000);
    expect(states).toEqual(['connecting', 'connected', 'kicked']);
    expect(connect).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    client.dispose();
  });
});
