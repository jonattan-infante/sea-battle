#!/usr/bin/env python3
"""Evaluadores-agente de las pruebas de legibilidad (protocolo de BACKLOG AC-72; ART-DIRECTION §18.1 y §18.2; precedente QA-68 §1).

Cada llamada es un agente nuevo: un proceso `claude -p` sin herramientas (`--tools ""`), sin MCP (`--strict-mcp-config` sin
`--mcp-config`), con cwd `/` (fuera del repositorio), sin guardar la sesión y con el mismo modelo para todos. Ve solo las imágenes
de su prueba (una, o la tira de referencia y la imagen en AC-165 clases), en el orden del manifiesto, y la instrucción literal,
en un único mensaje; responde una vez. Se guarda el jsonl entero de cada llamada.

Manifiesto (JSON): {"model": "...", "evaluators": 5, "context": [{"path", "sha256", "note"}], "items": [{"id", "images": [rutas],
"instruction": "..."}]}. `context` anota lo que `claude -p` carga por su cuenta (sin `--bare`, el `~/.claude/CLAUDE.md` global): el
lanzador comprueba su sha256 antes de llamar y no lanza nada si cambió.
Escribe en <salida>/: <id>-e<k>.jsonl, mapa.tsv (con el contexto en sus primeras líneas, «# …»; después id, evaluador, sha256 de
cada imagen y de la instrucción) y respuestas.md (el texto final de cada evaluador, literal). La puntuación no se hace aquí: la
hace game-qa con las respuestas literales.

Uso: python3 scripts/qa/evaluadores.py <manifiesto.json> <salida> [--dry-run] [--paralelo N]
Con --dry-run solo comprueba el manifiesto e imprime las llamadas y su tamaño, sin llamar a nada.
"""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def command(model: str) -> list:
    return [
        'claude', '-p',
        '--model', model,
        '--tools', '',
        '--strict-mcp-config',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--no-session-persistence',
    ]


def message(images: list, instruction: str) -> str:
    content = [{'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': base64.b64encode(b).decode()}} for b in images]
    content.append({'type': 'text', 'text': instruction})
    return json.dumps({'type': 'user', 'message': {'role': 'user', 'content': content}}) + '\n'


def final_text(jsonl: str) -> str:
    for line in reversed(jsonl.splitlines()):
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get('type') == 'result':
            return ev.get('result', '')
    return ''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('manifest')
    ap.add_argument('out')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--paralelo', type=int, default=4)
    args = ap.parse_args()

    with open(args.manifest, encoding='utf-8') as f:
        man = json.load(f)
    model, n = man['model'], man['evaluators']
    calls = []
    for item in man['items']:
        images = []
        for p in item['images']:
            with open(p, 'rb') as f:
                images.append(f.read())
        payload = message(images, item['instruction'])
        for k in range(1, n + 1):
            calls.append((item, k, images, payload))
    context = man.get('context', [])
    for c in context:
        with open(os.path.expanduser(c['path']), 'rb') as f:
            got = sha256(f.read())
        if got != c['sha256']:
            print(f'el contexto cambió: {c["path"]} tiene sha256 {got}, el manifiesto dice {c["sha256"]}; no se lanza nada')
            return 1
        print(f'contexto: {c["path"]} sha256 {got[:16]}… ({c["note"]})')
    print(f'{len(man["items"])} pruebas × {n} evaluadores = {len(calls)} llamadas · modelo {model}')
    print('orden:', ' '.join(repr(a) if a == '' else a for a in command(model)), '(cwd /)')
    if args.dry_run:
        for item in man['items']:
            print(f'- {item["id"]}: {len(item["images"])} imagen(es), instrucción sha256 {sha256(item["instruction"].encode())[:16]}…')
        return 0

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'mapa.tsv'), 'w', encoding='utf-8') as m:
        for c in context:
            m.write(f'# contexto: {c["path"]} sha256 {c["sha256"]} ({c["note"]})\n')
        m.write(f'# orden: {" ".join(repr(a) if a == "" else a for a in command(model))} (cwd /)\n')
        m.write('id\tevaluador\timagenes_sha256\tinstruccion_sha256\n')
        for item, k, images, _ in calls:
            m.write(f'{item["id"]}\te{k:02d}\t{",".join(sha256(b) for b in images)}\t{sha256(item["instruction"].encode())}\n')

    def run(call):
        item, k, _, payload = call
        path = os.path.join(args.out, f'{item["id"]}-e{k:02d}.jsonl')
        p = subprocess.run(command(model), input=payload, capture_output=True, text=True, cwd='/')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(p.stdout)
        return item['id'], k, p.returncode, final_text(p.stdout), p.stderr[-500:]

    with ThreadPoolExecutor(max_workers=args.paralelo) as pool:
        results = list(pool.map(run, calls))
    with open(os.path.join(args.out, 'respuestas.md'), 'w', encoding='utf-8') as r:
        for id_, k, code, text, err in results:
            r.write(f'## {id_} · e{k:02d} (exit {code})\n\n{text}\n\n')
            if code != 0:
                r.write(f'stderr: {err}\n\n')
    failed = [f'{i} e{k:02d}' for i, k, code, _, _ in results if code != 0]
    print(f'hecho: {len(results) - len(failed)} de {len(results)} con exit 0' + (f'; fallaron: {", ".join(failed)}' if failed else ''))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
