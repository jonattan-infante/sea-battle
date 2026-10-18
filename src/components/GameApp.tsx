'use client';
// Orquesta el cliente de red, el runtime de render, el HUD y la entrada (GDD §5).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { PlayerShipClass } from '../game/constants';
import { GameEvent, Welcome } from '../game/types';
import { probeServerOnce } from '../client/exit-probe';
import { GameClient } from '../client/game-client';
import {
  canAttackClient,
  cannonFor,
  captainDownText,
  captainSpawnText,
  classLabel,
  cycleTarget,
  hudSignals,
  inSafeZone,
  levelUpOf,
  levelUpText,
  portBlock,
  pushGoldReward,
  pushKillReward,
  pushXpReward,
  relationOf,
  RewardDraft,
  rewardLines,
  rewardText
} from '../client/hud-logic';
import { MeHud, resetSaveWarning, sameShallow, syncUnsaved, TargetHud, useHud } from '../client/hud-store';
import { attachOverlays, createRuntime, disposeRuntime, GameRuntime } from '../client/runtime';
import GameCanvas from './game/GameCanvas';
import Hud, { HudActions } from './hud/Hud';
import { ConnectionOverlay, Connecting } from './hud/Overlays';

const GUEST_KEY = 'sea-battle-guest-id';
const HINTS_KEY = 'sea-battle-hints';
const HINT_COUNT = 3;
const HUD_SYNC_MS = 100; // ≤ 10 Hz
const UNDER_FIRE_MS = 3000; // GDD §8
const DESELECT_SUNK_MS = 1200;

function randomId(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(10, '0');
}

