import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nodeIo } from './io';

const dir = mkdtempSync(join(tmpdir(), 'bottega-io-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('nodeIo files', () => {
  it('reads null for a missing file, writes through new directories, appends and deletes', () => {
    const path = join(dir, 'a', 'b', 'file.txt');
    expect(nodeIo.readFile(path)).toBeNull();
    nodeIo.writeFile(path, 'one\n');
    nodeIo.appendFile(path, 'two\n');
    expect(nodeIo.readFile(path)).toBe('one\ntwo\n');
    nodeIo.deleteFile(path);
    nodeIo.deleteFile(path);
    expect(existsSync(path)).toBe(false);
    const fresh = join(dir, 'c', 'd.txt');
    nodeIo.appendFile(fresh, 'x');
    expect(nodeIo.readFile(fresh)).toBe('x');
  });
});

describe('nodeIo exec and sleep', () => {
  it('runs a command and reports status and output', async () => {
    const ok = await nodeIo.exec(
      'node',
      ['-e', "process.stdout.write('out'); process.stderr.write('err')"],
      5000,
    );
    expect(ok).toEqual({ status: 0, stdout: 'out', stderr: 'err' });
    const failed = await nodeIo.exec(
      'node',
      ['-e', "process.stderr.write('boom'); process.exit(3)"],
      5000,
    );
    expect(failed).toEqual({ status: 3, stdout: '', stderr: 'boom' });
    const missing = await nodeIo.exec('definitely-not-a-command-xyz', [], 5000);
    expect(missing.status).toBeNull();
    expect(missing.stderr).toContain('ENOENT');
    const slow = await nodeIo.exec('node', ['-e', 'setTimeout(() => {}, 5000)'], 100);
    expect(slow.status).toBeNull();
  });
  it('sleeps for about the time asked', async () => {
    const before = Date.now();
    await nodeIo.sleep(30);
    expect(Date.now() - before).toBeGreaterThanOrEqual(25);
  });
});

describe('nodeIo environment', () => {
  it('reports the process environment, cwd, home, host, pids, platform and clock', () => {
    expect(nodeIo.env).toBe(process.env);
    expect(nodeIo.platform).toBe(process.platform);
    expect(nodeIo.pid).toBe(process.pid);
    expect(nodeIo.ppid).toBe(process.ppid);
    expect(nodeIo.cwd()).toBe(process.cwd());
    expect(nodeIo.homedir().length).toBeGreaterThan(0);
    expect(nodeIo.hostname().length).toBeGreaterThan(0);
    expect(Math.abs(nodeIo.now() - Date.now())).toBeLessThan(1000);
  });
  it('finds the common git dir of this repository and nothing in a temp dir', () => {
    expect(nodeIo.gitCommonDir(process.cwd())?.endsWith('/.git')).toBe(true);
    expect(nodeIo.gitCommonDir(dir)).toBeNull();
  });
  it('writes to the process streams', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    nodeIo.stdout('o');
    nodeIo.stderr('e');
    expect(out).toHaveBeenCalledWith('o');
    expect(err).toHaveBeenCalledWith('e');
    out.mockRestore();
    err.mockRestore();
  });
});

describe('nodeIo fetch', () => {
  const server = createServer((req, res) => {
    if (req.url === '/slow') return;
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString();
    });
    req.on('end', () => {
      res.writeHead(418, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          body,
          id: req.headers['cf-access-client-id'],
        }),
      );
    });
  });
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it('sends method, headers and body and returns status and text', async () => {
    const res = await nodeIo.fetch(`${base}/x`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Access-Client-Id': 'me' },
      body: '{"a":1}',
      timeoutMs: 2000,
    });
    expect(res.status).toBe(418);
    expect(JSON.parse(res.body)).toEqual({ method: 'POST', url: '/x', body: '{"a":1}', id: 'me' });
  });
  it('aborts after the timeout', async () => {
    await expect(
      nodeIo.fetch(`${base}/slow`, { method: 'GET', headers: {}, timeoutMs: 50 }),
    ).rejects.toThrow();
  });
});
