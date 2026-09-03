import { describe, expect, it } from 'vitest';
import { appleScriptString, notify } from './notify';
import { fakeIo } from './test/fake-io';

describe('appleScriptString', () => {
  it('quotes and escapes for AppleScript', () => {
    expect(appleScriptString('plain')).toBe('"plain"');
    expect(appleScriptString('say "hi" \\ there')).toBe('"say \\"hi\\" \\\\ there"');
  });
});

describe('notify', () => {
  it('uses osascript on macOS', async () => {
    const fake = fakeIo({ platform: 'darwin' });
    await notify(fake.io, 'Bottega', 'claude abcd needs you');
    expect(fake.execs).toEqual([
      {
        cmd: 'osascript',
        args: ['-e', 'display notification "claude abcd needs you" with title "Bottega"'],
        timeoutMs: 5000,
      },
    ]);
  });
  it('uses notify-send on Linux', async () => {
    const fake = fakeIo({ platform: 'linux' });
    await notify(fake.io, 'T', 'B');
    expect(fake.execs).toEqual([
      { cmd: 'notify-send', args: ['--app-name=Bottega', 'T', 'B'], timeoutMs: 5000 },
    ]);
  });
  it('does nothing elsewhere', async () => {
    const fake = fakeIo({ platform: 'win32' });
    await notify(fake.io, 'T', 'B');
    expect(fake.execs).toEqual([]);
  });
});
