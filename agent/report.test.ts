import { describe, expect, it } from 'vitest';
import { ErrorOnce } from './report';
import { fakeIo } from './test/fake-io';

describe('ErrorOnce', () => {
  it('reports a failure once until it changes, and a recovery once', () => {
    const fake = fakeIo();
    const report = new ErrorOnce(fake.io, 'loop');
    report.recovered();
    report.failed(new Error('down'));
    report.failed(new Error('down'));
    report.failed('worse');
    report.recovered();
    report.recovered();
    report.failed(new Error('down'));
    expect(fake.err).toEqual([
      'loop: Error: down\n',
      'loop: worse\n',
      'loop: recovered\n',
      'loop: Error: down\n',
    ]);
  });
});
