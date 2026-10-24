import { promises as fs } from 'node:fs';
import { join } from 'node:path';

// Defaults (can be overridden with environment variables)
const DEFAULT_WINDOW_MS = Number(process.env.CRASH_GUARD_WINDOW_MS) || 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX = Number(process.env.CRASH_GUARD_MAX_RESTARTS) || 5; // max restarts allowed in window

function attemptsFile(projectDir) {
  return join(projectDir, 'tmp', 'restart_attempts.json');
}

export async function shouldStart(projectDir = process.env.INIT_CWD || process.cwd(), maxAttempts = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS) {
  const file = attemptsFile(projectDir);
  try {
    await fs.mkdir(join(projectDir, 'tmp'), { recursive: true });
    let arr = [];
    try {
      const raw = await fs.readFile(file, 'utf8');
      arr = JSON.parse(raw);
      if (!Array.isArray(arr)) arr = [];
    }
    catch (e) {
      arr = [];
    }
    const now = Date.now();
    const cutoff = now - windowMs;
    arr = arr.filter(ts => typeof ts === 'number' && ts >= cutoff);
    if (arr.length >= maxAttempts) {
      // persist pruned array
      await fs.writeFile(file, JSON.stringify(arr), 'utf8');
      return false;
    }
    arr.push(now);
    await fs.writeFile(file, JSON.stringify(arr), 'utf8');
    return true;
  }
  catch (err) {
    // If filesystem is unavailable, allow start to avoid blocking.
    console.warn('[crashGuard] filesystem access failed, allowing start', err && err.message ? err.message : String(err));
    return true;
  }
}

export async function reset(projectDir = process.env.INIT_CWD || process.cwd()) {
  const file = attemptsFile(projectDir);
  try {
    await fs.unlink(file).catch(() => { });
  }
  catch (err) {
    // ignore
  }
}
