// Para el clúster temporal de global-setup.ts y espera a que el vigía borre su directorio
import { ChildProcess } from 'child_process';
import { stopWatchdog } from './cluster';

export default async function globalTeardown(): Promise<void> {
  const watchdog = (globalThis as { __PG_WATCHDOG__?: ChildProcess }).__PG_WATCHDOG__;
  if (watchdog) await stopWatchdog(watchdog);
}
