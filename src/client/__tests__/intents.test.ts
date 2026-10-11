// DT-01 / AC-125: los conmutadores alternan sobre la última intención del jugador, no sobre el estado interpolado
// (GDD §5, regla de entrada). GameClient real con frames sintéticos; el socket no se conecta y los emit se espían.
import { C2S, S2C } from '../../game/protocol';
import { ServerFrame, ShipSnapshot, Welcome } from '../../game/types';
import { GameClient } from '../game-client';

const ME = 'me';
const FULL: ShipSnapshot = { id: ME, k: 'player', c: 'sloop', n: 'Yo', o: 'u1', x: 0, z: 0, h: 0, s: 0, hp: 800, mhp: 800, st: 'alive', t: null, r: false, pu: 0 };

function setup() {
  let clock = 1000;
  const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  const client = new GameClient({ url: 'http://localhost:1', auth: async () => ({}) });
  const emit = jest.spyOn(client.socket, 'emit').mockImplementation(() => client.socket);
  const deliver = (event: string, payload: unknown) => client.socket.listeners(event).forEach((l) => l(payload));
  const welcome: Partial<Welcome> = { playerId: 'u1', shipId: ME, time: 10, snapshotRate: 10 };
  deliver(S2C.welcome, welcome);
  let t = 10;
  const frame = (delta: Partial<ShipSnapshot>, full = false) => {
    t += 0.1;
    const f: ServerFrame = { t, ...(full ? { full: true as const } : {}), s: [{ id: ME, ...(full ? FULL : {}), ...delta }] };
    deliver(S2C.frame, f);
  };
  frame({}, true);
  const sent = () => emit.mock.calls.map((c) => c[0]);
  return {
    client,
    frame,
    sent,
    advance: (ms: number) => (clock += ms),
    done: () => {
      client.dispose();
      now.mockRestore();
    }
  };
}

describe('DT-01: intención pendiente frente al estado del servidor', () => {
  test('Espacio ×3 rápido: attack → cancelAttack → attack y el estado efectivo es atacar hasta que el servidor lo alcanza', () => {
    const { client, frame, sent, advance, done } = setup();
    try {
      for (let i = 0; i < 3; i++) {
        if (client.myTargetId()) client.cancelAttack();
        else client.attack('pirate-1');
        advance(80);
      }
      expect(sent()).toEqual([C2S.attack, C2S.cancelAttack, C2S.attack]);
      for (const t of [null, 'pirate-1', null, 'pirate-1']) {
        frame({ t });
        expect(client.myTargetId()).toBe('pirate-1');
      }
    } finally {
      done();
    }
  });

  test('Espacio ×2 antes de que el servidor confirme: attack → cancelAttack y el estado efectivo vuelve a null', () => {
    const { client, frame, sent, advance, done } = setup();
    try {
      expect(client.myTargetId()).toBeNull();
      client.attack('pirate-1');
      expect(client.myTargetId()).toBe('pirate-1'); // sin esperar al frame
      advance(80);
      // 2.ª pulsación: el servidor aún no ha confirmado, pero la intención manda
      if (client.myTargetId()) client.cancelAttack();
      else client.attack('pirate-1');
      expect(sent()).toEqual([C2S.attack, C2S.cancelAttack]);
      // El HUD lo consulta antes de que llegue nada: un frame viejo sin ataque no confirma la cancelación
      expect(client.myTargetId()).toBeNull();
      frame({});
      expect(client.myTargetId()).toBeNull();
      // Llega el frame del ataque (atrasado): no resucita el ataque, porque la última intención es cancelar
      frame({ t: 'pirate-1' });
      expect(client.myTargetId()).toBeNull();
      // Llega la cancelación: confirma y ya manda el servidor
      frame({ t: null });
      expect(client.myTargetId()).toBeNull();
    } finally {
      done();
    }
  });

  test('Esc ×2 atacando: la 1.ª cancela y la 2.ª ya ve el ataque cancelado (deseleccionaría sin red)', () => {
    const { client, frame, sent, advance, done } = setup();
    try {
      frame({ t: 'pirate-1' });
      expect(client.myTargetId()).toBe('pirate-1');
      client.cancelAttack();
      advance(80);
      frame({ t: 'pirate-1' }); // el servidor aún no la ha procesado
      expect(client.myTargetId()).toBeNull();
      expect(sent()).toEqual([C2S.cancelAttack]);
    } finally {
      done();
    }
  });

  test('si el servidor no confirma en 1,5 s, vuelve a mandar su estado (intención rechazada)', () => {
    const { client, frame, advance, done } = setup();
    try {
      client.attack('fuera-de-alcance');
      advance(1400);
      frame({});
      expect(client.myTargetId()).toBe('fuera-de-alcance');
      advance(200);
      expect(client.myTargetId()).toBeNull();
    } finally {
      done();
    }
  });

  test('una intención confirmada deja de contar: luego manda el servidor (p. ej., el objetivo se hunde)', () => {
    const { client, frame, done } = setup();
    try {
      client.attack('pirate-1');
      frame({ t: 'pirate-1' });
      expect(client.myTargetId()).toBe('pirate-1');
      frame({ t: null }); // el servidor cancela por su cuenta
      expect(client.myTargetId()).toBeNull();
    } finally {
      done();
    }
  });

  test('Reparar alterna igual: R ×2 rápido da repair(true) → repair(false)', () => {
    const { client, frame, sent, advance, done } = setup();
    try {
      client.repair(!client.myRepairing());
      advance(80);
      client.repair(!client.myRepairing());
      expect(sent()).toEqual([C2S.repair, C2S.repair]);
      expect(client.myRepairing()).toBe(false);
      frame({}); // frame viejo, aún sin reparar: no confirma el «false»
      expect(client.myRepairing()).toBe(false);
      frame({ r: true }); // llega el primero, atrasado
      expect(client.myRepairing()).toBe(false);
      frame({ r: false });
      expect(client.myRepairing()).toBe(false);
    } finally {
      done();
    }
  });
});
