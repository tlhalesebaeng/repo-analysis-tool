import { forEachLine, spawnGit } from '../git/exec.js';

/**
 * Deep-clones a repository as a bare mirror (all refs) into dest, reporting
 * git's object-receiving percentage through onProgress (0-100).
 *
 * @param {{ url: string, dest: string, onProgress?: (pct: number) => void }} opts
 */
export async function cloneMirror({ url, dest, onProgress }) {
  const { child, done } = spawnGit(['clone', '--mirror', '--progress', url, dest]);
  await forEachLine(child.stderr, (line) => {
    const m = /(\d+)%/.exec(line);
    if (m && onProgress) {
      onProgress(Number(m[1]));
    }
  });
  await done;
}
