/** Worker entry point: the app on the real clock. */
import { createApp } from './app';

export type { AppContext, Env } from './app';

export default createApp(Date.now);
