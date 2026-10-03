import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Node resolves a module's own URL to its real path, while process.argv[1] keeps the path the host
// typed. The installed skill is a symlink/junction, so comparing those two as raw strings makes the
// CLI block skip silently: exit 0, no stdout, no stderr, no artifacts.
export function isCliEntrypoint(moduleUrl) {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return fs.realpathSync(path.resolve(invoked)) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
