/**
 * @jest-environment node
 */
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import {
  onValidated,
  parsePlayerJoin,
  parseShipPositionUpdate,
  parseFireBullet,
  parseShipDamage,
  parseNpcDestroyed
} from '../server/socket-payloads';

const MALFORMED = [null, undefined, 'texto', 42, [], {}];

describe('Socket payloads', () => {
  describe('parsePlayerJoin', () => {
    test('acepta payload válido y descarta campos extra', () => {
      expect(parsePlayerJoin({ playerId: 'p1', shipId: 's1', extra: 'x'.repeat(1e5) }))
        .toEqual({ playerId: 'p1', shipId: 's1' });
    });

    test.each(MALFORMED)('rechaza payload malformado: %p', (payload) => {
      expect(parsePlayerJoin(payload)).toBeNull();
    });

    test('rechaza ids vacíos o demasiado largos', () => {
      expect(parsePlayerJoin({ playerId: '', shipId: 's1' })).toBeNull();
      expect(parsePlayerJoin({ playerId: 'p1', shipId: 's'.repeat(129) })).toBeNull();
    });
  });

  describe('parseShipPositionUpdate', () => {
    test('acepta posición válida', () => {
      expect(parseShipPositionUpdate({ shipId: 's1', position: { x: 1, y: -2 } }))
        .toEqual({ shipId: 's1', position: { x: 1, y: -2 } });
    });

    test('conserva rotation y health cuando son números', () => {
      expect(parseShipPositionUpdate({ shipId: 's1', position: { x: 0, y: 0 }, rotation: 1.5, health: 80 }))
        .toEqual({ shipId: 's1', position: { x: 0, y: 0 }, rotation: 1.5, health: 80 });
    });

    test.each(MALFORMED)('rechaza payload malformado: %p', (payload) => {
      expect(parseShipPositionUpdate(payload)).toBeNull();
    });

    test('rechaza coordenadas no finitas', () => {
      expect(parseShipPositionUpdate({ shipId: 's1', position: { x: NaN, y: 0 } })).toBeNull();
      expect(parseShipPositionUpdate({ shipId: 's1', position: { x: 0, y: Infinity } })).toBeNull();
      expect(parseShipPositionUpdate({ shipId: 's1', position: null })).toBeNull();
    });

    test('rechaza rotation o health no numéricos', () => {
      expect(parseShipPositionUpdate({ shipId: 's1', position: { x: 0, y: 0 }, rotation: '1' })).toBeNull();
      expect(parseShipPositionUpdate({ shipId: 's1', position: { x: 0, y: 0 }, health: null })).toBeNull();
    });
  });

  describe('parseFireBullet', () => {
    test('acepta disparo válido y descarta campos extra', () => {
      expect(parseFireBullet({ shipId: 's1', position: { x: 1, y: 2 }, direction: { x: 0, y: 1 }, socketId: 'falso' }))
        .toEqual({ shipId: 's1', position: { x: 1, y: 2 }, direction: { x: 0, y: 1 } });
    });

    test.each(MALFORMED)('rechaza payload malformado: %p', (payload) => {
      expect(parseFireBullet(payload)).toBeNull();
    });
  });

  describe('parseShipDamage', () => {
    test('acepta daño positivo', () => {
      expect(parseShipDamage({ shipId: 's1', damage: 10 })).toEqual({ shipId: 's1', damage: 10 });
    });

    test.each(MALFORMED)('rechaza payload malformado: %p', (payload) => {
      expect(parseShipDamage(payload)).toBeNull();
    });

    test('rechaza daño cero, negativo (curación), excesivo o no finito', () => {
      expect(parseShipDamage({ shipId: 's1', damage: 0 })).toBeNull();
      expect(parseShipDamage({ shipId: 's1', damage: -50 })).toBeNull();
      expect(parseShipDamage({ shipId: 's1', damage: 101 })).toBeNull();
      expect(parseShipDamage({ shipId: 's1', damage: NaN })).toBeNull();
    });
  });

  describe('parseNpcDestroyed', () => {
    test('acepta payload válido', () => {
      expect(parseNpcDestroyed({ npcId: 'n1', goldReward: 20, playerId: 'p1' }))
        .toEqual({ npcId: 'n1', goldReward: 20, playerId: 'p1' });
    });

    test.each(MALFORMED)('rechaza payload malformado: %p', (payload) => {
      expect(parseNpcDestroyed(payload)).toBeNull();
    });

    test('rechaza recompensa negativa', () => {
      expect(parseNpcDestroyed({ npcId: 'n1', goldReward: -5, playerId: 'p1' })).toBeNull();
    });
  });

  describe('onValidated', () => {
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('no invoca el handler con payload inválido', () => {
      const socket = Object.assign(new EventEmitter(), { id: 'sock-1' });
      const handler = jest.fn();
      onValidated(socket, 'ship_damage', parseShipDamage, handler);

      expect(() => socket.emit('ship_damage', null)).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });

    test('invoca el handler con el payload saneado', () => {
      const socket = Object.assign(new EventEmitter(), { id: 'sock-1' });
      const handler = jest.fn();
      onValidated(socket, 'ship_damage', parseShipDamage, handler);

      socket.emit('ship_damage', { shipId: 's1', damage: 10, extra: true });
      expect(handler).toHaveBeenCalledWith({ shipId: 's1', damage: 10 });
    });

    test('un error dentro del handler no se propaga', () => {
      const socket = Object.assign(new EventEmitter(), { id: 'sock-1' });
      onValidated(socket, 'ship_damage', parseShipDamage, () => {
        throw new Error('boom');
      });

      expect(() => socket.emit('ship_damage', { shipId: 's1', damage: 10 })).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // Regresión: antes un emit con payload null tumbaba el proceso (TypeError no capturado)
  describe('integración con socket.io real', () => {
    let httpServer: HttpServer;
    let ioServer: Server;
    let client: ClientSocket;
    const received: unknown[] = [];

    beforeAll((done) => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      httpServer = createServer();
      ioServer = new Server(httpServer);
      ioServer.on('connection', (socket) => {
        onValidated(socket, 'ship_position_update', parseShipPositionUpdate, (data: unknown) => {
          received.push(data);
          socket.emit('ack', data);
        });
      });
      httpServer.listen(0, () => {
        const { port } = httpServer.address() as AddressInfo;
        client = ioClient(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
        client.on('connect', () => done());
      });
    });

    afterAll(() => {
      client.disconnect();
      ioServer.close();
      jest.restoreAllMocks();
    });

    test('sobrevive payloads malformados y sigue atendiendo eventos válidos', (done) => {
      for (const payload of MALFORMED) client.emit('ship_position_update', payload);
      client.emit('ship_position_update', { shipId: 's1', position: { x: 3, y: 4 } });

      client.once('ack', (data) => {
        expect(data).toEqual({ shipId: 's1', position: { x: 3, y: 4 } });
        expect(received).toHaveLength(1);
        done();
      });
    });
  });
});
