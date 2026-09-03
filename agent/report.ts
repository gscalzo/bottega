/** Long-running loops report a failure once, not every pass, and say when it clears. */
import type { Io } from './io';

export class ErrorOnce {
  private last: string | null = null;

  constructor(
    private readonly io: Io,
    private readonly prefix: string,
  ) {}

  failed(err: unknown): void {
    const message = String(err);
    if (message === this.last) return;
    this.io.stderr(`${this.prefix}: ${message}\n`);
    this.last = message;
  }

  recovered(): void {
    if (this.last === null) return;
    this.io.stderr(`${this.prefix}: recovered\n`);
    this.last = null;
  }
}
