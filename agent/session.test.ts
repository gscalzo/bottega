import { describe, expect, it } from 'vitest';
import { fakeIo } from './test/fake-io';
import {
  findClaudePid,
  heartbeatPath,
  markerPath,
  parsePs,
  pidMarkerPath,
  repoSlugFor,
  resolveSessionId,
} from './session';

describe('repoSlugFor', () => {
  it('names the room after the directory that holds .git', () => {
    const fake = fakeIo({ git: () => '/work/Raffaello/.git' });
    expect(repoSlugFor(fake.io, '/work/Raffaello/src')).toBe('raffaello');
  });
  it('sends worktrees to the main repository room', () => {
    const fake = fakeIo({ git: () => '/work/neurona/.git' });
    expect(repoSlugFor(fake.io, '/work/neurona-worktrees/feature-x')).toBe('neurona');
  });
  it('uses the bare repository directory as is', () => {
    const fake = fakeIo({ git: () => '/srv/bare.git' });
    expect(repoSlugFor(fake.io, '/srv/bare.git')).toBe('bare-git');
  });
  it('falls back to the working directory name outside git', () => {
    const fake = fakeIo({ git: () => null });
    expect(repoSlugFor(fake.io, '/Users/gio/Some Notes/')).toBe('some-notes');
    expect(repoSlugFor(fake.io, '/x/y//')).toBe('y');
    expect(repoSlugFor(fake.io, '/')).toBe('lobby');
  });
});

describe('paths', () => {
  it('encode the key under ~/.bottega/state', () => {
    const io = fakeIo().io;
    expect(markerPath(io, '/work/a b')).toBe('/home/gio/.bottega/state/cwd/%2Fwork%2Fa%20b');
    expect(heartbeatPath(io, 'sess/1')).toBe('/home/gio/.bottega/state/heartbeat/sess%2F1');
    expect(pidMarkerPath(io, '16621')).toBe('/home/gio/.bottega/state/pid/16621');
  });
});

describe('parsePs', () => {
  it('reads the parent pid and the command, whatever the padding', () => {
    expect(parsePs('  3000 /usr/local/bin/claude\n')).toEqual({
      ppid: 3000,
      comm: '/usr/local/bin/claude',
    });
    expect(parsePs('3000   claude')).toEqual({ ppid: 3000, comm: 'claude' });
    expect(parsePs('')).toBeNull();
    expect(parsePs('\n')).toBeNull();
    expect(parsePs('garbage')).toBeNull();
    expect(parsePs('x 3000 claude')).toBeNull();
    expect(parsePs('3000')).toBeNull();
  });
});

describe('findClaudePid', () => {
  const tree: Record<string, string> = {
    '4000': '  3000 /bin/zsh\n',
    '3000': '2000    claude\n',
    '2000': '1 /sbin/launchd',
  };
  const ps = (_cmd: string, args: string[]) => ({
    status: 0,
    stdout: `${tree[args[3] ?? ''] ?? ''}\n`,
    stderr: '',
  });
  it('trusts CLAUDE_PID when the harness exports it', async () => {
    const fake = fakeIo({ env: { CLAUDE_PID: '77' } });
    expect(await findClaudePid(fake.io)).toBe('77');
    expect(fake.execs).toEqual([]);
  });
  it('walks up the process tree to the nearest claude', async () => {
    const fake = fakeIo({ ppid: 4000, exec: ps });
    expect(await findClaudePid(fake.io)).toBe('3000');
    expect(fake.execs.map((e) => e.args)).toEqual([
      ['-o', 'ppid=,comm=', '-p', '4000'],
      ['-o', 'ppid=,comm=', '-p', '3000'],
    ]);
    const direct = fakeIo({
      ppid: 3000,
      exec: () => ({ status: 0, stdout: '2000 /usr/local/bin/claude', stderr: '' }),
    });
    expect(await findClaudePid(direct.io)).toBe('3000');
  });
  it('is null when ps fails, the tree ends, or nothing is claude', async () => {
    expect(
      await findClaudePid(
        fakeIo({ ppid: 4000, exec: () => ({ status: 1, stdout: '', stderr: '' }) }).io,
      ),
    ).toBeNull();
    expect(
      await findClaudePid(
        fakeIo({ ppid: 4000, exec: () => ({ status: 1, stdout: '3000 claude', stderr: '' }) }).io,
      ),
    ).toBeNull();
    expect(
      await findClaudePid(
        fakeIo({ ppid: 4000, exec: () => ({ status: 0, stdout: '\n', stderr: '' }) }).io,
      ),
    ).toBeNull();
    const noClaude = { '4000': '3000 zsh', '3000': '1 launchd' };
    expect(
      await findClaudePid(
        fakeIo({
          ppid: 4000,
          exec: (_c, a) => ({
            status: 0,
            stdout: noClaude[a[3] as keyof typeof noClaude] ?? '',
            stderr: '',
          }),
        }).io,
      ),
    ).toBeNull();
    const init = fakeIo({ ppid: 1 });
    expect(await findClaudePid(init.io)).toBeNull();
    expect(init.execs).toEqual([]);
    const loop = fakeIo({ ppid: 5, exec: () => ({ status: 0, stdout: '5 zsh', stderr: '' }) });
    expect(await findClaudePid(loop.io)).toBeNull();
    expect(loop.execs).toHaveLength(12);
  });
});

describe('resolveSessionId', () => {
  it('prefers the flag, then the env vars, then the directory marker', () => {
    const env = { BOTTEGA_SESSION_ID: 'from-bottega', CLAUDE_CODE_SESSION_ID: 'from-claude' };
    const marker = { '/home/gio/.bottega/state/cwd/%2Fwork%2Fraffaello': ' from-marker \n' };
    expect(resolveSessionId(fakeIo({ env, files: marker }).io, 'flag')).toBe('flag');
    expect(resolveSessionId(fakeIo({ env, files: marker }).io, undefined)).toBe('from-bottega');
    expect(
      resolveSessionId(
        fakeIo({ env: { CLAUDE_CODE_SESSION_ID: 'from-claude' }, files: marker }).io,
        undefined,
      ),
    ).toBe('from-claude');
    expect(resolveSessionId(fakeIo({ files: marker }).io, undefined)).toBe('from-marker');
  });
  it('is null with nothing to go on', () => {
    expect(resolveSessionId(fakeIo().io, undefined)).toBeNull();
    expect(resolveSessionId(fakeIo({ env: { BOTTEGA_SESSION_ID: '' } }).io, undefined)).toBeNull();
    const blank = { '/home/gio/.bottega/state/cwd/%2Fwork%2Fraffaello': '  \n' };
    expect(resolveSessionId(fakeIo({ files: blank }).io, undefined)).toBeNull();
  });
});
