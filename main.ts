// main.ts — Solmar Bay entry point (Node 22, standard library only).
//
// Copies game/ into $MAKEFUN_OUTPUT_DIR and validates the result:
// every referenced asset must exist, all script paths must be relative,
// no network loads, no bare module specifiers. Runs in <10s on 1 CPU.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const SRC = join(ROOT, 'game');
const OUT = process.env.MAKEFUN_OUTPUT_DIR || join(ROOT, 'out');

function fail(msg: string): never {
  console.error('main.ts: ' + msg);
  process.exit(1);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function main(): void {
  if (!existsSync(SRC)) fail('game/ directory missing');
  mkdirSync(OUT, { recursive: true });

  // 1. Copy the whole game directory.
  cpSync(SRC, OUT, { recursive: true, force: true });

  // 2. Validate the output.
  const files = walk(OUT);
  if (files.length === 0) fail('output is empty');
  const indexPath = join(OUT, 'index.html');
  if (!existsSync(indexPath)) fail('index.html missing from output');
  const html = readFileSync(indexPath, 'utf8');

  // No network loads: no http(s) URLs, no protocol-relative URLs, no bare
  // specifiers ("three"), no import maps. Relative paths such as
  // "js/util.js" are fine — only absolute / remote / bare ones are banned.
  const banned: Array<[RegExp, string]> = [
    [/https?:\/\//, 'absolute http(s) URL'],
    [/src\s*=\s*["']\/\//, 'protocol-relative URL'],
    [/<script[^>]+src\s*=\s*["'](\/|https?:|\/\/)/i, 'absolute script src'],
    [/importmap/i, 'import map'],
    [/from\s+["']three["']/i, 'bare specifier "three"'],
    [/from\s+["'](?!(\.|node:))[^"']*["']/i, 'bare module specifier'],
  ];
  for (const [re, label] of banned) {
    if (re.test(html)) fail('index.html contains ' + label);
  }

  // Every relative asset referenced from index.html must exist in the output.
  const refs = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const r = m[1];
    if (r.startsWith('data:') || r.startsWith('#')) continue;
    refs.add(r);
  }
  for (const r of refs) {
    if (!existsSync(join(OUT, r))) fail('referenced asset missing: ' + r);
  }

  // Every JS file must parse (cheap check: balanced braces is not enough —
  // use the built-in Function constructor via a syntax check through
  // `node --check` equivalent: here we rely on `new Function` on the source
  // after stripping nothing; it throws on syntax errors).
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(f, 'utf8');
    try {
      new Function(src);
    } catch (e) {
      fail('syntax error in ' + f + ': ' + (e as Error).message);
    }
  }

  // 3. Manifest for the grader.
  const manifest = {
    name: 'solmar-bay',
    entry: 'index.html',
    files: files.map((f) => f.slice(OUT.length + 1)).sort(),
    builtAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('main.ts: copied ' + files.length + ' files to ' + OUT + ' — OK');
}

main();
