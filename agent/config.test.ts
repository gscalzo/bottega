import { describe, expect, it } from 'vitest';
import { bottegaDir, DEFAULT_URL, loadConfig, parseEnvFile } from './config';
import { fakeIo } from './test/fake-io';

describe('bottegaDir', () => {
  it('is ~/.bottega unless BOTTEGA_HOME says otherwise', () => {
    expect(bottegaDir(fakeIo().io)).toBe('/home/gio/.bottega');
    expect(bottegaDir(fakeIo({ env: { BOTTEGA_HOME: '/tmp/b' } }).io)).toBe('/tmp/b');
  });
});

describe('parseEnvFile', () => {
  it('reads KEY=VALUE lines, ignoring comments, blanks and junk', () => {
    expect(
      parseEnvFile(
        [
          '# comment',
          '',
          'A=1',
          '  B = two words ',
          'C="quoted"',
          "D='single'",
          'E="mismatched\'',
          'F=a=b',
          'novalue',
          '=nokey',
          'G=',
          'H="',
          'X=ends#',
          '  # indented=comment',
          "Q=''",
        ].join('\n'),
      ),
    ).toEqual({
      A: '1',
      B: 'two words',
      C: 'quoted',
      D: 'single',
      E: '"mismatched\'',
      F: 'a=b',
      G: '',
      H: '"',
      X: 'ends#',
      Q: '',
    });
  });
});

describe('loadConfig', () => {
  it('defaults to the deployed board with no credentials', () => {
    expect(loadConfig(fakeIo().io)).toEqual({
      url: DEFAULT_URL,
      clientId: null,
      clientSecret: null,
    });
  });
  it('reads ~/.bottega/env and strips trailing slashes', () => {
    const fake = fakeIo({
      files: {
        '/home/gio/.bottega/env':
          'BOTTEGA_URL=http://localhost:8787//\nCF_ACCESS_CLIENT_ID=id.access\nCF_ACCESS_CLIENT_SECRET=s3cret\n',
      },
    });
    expect(loadConfig(fake.io)).toEqual({
      url: 'http://localhost:8787',
      clientId: 'id.access',
      clientSecret: 's3cret',
    });
  });
  it('lets the process environment win, and treats empty as unset', () => {
    const fake = fakeIo({
      env: { BOTTEGA_URL: 'https://other', CF_ACCESS_CLIENT_ID: '' },
      files: { '/home/gio/.bottega/env': 'BOTTEGA_URL=x\nCF_ACCESS_CLIENT_ID=file\n' },
    });
    expect(loadConfig(fake.io)).toEqual({
      url: 'https://other',
      clientId: null,
      clientSecret: null,
    });
  });
  it('honours BOTTEGA_HOME for the env file', () => {
    const fake = fakeIo({
      env: { BOTTEGA_HOME: '/alt' },
      files: { '/alt/env': 'BOTTEGA_URL=https://alt' },
    });
    expect(loadConfig(fake.io).url).toBe('https://alt');
  });
});
