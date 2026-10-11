# 🎮 Sistema Multijugador en Tiempo Real - Sea Battle

## 📋 Resumen

Se ha implementado exitosamente un sistema de **multijugador en tiempo real** usando **Socket.IO** con Next.js y un servidor personalizado Node.js.

---

## ✅ Componentes Implementados

### 1. **Servidor Socket.IO Personalizado** (`server.js`)

#### Características:
- ✅ Servidor Node.js con Next.js integrado
- ✅ Socket.IO para comunicación bidireccional en tiempo real
- ✅ Gestión de estado del juego (barcos, NPCs, jugadores)
- ✅ Sistema de respawn automático de NPCs cada 30 segundos
- ✅ Sincronización de posiciones de barcos
- ✅ Sincronización de disparos y daños
- ✅ Detección de encuentros entre jugadores

#### Eventos Socket.IO:
```javascript
// Eventos del cliente → servidor
'player_join'           // Unirse al juego
'ship_position_update'  // Actualizar posición del barco
'fire_bullet'           // Disparar
'ship_damage'           // Aplicar daño a barco
'npc_destroyed'         // NPC destruido

// Eventos del servidor → cliente
'game_state'            // Estado inicial del juego
'ship_position_updated' // Posición actualizada de barco
'bullet_fired'          // Disparo realizado
'ship_damaged'          // Barco dañado
'npc_destroyed'         // NPC eliminado
'npc_spawned'           // Nuevo NPC generado
'player_joined'         // Nuevo jugador unido
'player_left'           // Jugador desconectado
```

---

### 2. **Cliente Socket.IO** (`src/hooks/useSocket.ts`)

Hook personalizado de React que maneja:
- ✅ Conexión automática al servidor
- ✅ Autenticación con Clerk
- ✅ Emisión de eventos de juego
- ✅ Listeners para eventos entrantes
- ✅ Reconexión automática

---

### 3. **Sincronización de Juego** (`src/components/GameMap.tsx`)

Actualizado para:
- ✅ Renderizar otros jugadores en tiempo real
- ✅ Sincronizar posiciones de barcos entre clientes
- ✅ Sincronizar disparos y efectos visuales
- ✅ Manejar conexiones/desconexiones de jugadores
- ✅ Mostrar barcos de otros jugadores con identificadores únicos

---

### 4. **Gestión de Estado**

```typescript
// Estado del servidor (server.js)
gameState = {
  ships: Map<shipId, Ship>,        // Todos los barcos activos
  npcs: Map<npcId, NPC>,            // NPCs en el mapa
  players: Map<socketId, Player>,   // Jugadores conectados
  map: {
    width: 50,
    height: 50,
    occupiedPositions: Position[]
  }
}

// Estado del cliente (GameMap.tsx)
- ships: Ship[]                     // Barcos locales
- otherPlayers: Map<shipId, Ship>   // Barcos de otros jugadores
- npcs: NPC[]                       // NPCs
- bullets: Bullet[]                 // Proyectiles activos
```

---

## 🚀 Cómo Iniciar el Juego Multijugador

### 1. Iniciar el servidor

```bash
npm run dev
```

El servidor se iniciará en: `http://localhost:3000`

### 2. Abrir múltiples navegadores

Para probar el multijugador:

**Opción A - Manualmente:**
- Abre `http://localhost:3000` en el navegador 1
- Abre `http://localhost:3000` en el navegador 2 (pestaña incógnito o navegador diferente)

**Opción B - Con Playwright (automatizado):**
```bash
# El servidor ya incluye Playwright MCP para testing
```

### 3. Autenticarse con Clerk

⚠️ **IMPORTANTE**: Para que Socket.IO funcione, cada jugador debe:
1. Hacer clic en "Jugar Ahora"
2. Registrarse o iniciar sesión con Clerk
3. El hook `useSocket` se conectará automáticamente después de autenticar

### 4. Jugar

Una vez autenticados:
- ✅ Verás tu barco en el mapa
- ✅ Verás los barcos de otros jugadores conectados
- ✅ Los movimientos se sincronizan en tiempo real
- ✅ Los disparos y daños se replican entre jugadores

---

## 🎯 Capturas de Pantalla

