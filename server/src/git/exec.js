import { spawn } from 'node:child_process';
import readline from 'node:readline';

/**
 * Runs git to completion, buffering stdout/stderr as text.
 *
 * @param {string[]} args
 * @param {{ cwd?: string, gitDir?: string }} [opts] gitDir for bare repos, cwd for worktrees.
 * @returns {Promise<{ stdout: string, stderr: string }>} Rejects on non-zero exit.
 */
export function runGit(args, { cwd, gitDir } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', gitDir ? ['--git-dir', gitDir, ...args] : args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`git ${args[0]} failed (exit ${code}): ${stderr.trim().slice(0, 500)}`));
      }
    });
  });
}

/**
 * Streaming variant for large outputs. Returns the child process plus a
 * promise that settles when git exits, so callers can consume stdout
 * line-by-line (or write to stdin) while the process runs.
 *
 * @param {string[]} args
 * @param {{ cwd?: string, gitDir?: string, stdin?: 'ignore' | 'pipe' }} [opts]
 */
export function spawnGit(args, { cwd, gitDir, stdin = 'ignore' } = {}) {
  const child = spawn('git', gitDir ? ['--git-dir', gitDir, ...args] : args, {
    cwd,
    stdio: [stdin, 'pipe', 'pipe'],
  });
  let stderrText = '';
  child.stderr.on('data', (d) => (stderrText += d));
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git ${args[0]} failed (exit ${code}): ${stderrText.trim().slice(0, 500)}`));
      }
    });
  });
  return { child, done };
}

/**
 * Calls onLine for every line of the stream and resolves when it ends.
 *
 * @param {NodeJS.ReadableStream} stream
 * @param {(line: string) => void} onLine
 */
export function forEachLine(stream, onLine) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: stream });
    rl.on('line', (line) => {
      try {
        onLine(line);
      } catch (err) {
        reject(err);
        rl.close();
      }
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
}
