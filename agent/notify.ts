/** A native notification: macOS through osascript, Linux through notify-send. */
import type { Io } from './io';

const TIMEOUT_MS = 5000;

/** AppleScript string literal. */
export function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export async function notify(io: Io, title: string, body: string): Promise<void> {
  if (io.platform === 'darwin') {
    const script = `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}`;
    await io.exec('osascript', ['-e', script], TIMEOUT_MS);
  } else if (io.platform === 'linux') {
    await io.exec('notify-send', ['--app-name=Bottega', title, body], TIMEOUT_MS);
  }
}
