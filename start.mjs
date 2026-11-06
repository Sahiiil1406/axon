#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const apiPort = port('FINAL_PORT', 8900);
const frontendPort = port('FRONTEND_PORT', 5173);
const children = new Set();
let stopping = false;

function port(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a port between 1 and 65535`);
  }
  return value;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already stopped. */ }
    }
    process.exit(code);
  }, 1500);
  timer.unref();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

function run(directory, args, env = {}) {
  const child = spawn('npm', args, {
    cwd: resolve(root, directory), stdio: 'inherit', detached: true,
    env: { ...process.env, ...env },
  });
  children.add(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', () => children.delete(child));
  return child;
}

async function available(value) {
  await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${value} is already in use. Stop the existing service or choose FINAL_PORT / FRONTEND_PORT.`)));
    server.listen(value, '127.0.0.1', () => server.close(resolvePromise));
  });
}

async function waitForService(label, url, accepts) {
  const deadline = Date.now() + 15_000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && await accepts(response)) return;
    } catch {
      // The process may still be starting.
    }
    await delay(250);
  }
  throw new Error(`${label} did not become ready at ${url}. Check its startup output above.`);
}

try {
  if (apiPort === frontendPort) throw new Error('Backend and frontend need different ports.');
  await available(apiPort);
  await available(frontendPort);
  for (const directory of ['sdk', 'final/server', 'final/frontend']) {
    if (stopping) break;
    if (!existsSync(resolve(root, directory, 'node_modules'))) {
      console.log(`Installing ${directory} dependencies…`);
      const child = run(directory, ['ci']);
      const code = await new Promise(resolvePromise => child.once('exit', resolvePromise));
      if (code !== 0) throw new Error(`Dependency installation failed in ${directory}.`);
    }
  }
  if (!stopping) {
    const api = run('final/server', ['run', 'dev'], {
      FINAL_HOST: '127.0.0.1', FINAL_PORT: String(apiPort), FINAL_API_ONLY: 'true',
      AXON_FRONTEND_ORIGINS: `http://localhost:${frontendPort},http://127.0.0.1:${frontendPort}`,
    });
    api.once('exit', code => { if (!stopping) stop(code || 1); });
    await waitForService('Axon API', `http://127.0.0.1:${apiPort}/api/ready`,
      async response => (await response.json()).service === 'axon-api');
    const frontend = run('final/frontend', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {
      VITE_AXON_API_URL: `http://127.0.0.1:${apiPort}`,
    });
    frontend.once('exit', code => { if (!stopping) stop(code || 1); });
    await waitForService('Axon frontend', `http://127.0.0.1:${frontendPort}/`,
      response => response.headers.get('content-type')?.includes('text/html'));
    console.log(`\nAxon:    http://127.0.0.1:${frontendPort}\nConsole: http://127.0.0.1:${frontendPort}/app\nAPI:     http://127.0.0.1:${apiPort}\n\nPress Ctrl+C to stop both services.\n`);
  }
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  stop(1);
}
