import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo root (server/src -> server -> root). */
export const ROOT_DIR = path.resolve(here, '../..');

/**
 * Resolves runtime configuration from the environment.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ host: string, port: number, dataDir: string, dbPath: string, reposDir: string }}
 */
export function loadConfig(env = process.env) {
  const dataDir = env.RAT_DATA_DIR ? path.resolve(env.RAT_DATA_DIR) : path.join(ROOT_DIR, 'data');
  return {
    host: env.RAT_HOST ?? '127.0.0.1',
    port: Number(env.RAT_PORT ?? 3001),
    dataDir,
    dbPath: path.join(dataDir, 'rat.sqlite'),
    reposDir: path.join(dataDir, 'repos'),
  };
}