### Jugador 1 (Caos)
![Jugador 1](/.playwright-mcp/multijugador-demo-jugador1-final.png)

### Jugador 2 (Barbarossa)
![Jugador 2](/.playwright-mcp/multijugador-demo-jugador2-final.png)

**Observa que:**
- El Jugador 2 puede ver el barco "Caos" del Jugador 1
- Cada jugador tiene su propia perspectiva del juego
- Los barcos se renderizan en tiempo real

---

## 🔧 Arquitectura Técnica

### Flujo de Comunicación

```
┌─────────────┐         WebSocket         ┌─────────────┐
│  Cliente 1  │◄────────────────────────►│   Servidor  │
│  (Browser)  │                           │  Socket.IO  │
└─────────────┘                           │   + Next.js │
                                          └─────────────┘
┌─────────────┐         WebSocket                ▲
│  Cliente 2  │◄─────────────────────────────────┘
│  (Browser)  │
└─────────────┘
```

### Sincronización de Movimiento

```
Jugador 1 presiona "W"
    ↓
Ship.tsx actualiza posición local
    ↓
GameMap.tsx emite 'ship_position_update'
    ↓
Servidor recibe y actualiza gameState.ships
    ↓
Servidor emite 'ship_position_updated' a todos
    ↓
Cliente 2 recibe evento
    ↓
GameMap.tsx actualiza otherPlayers Map
    ↓
Ship.tsx de Jugador 1 se renderiza en pantalla de Jugador 2
```

---

## 📦 Archivos Modificados

```
sea-battle/
├── server.js                          # ✨ NUEVO - Servidor personalizado
├── package.json                       # Actualizado - Script dev
├── src/
│   ├── hooks/
│   │   └── useSocket.ts              # Actualizado - Conexión mejorada
│   └── components/
│       └── GameMap.tsx               # Actualizado - Renderizado multijugador
└── MULTIJUGADOR.md                   # ✨ NUEVO - Esta documentación
```

---

## ⚙️ Configuración

### Variables de Entorno

```bash
# .env.local
PORT=3000                              # Puerto del servidor
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

---

## 🐛 Troubleshooting

### ❌ "Socket.IO no conecta"

**Problema**: Los jugadores no se ven entre sí.

**Solución**:
1. Verifica que ambos jugadores estén autenticados con Clerk
2. Abre la consola del navegador y busca: `🔌 Conectando a Socket.IO`
3. Verifica que el servidor muestre: `👤 Jugador conectado: [socket-id]`

### ❌ "Puerto 3000 en uso"

**Problema**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solución**:
```bash
# Matar proceso en puerto 3000
lsof -ti:3000 | xargs kill -9

# Reiniciar servidor
npm run dev
```

### ❌ "Los barcos no se sincronizan"

**Problema**: Los movimientos no se replican.

**Solución**:
1. Verifica que `useSocket.ts` esté conectado
2. Revisa los logs del servidor: `npm run dev`
3. Asegúrate de que `onPositionUpdate` esté llamando `updateShipPosition`

---

## 🔮 Próximos Pasos (Futuras Mejoras)

### Corto Plazo
- [ ] Chat entre jugadores
- [ ] Sistema de salas/lobbies
- [ ] Límite de jugadores por partida
- [ ] Indicador visual de latencia

### Mediano Plazo
- [ ] Persistencia de partidas (Redis/DB)
- [ ] Sistema de matchmaking
- [ ] Leaderboard global
- [ ] Replay de partidas

### Largo Plazo
- [ ] Modo torneo
- [ ] Clanes/Guilds
- [ ] Cosmética de barcos (skins)
- [ ] Eventos especiales

---

## 📚 Recursos

- [Socket.IO Docs](https://socket.io/docs/v4/)
- [Next.js Custom Server](https://nextjs.org/docs/pages/building-your-application/configuring/custom-server)
- [Clerk Authentication](https://clerk.com/docs)
- [Playwright Testing](https://playwright.dev/)

---

## 👨‍💻 Desarrollado por

**Jonattan** - Implementación completa de sistema multijugador con Socket.IO

---

## 📄 Licencia

MIT License - Sea Battle Multiplayer System