function guestId(): string {
  try {
    let id = localStorage.getItem(GUEST_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

// Usuario de prueba de los e2e de persistencia (?testUser=, AC-97): solo en modo invitado, y el servidor lo rechaza fuera
// de ese modo (server/auth.ts)
function testUserParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('testUser');
  } catch {
    return null;
  }
}

function readHints(): number {
  try {
    return Number(localStorage.getItem(HINTS_KEY) ?? 0) || 0;
  } catch {
    return HINT_COUNT;
  }
}

// Avanza la pista de primera sesión si la acción hecha es la que pedía (AC-79)
function completeHint(step: number) {
  const { hint } = useHud.getState();
  if (hint !== step) return;
  const next = step + 1;
  try {
    localStorage.setItem(HINTS_KEY, String(next));
  } catch {
    /* sin almacenamiento: la pista no persiste */
  }
  useHud.setState({ hint: next < HINT_COUNT ? next : null });
}

interface SeaBattleDebug {
  ready: () => boolean;
  serverTime: () => number;
  me: () => unknown;
  ships: () => unknown[];
  player: () => unknown;
  hud: () => unknown;
  renderInfo: () => unknown;
  runtime: () => GameRuntime;
}

declare global {
  interface Window {
    __SEA_BATTLE__?: SeaBattleDebug;
  }
}

export default function GameApp({ guest }: { guest: boolean }) {
  const router = useRouter();
  const { getToken, isLoaded } = useAuth();
  const { user } = useUser();
  const [runtime, setRuntime] = useState<GameRuntime | null>(null);
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const getTokenRef = useRef(getToken);
  // Sincroniza el HUD en el acto tras una intención del jugador (AC-125: refleja la pulsación en ≤ 50 ms)
  const syncRef = useRef<() => void>(() => {});
  getTokenRef.current = getToken;

  // El invitado no depende de Clerk: si el efecto dependiera de isLoaded, al cargar Clerk se recrearía el
  // cliente, el socket viejo se desconectaría y el servidor borraría el destino recién pedido
  const identityReady = guest || isLoaded;

  // Cliente y runtime: se crean una sola vez, cuando la identidad está lista
  useEffect(() => {
    if (!identityReady) return;
    const id = guest ? guestId() : null;
    const testUser = guest ? testUserParam() : null;
    const name = testUser ? `Prueba ${testUser}` : guest ? `Invitado ${id!.slice(0, 4).toUpperCase()}` : user?.username ?? user?.firstName ?? null;
    const client = new GameClient({
      url: window.location.origin,
      name,
      auth: async () => (testUser ? { testUser } : guest ? { guest: true, guestId: id } : { token: (await getTokenRef.current()) ?? undefined })
    });
    const rt = createRuntime(client);
    const hud = useHud.getState();
    // Recompensas de esta pasada de eventos (AC-152; GDD §14, «XP ganada»). El hundimiento, el oro y la XP de un barco
    // llegan en el mismo frame y se reproducen en la misma llamada a update() (game-client.ts): se juntan aquí y salen
    // como una sola línea del feed en una microtarea, al acabar la pasada
    let rewards: RewardDraft[] = [];
    let flushQueued = false;
    const flushRewards = () => {
      flushQueued = false;
      for (const r of rewardLines(rewards)) hud.pushFeed('gold', rewardText(r), r);
      rewards = [];
    };
    const queueFlush = () => {
      if (flushQueued) return;
      flushQueued = true;
      queueMicrotask(flushRewards);
    };
    const hints = readHints();
    useHud.setState({ hint: hints < HINT_COUNT ? hints : null });

    const onEvent = (e: GameEvent) => {
      const myId = client.myShipId;
      const myPlayer = client.player?.id ?? client.welcome?.playerId;
      const now = performance.now();
      switch (e.type) {
        case 'volley':
          if (e.shipId === myId) hudSignals.lastVolleyAt = now;
          break;
        case 'impact':
          if (e.shipId === myId && e.damage > 0) hudSignals.lastHitAt = now;
          break;
        case 'sunk': {
          const victim = client.getShip(e.shipId);
          if (e.shipId === myId) {
            const killer = client.getShip(e.byShipId);
            const killerName = killer?.name ?? client.player?.death?.by ?? null;
            useHud.setState({ killedBy: killerName ? { name: killerName, relation: killer ? relationOf(killer, myId) : 'player' } : null, shopOpen: false });
            hud.pushFeed('danger', killerName ? `${killerName} te hundió` : 'Tu barco se hundió');
          } else if (e.byShipId === myId) {
            pushKillReward(rewards, victim?.kind === 'player' ? 'pvp' : 'kill', victim?.name ?? 'un barco', e.pos);
            queueFlush();
          }
          break;
        }
        case 'loot': {
          if (e.playerId !== myPlayer) break;
          useHud.setState({ goldGain: { id: now, amount: e.gold } });
          pushGoldReward(rewards, e.source, e.gold, e.pos);
          queueFlush();
          break;
        }
        // Solo llega al dueño y nunca con 0 (xp.ts): sin XP no sale nada de XP (GDD §14)
        case 'xp': {
          if (e.playerId !== myPlayer) break;
          pushXpReward(rewards, e.source, e.xp, e.pos);
          queueFlush();
          break;
        }
        case 'respawn':
          if (e.shipId === myId) useHud.setState({ killedBy: null });
          break;
        // Capitán pirata (AC-111): aviso a todos al aparecer y feed de todos al hundirse
        case 'captain':
          hud.pushToast('warn', captainSpawnText(e.sector, e.pos));
          break;
        case 'captainDown':
          hud.pushFeed('info', captainDownText(e.names, e.more));
          break;
      }
    };

    // Sincroniza el HUD a ≤ 10 Hz y solo si cambian los datos (AC-83/85)
    const sync = () => {
      const st = useHud.getState();
      const myId = client.myShipId;
      const mine = client.getShip(myId);
      const player = client.player;
      const cannon = cannonFor(player);
      hudSignals.reloadMs = cannon.reload * 1000;
      let me: MeHud | null = null;
      if (mine) {
        // Atacando / reparando según la última intención del jugador, no el estado interpolado (DT-01)
        const targetId = client.myTargetId();
        const repairing = client.myRepairing();
        const attacked = targetId ? client.getShip(targetId) : undefined;
        const inRange = !!attacked && Math.hypot(attacked.x - mine.x, attacked.z - mine.z) <= cannon.range;
        me = {
          shipId: mine.id,
          name: mine.name,
          classId: mine.classId,
          classLabel: classLabel(mine.classId),
          hp: mine.hp,
          maxHp: mine.maxHp,
          state: mine.state,
          inSafeZone: inSafeZone(mine.x, mine.z),
          protectedUntil: mine.protectedUntil,
          action: repairing ? 'repairing' : targetId ? (inRange ? 'firing' : 'armed') : 'idle',
          underFire: performance.now() - hudSignals.lastHitAt < UNDER_FIRE_MS
        };
      } else if (st.me && player?.death) {
        // El barco hundido del todo ya no viene en los frames: el HUD sigue en estado "Hundido"
        me = st.me.state === 'dead' ? st.me : { ...st.me, state: 'dead', action: 'idle', hp: 0 };
      }

      let selectedId = st.selectedId;
      const sel = selectedId ? client.getShip(selectedId) : undefined;
      if (selectedId && (!sel || (sel.state !== 'alive' && performance.now() - sel.sinkingSince > DESELECT_SUNK_MS))) selectedId = null;
      let target: TargetHud | null = null;
      if (sel && selectedId) {
        const distance = mine ? Math.round(Math.hypot(sel.x - mine.x, sel.z - mine.z)) : 0;
        target = {
          id: sel.id,
          name: sel.name,
          kind: sel.kind,
          relation: relationOf(sel, myId),
          classId: sel.classId,
          classLabel: classLabel(sel.classId),
          hp: sel.hp,
          maxHp: sel.maxHp,
          state: sel.state,
          distance,
          inRange: distance <= cannon.range,
          attackable: canAttackClient(client, mine, sel),
          level: sel.level
        };
      }

      const patch: Partial<ReturnType<typeof useHud.getState>> = {};
      if (!sameShallow(me, st.me)) patch.me = me;
      if (!sameShallow(target, st.target)) patch.target = target;
      if (selectedId !== st.selectedId) patch.selectedId = selectedId;
      if (Object.keys(patch).length > 0) useHud.setState(patch);
    };

    const unsubs = [
      client.onState((connection) => {
        useHud.setState({ connection });
        if (connection === 'connected') useHud.setState({ reconnectAttempt: 0 });
        if (connection === 'full') router.replace('/?full=1');
      }),
      client.onPlayer((player) => {
        // AC-151: la subida de nivel sale en el mismo commit que el panel con el nivel nuevo, al llegar el frame que la
        // trae. Un solo aviso con el nivel final aunque el hundimiento dé varios niveles
        const up = levelUpOf(useHud.getState().player?.xp, player.xp);
        useHud.setState({ player });
        if (up) hud.pushToast('achievement', levelUpText(up), up.rank);
        // AC-132: el aviso llega en el mismo commit que el estado del servidor. Lo decide el servidor (autoritativo): a un
        // invitado nunca le marca unsaved, porque no escribe en la BD; si lo hiciera por error, el e2e lo vería
        syncUnsaved(player.unsaved === true);
      }),
      client.onNotice((n) => hud.pushToast(n.kind === 'error' ? 'danger' : 'ok', n.text)),
      client.onEvent(onEvent),
      client.onWelcome((w) => setWelcome(w))
    ];
    const onAttempt = (n: number) => useHud.setState({ reconnectAttempt: n });
    client.socket.io.on('reconnect_attempt', onAttempt);
    const syncId = setInterval(sync, HUD_SYNC_MS);
    syncRef.current = sync;
    client.connect();
    setRuntime(rt);

    return () => {
      clearInterval(syncId);
      syncRef.current = () => {};
      unsubs.forEach((u) => u());
      client.socket.io.off('reconnect_attempt', onAttempt);
      disposeRuntime(rt);
      client.dispose();
      setRuntime(null);
      setWelcome(null);
      resetSaveWarning();
      useHud.setState({ me: null, target: null, player: null, selectedId: null, shopOpen: false, killedBy: null, toasts: [], feed: [] });
    };
    // El nombre se fija al conectar; getToken se lee por ref en cada intento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest, identityReady]);

  // Capas DOM de placas y números de daño (dueño: runtime)
  useEffect(() => {
    if (!runtime || !welcome || !labelsRef.current || !floatingRef.current) return;
    return attachOverlays(runtime, labelsRef.current, floatingRef.current);
  }, [runtime, welcome]);

  // ---- Acciones compartidas por teclado, HUD y botones táctiles ----
  const actions: HudActions | null = useMemo(() => {
    if (!runtime) return null;
    const { client } = runtime;
    const mine = () => client.getShip(client.myShipId);
    return {
      toggleAttack: () => {
        const me = mine();
        if (!me || me.state !== 'alive') return;
        const { selectedId } = useHud.getState();
        // Alterna sobre el objetivo seleccionado (GDD §7): si ya lo ataca, cancela. «Ya lo ataca» es la última
        // intención del jugador (GDD §5, regla de entrada; DT-01)
        const current = client.myTargetId();
        if (current && (!selectedId || selectedId === current)) {
          client.cancelAttack();
          syncRef.current();
          return;
        }
        const target = client.getShip(selectedId);
        if (target && canAttackClient(client, me, target)) {
          client.attack(target.id);
          syncRef.current();
          completeHint(2);
        } else if (target) {
          useHud.getState().pushToast('warn', 'No puedes atacar ese objetivo');
        }
      },
      cycleTarget: (backwards = false) => {
        const next = cycleTarget(client, useHud.getState().selectedId, backwards);
        if (next) {
          useHud.getState().select(next);
          completeHint(1);
        }
      },
      toggleRepair: () => {
        const me = mine();
        if (!me || me.state !== 'alive') return;
        client.repair(!client.myRepairing());
        syncRef.current();
      },
      stop: () => {
        client.stop();
        runtime.clearClickMarker(); // S quita el marcador de destino al instante (VFX-SPEC §10)
      },
      togglePort: () => {
        const st = useHud.getState();
        if (st.shopOpen) return st.setShopOpen(false);
        // Fuera de la zona (AC-66) o con la BD caída (AC-132) no abre: el toast explica por qué (en móvil no hay title)
        const block = portBlock(st.me, st.saveWarning);
        if (block) st.pushToast(block.toast.kind, block.toast.text);
        else st.setShopOpen(true);
      },
      deselect: () => useHud.getState().select(null),
      respawn: () => {
        // Cero tráfico inútil: antes de que acabe la cuenta atrás el servidor lo rechazaría
        const death = useHud.getState().player?.death;
        if (!death || client.serverTime() < death.respawnAt) return;
        client.respawn();
      },
      buy: (itemId: string) => client.buy(itemId),
      selectShip: (classId: PlayerShipClass) => client.selectShip(classId),
      retry: () => client.retry(),
      retryLoad: () => client.retryLoad(),
      // AC-126 (DT-03): con el servidor caído, router.push acabaría en la página de error del navegador; antes se sondea
      // /healthz (exit-probe.ts): si responde, se navega; si no, el overlay lo explica y sigue Reintentar
      exit: async () => {
        const ok = await probeServerOnce('/healthz');
        if (ok) router.push('/');
        return ok;
      }
    };
  }, [runtime, router]);

  // ---- Entrada por canvas ----
  const onWaterClick = useCallback(
    (x: number, z: number) => {
      runtime?.client.moveTo(x, z);
      syncRef.current(); // navegar deja de reparar (H-21): el HUD lo refleja ya, como con Reparar y Atacar
      completeHint(0);
    },
    [runtime]
  );
  const onShipClick = useCallback((id: string) => {
    useHud.getState().select(id);
    completeHint(1);
  }, []);
  const onShipDoubleClick = useCallback(
    (id: string) => {
      useHud.getState().select(id);
      completeHint(1);
      actions?.toggleAttack();
    },
    [actions]
  );

  // ---- Teclado (GDD §5): solo las teclas del juego ----
  useEffect(() => {
    if (!actions) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Sin partida que mandar (AC-131, AC-133): las teclas no generan intenciones y Enter y Espacio quedan para el overlay
      const { connection } = useHud.getState();
      if (connection === 'load-failed' || connection === 'kicked') return;
      // Una pulsación, como mucho una intención (GDD §5): la autorrepetición de una tecla mantenida no cuenta
      if (e.repeat) {
        if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
        return;
      }
      const st = useHud.getState();
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (st.player?.death) actions.respawn(); // hundido: Espacio zarpa (Enter, con el foco en Zarpar)
          else actions.toggleAttack();
          break;
        case 'Tab':
          e.preventDefault();
          actions.cycleTarget(e.shiftKey);
          break;
        case 'Escape': {
          // 1.ª pulsación: cierra la tienda o cancela el ataque; 2.ª: deselecciona (sin red: AC-28, AC-125)
          if (st.shopOpen) st.setShopOpen(false);
          else if (runtime?.client.myTargetId()) {
            runtime.client.cancelAttack();
            syncRef.current();
          } else st.select(null);
          break;
        }
        case 'KeyS':
          actions.stop();
          break;
        case 'KeyR':
          actions.toggleRepair();
          break;
        case 'KeyP':
          actions.togglePort();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, runtime]);

  // ---- Puente de depuración de solo lectura para los harnesses e2e y de rendimiento ----
  useEffect(() => {
    if (!runtime) return;
    const { client } = runtime;
    const view = (s: ReturnType<typeof client.getShip>) =>
      s && {
        id: s.id,
        kind: s.kind,
        classId: s.classId,
        name: s.name,
        x: s.x,
        z: s.z,
        heading: s.heading,
        hp: s.hp,
        maxHp: s.maxHp,
        state: s.state,
        targetId: s.targetId,
        repairing: s.repairing,
        protectedUntil: s.protectedUntil,
        screen: runtime.project(s.x, s.z)
      };
    window.__SEA_BATTLE__ = {
      ready: () => client.state === 'connected' && !!client.welcome && runtime.renderInfo.calls > 0,
      serverTime: () => client.serverTime(),
      me: () => view(client.getShip(client.myShipId)) ?? null,
      ships: () => [...client.getShips()].map((s) => view(s)),
      player: () => client.player,
      hud: () => {
        const { me, target, selectedId, shopOpen, connection, hint, feed, toasts, saveWarning } = useHud.getState();
        return { me, target, selectedId, shopOpen, connection, hint, feed, toasts, saveWarning };
      },
      renderInfo: () => ({ ...runtime.renderInfo }),
      runtime: () => runtime
    };
    return () => {
      delete window.__SEA_BATTLE__;
    };
  }, [runtime]);

  const dead = useHud((s) => !!s.player?.death);
  // AC-131: sin progreso no se entra al mundo. El overlay va sobre el fondo de «Conectando»; si queda el mundo de una
  // sesión anterior, el CSS lo oculta (.is-load-failed)
  const loadFailed = useHud((s) => s.connection === 'load-failed');

  return (
    <main className={`game-root ${dead ? 'is-dead' : ''} ${loadFailed ? 'is-load-failed' : ''}`}>
      {runtime && welcome && actions ? (
        <>
          <GameCanvas runtime={runtime} onWaterClick={onWaterClick} onShipClick={onShipClick} onShipDoubleClick={onShipDoubleClick} />
          <div ref={labelsRef} className="layer-labels" aria-hidden />
          <div ref={floatingRef} className="layer-floating" aria-hidden />
          <Hud client={runtime.client} actions={actions} islands={welcome.islands} viewRect={() => runtime.viewRect()} />
        </>
      ) : (
        !loadFailed && <Connecting />
      )}
      {actions && (welcome || loadFailed) && <ConnectionOverlay actions={actions} />}
    </main>
  );
}
