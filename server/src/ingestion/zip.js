import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) =>
      err ? reject(err) : resolve(zipfile),
    );
  });
}

function entryStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => (err ? reject(err) : resolve(readStream)));
  });
}

/** Resolves an entry name inside dest, or null when it would escape it (zip slip). */
function safeJoin(dest, name) {
  const target = path.resolve(dest, name);
  return target === dest || target.startsWith(dest + path.sep) ? target : null;
}

/**
 * Extracts a zip archive into destDir, one entry at a time (bounded memory for
 * large repository zips). Symlink entries are skipped; zip-slip attempts
 * reject the whole extraction.
 *
 * @param {string} zipPath
 * @param {string} destDir
 */
export async function extractZip(zipPath, destDir) {
  const dest = path.resolve(destDir);
  fs.mkdirSync(dest, { recursive: true });
  const zipfile = await openZip(zipPath);
  await new Promise((resolve, reject) => {
    zipfile.on('error', reject);
    zipfile.on('end', resolve);
    zipfile.on('entry', (entry) => {
      handleEntry(zipfile, entry, dest).then(
        () => zipfile.readEntry(),
        (err) => reject(err),
      );
    });
    zipfile.readEntry();
  });
}

async function handleEntry(zipfile, entry, dest) {
  const target = safeJoin(dest, entry.fileName);
  if (target === null) {
    throw new Error(`Blocked zip entry outside the target directory: ${entry.fileName}`);
  }
  if (entry.fileName.endsWith('/')) {
    fs.mkdirSync(target, { recursive: true });
    return;
  }
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if (mode !== 0 && (mode & 0xf000) === 0xa000) {
    return; // skip symlinks: git repos store none that matter for analysis
  }
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const readStream = await entryStream(zipfile, entry);
  await pipeline(readStream, fs.createWriteStream(target));
}
