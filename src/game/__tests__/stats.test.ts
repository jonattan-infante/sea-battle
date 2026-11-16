import { PlayerShipClass } from '../constants';
import { DANGER_COST, marksDanger, soloSinkCost, tooStrong } from '../stats';
import { Upgrades } from '../types';

// Desde la 1.3, los niveles son del barco activo (AC-212 b)
const own = (activeShip: PlayerShipClass, upgrades: Partial<Upgrades> = {}) => ({
  activeShip,
  ships: { [activeShip]: { cannons: 1, hull: 1, sails: 1, ...upgrades } }
});

describe('AC-189: coste de hundir un NPC en solitario y marca de peligro', () => {
  // Los 9 casos de referencia de BACKLOG AC-189, con el coste que calculó producto redondeado al 1 %
  test.each([
    ['Balandra N1', 'gunboat', 71, true, own('sloop')],
    ['Balandra N1', 'pirate', 31, false, own('sloop')],
    ['Balandra N1', 'merchant', 0, false, own('sloop')],
    ['Balandra N1', 'captain', 293, true, own('sloop')],
    ['Balandra con Cañones N2', 'gunboat', 46, false, own('sloop', { cannons: 2 })],
    ['Bergantín con cañones N1', 'gunboat', 27, false, own('brig')],
    ['Bergantín con cañones N2', 'gunboat', 17, false, own('brig', { cannons: 2 })],
    ['Bergantín con cañones y casco N2', 'captain', 60, true, own('brig', { cannons: 2, hull: 2 })],
    ['Fragata con todo a N3', 'captain', 16, false, own('frigate', { cannons: 3, hull: 3, sails: 3 })]
  ])('%s contra %s: %i %%, marca %s', (_name, npc, percent, marked, player) => {
    expect(Math.round(soloSinkCost(npc, player) * 100)).toBe(percent);
    expect(tooStrong(npc, player)).toBe(marked);
  });

  test('la marca sale con más de la mitad de la vida máxima propia, no con la mitad justa', () => {
    expect(DANGER_COST).toBe(0.5);
    expect(marksDanger(0.5)).toBe(false);
    expect(marksDanger(0.501)).toBe(true);
  });

  test('las velas no cambian el coste: solo los cañones y el casco', () => {
    expect(soloSinkCost('gunboat', own('sloop', { sails: 3 }))).toBe(soloSinkCost('gunboat', own('sloop')));
  });

  test('un NPC sin cañones (el mercante) o de una clase que el cliente no conoce no se marca', () => {
    expect(soloSinkCost('merchant', own('sloop'))).toBe(0);
    expect(tooStrong('galleon', own('sloop'))).toBe(false);
  });
});

describe('AC-212 (b): la marca de peligro usa los niveles del barco activo, no los de otro barco del jugador', () => {
  test('Balandra N1 y Bergantín con Cañones N3: con la Balandra activa, la cañonera se marca (71 %); con el Bergantín, no (11 %)', () => {
    const ships = { sloop: { cannons: 1, hull: 1, sails: 1 }, brig: { cannons: 3, hull: 1, sails: 1 } };
    expect([Math.round(soloSinkCost('gunboat', { activeShip: 'sloop', ships }) * 100), tooStrong('gunboat', { activeShip: 'sloop', ships })]).toEqual([71, true]);
    expect([Math.round(soloSinkCost('gunboat', { activeShip: 'brig', ships }) * 100), tooStrong('gunboat', { activeShip: 'brig', ships })]).toEqual([11, false]);
  });
});
