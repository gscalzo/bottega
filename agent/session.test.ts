import { describe, expect, it } from 'vitest';
import { fakeIo } from './test/fake-io';
import { heartbeatPath, markerPath, repoSlugFor, resolveSessionId } from './session';

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
