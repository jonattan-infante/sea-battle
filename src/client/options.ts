// Opciones de cámara y teclas (E18, GDD §5): se guardan en el navegador, no en el servidor, porque son del aparato
// (AC-207). Sin DOM para probarlas con Jest: el almacenamiento llega como parámetro
import { Bindings, DEFAULT_BINDINGS, isValidBindings } from './key-bindings';

// «Centrada»: la cámara de la 1.0, siempre sobre el barco (AC-206). «Libre»: la vista libre de E13 (AC-116 a AC-124)
export type CameraMode = 'centered' | 'free';
export interface Options {
  camera: CameraMode;
  keys: Bindings;
}

export const OPTIONS_KEY = 'sea-battle-options';
const VERSION = 1;
export const DEFAULT_OPTIONS: Options = { camera: 'centered', keys: DEFAULT_BINDINGS };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

// Lo que no se entiende (roto, de otra versión o con un campo que esta no conoce) se descarta entero, sin aviso
export function parseOptions(raw: string | null): Options {
  if (raw === null) return DEFAULT_OPTIONS;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return DEFAULT_OPTIONS;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return DEFAULT_OPTIONS;
  const o = v as Record<string, unknown>;
  const fields = Object.keys(o);
  if (fields.length !== 3 || o.v !== VERSION) return DEFAULT_OPTIONS;
  if (o.camera !== 'centered' && o.camera !== 'free') return DEFAULT_OPTIONS;
  if (!isValidBindings(o.keys)) return DEFAULT_OPTIONS;
  return { camera: o.camera, keys: { ...o.keys } };
}

export function serializeOptions(o: Options): string {
  return JSON.stringify({ v: VERSION, camera: o.camera, keys: o.keys });
}

// Un almacenamiento bloqueado (modo privado, cookies de terceros) lanza al leer o escribir: se sigue con lo de por
// defecto o con lo de la sesión, en silencio
export function loadOptions(storage: StorageLike | undefined): Options {
  try {
    return parseOptions(storage ? storage.getItem(OPTIONS_KEY) : null);
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function saveOptions(o: Options, storage: StorageLike | undefined): void {
  try {
    storage?.setItem(OPTIONS_KEY, serializeOptions(o));
  } catch {
    // sin almacenamiento, la elección vale hasta recargar
  }
}
