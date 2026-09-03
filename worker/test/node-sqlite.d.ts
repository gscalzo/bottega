/**
 * Minimal typings for the node builtins the test-side D1 fake needs
 * (node:sqlite, Node ≥ 22.13; node:fs for reading the migrations).
 * @types/node is deliberately not installed: it collides with
 * @cloudflare/workers-types on the Worker globals.
 */
declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;
  export type SQLOutputValue = null | number | bigint | string | Uint8Array;

  export class StatementSync {
    all(...params: SQLInputValue[]): Record<string, SQLOutputValue>[];
    get(...params: SQLInputValue[]): Record<string, SQLOutputValue> | undefined;
    run(...params: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module 'node:fs' {
  export function readdirSync(path: string | URL): string[];
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}

/** `import.meta.url` (lib.dom / @types/node provide this; neither is loaded). */
interface ImportMeta {
  url: string;
}
