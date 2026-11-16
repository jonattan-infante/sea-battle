// AC-153: el nivel de cada jugador llega en el `lv` de su barco (GDD §13) y la placa y el panel del objetivo lo leen de
// RenderShip.level. Los NPC no lo llevan (null). Es un campo discreto: cambia cuando la interpolación alcanza la muestra
// que lo trae, como la vida
import { S2C } from '../../game/protocol';
import { ServerFrame, ShipSnapshot } from '../../game/types';
import { GameClient } from '../game-client';

const base = { x: 0, z: 0, h: 0, s: 0, hp: 800, mhp: 800, st: 'alive', t: null, r: false, pu: 0 } as const;
const player: ShipSnapshot = { ...base, id: 'p', k: 'player', c: 'sloop', n: 'Ana', o: 'u1', lv: 13 };
const pirate: ShipSnapshot = { ...base, id: 'n', k: 'pirate', c: 'pirate', n: 'Pirata', o: null };

test('el nivel del jugador llega a RenderShip.level, los NPC dan null y un delta con `lv` lo cambia al alcanzar su muestra', () => {
  let clock = 1000;
  const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  const client = new GameClient({ url: 'http://localhost:1', auth: async () => ({}) });
  try {
    const deliver = (f: ServerFrame) => client.socket.listeners(S2C.frame).forEach((l) => l(f));
    deliver({ t: 1, full: true, s: [player, pirate] });
    client.update(clock);
    expect(client.getShip('p')!.level).toBe(13);
    expect(client.getShip('n')!.level).toBeNull();

    clock = 1100;
    deliver({ t: 1.1, s: [{ id: 'p', lv: 14 }] });
    clock = 1150; // renderTime 1,05: aún la muestra de t = 1
    client.update(clock);
    expect(client.getShip('p')!.level).toBe(13);
    clock = 1250; // renderTime 1,15: ya la de t = 1,1
    client.update(clock);
    expect(client.getShip('p')!.level).toBe(14);
    expect(client.getShip('n')!.level).toBeNull();
  } finally {
    client.dispose();
    now.mockRestore();
  }
});

// AC-227: la familia de cada jugador llega en el `fa` de su barco (GDD §13), solo al entrar y al cambiar, y elige su modelo.
// Los deltas sin `fa` la conservan; los NPC no la llevan (null)
test('la familia del jugador llega a RenderShip.family, se conserva en los deltas sin `fa` y cambia con el que la trae', () => {
  let clock = 1000;
  const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  const client = new GameClient({ url: 'http://localhost:1', auth: async () => ({}) });
  try {
    const deliver = (f: ServerFrame) => client.socket.listeners(S2C.frame).forEach((l) => l(f));
    deliver({ t: 1, full: true, s: [{ ...player, fa: 'gb' }, pirate] });
    client.update(clock);
    expect([client.getShip('p')!.family, client.getShip('n')!.family]).toEqual(['gb', null]);
    clock = 1100;
    deliver({ t: 1.1, s: [{ id: 'p', hp: 700 }] });
    clock = 1250;
    client.update(clock);
    expect(client.getShip('p')!.family).toBe('gb');
    clock = 1300;
    deliver({ t: 1.3, s: [{ id: 'p', fa: 'none' }] });
    clock = 1450;
    client.update(clock);
    expect(client.getShip('p')!.family).toBe('none');
  } finally {
    client.dispose();
    now.mockRestore();
  }
});
