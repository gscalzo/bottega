/** Entry point of the bundled client (`~/.bottega/bin/bottega.mjs`). */
import { run } from './cli';
import { nodeIo } from './io';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

void run(process.argv.slice(2), readStdin, nodeIo).then((code) => {
  process.exitCode = code;
});
