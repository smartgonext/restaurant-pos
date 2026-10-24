const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * runWhisper
 * Attempts to run a whisper.cpp (ggml) binary on the provided WAV file.
 * If a binary or model isn't found, returns a helpful error object.
 *
 * opts = {
 *   execPath: optional absolute path to whisper binary
 *   modelPath: path to ggml model .bin
 *   lang: 'ta' or 'en'
 *   threads: number
 * }
 */
async function runWhisper(wavPath, opts = {}) {
  try {
    if (!wavPath || !fs.existsSync(wavPath)) {
      return { success: false, error: 'WAV file not found', wavPath };
    }

    const execCandidates = [];
    if (opts.execPath) execCandidates.push(opts.execPath);

    // Common packaged locations
    try {
      const resources = process.resourcesPath || path.join(__dirname, '..');
      execCandidates.push(path.join(resources, 'whisper', 'main.exe'));
      execCandidates.push(path.join(resources, 'whisper', 'main'));
      execCandidates.push(path.join(__dirname, '..', 'whisper', 'main.exe'));
      execCandidates.push(path.join(__dirname, '..', 'whisper', 'main'));
    } catch (e) {}

    let execPath = null;
    for (const c of execCandidates) {
      if (!c) continue;
      try {
        if (fs.existsSync(c)) { execPath = c; break; }
      } catch (e) {}
    }

    if (!execPath) {
      return { success: false, error: 'whisper binary not found', hint: 'Place whisper binary in resources/whisper/main.exe or set execPath' };
    }

    // Model path
    if (!opts.modelPath) {
      return { success: false, error: 'Model path not provided', hint: 'Set modelPath to a ggml model file (eg. ggml-medium.bin)' };
    }
    if (!fs.existsSync(opts.modelPath)) {
      return { success: false, error: 'Model file not found', modelPath: opts.modelPath };
    }

    const args = [];
    // whisper.cpp common flags: -m <model> -f <audio>
    args.push('-m', opts.modelPath);
    args.push('-f', wavPath);
    // threads
    if (opts.threads) args.push('-t', String(opts.threads));
    // language - whisper.cpp historically uses -l or --language in various forks; try '-l' first
    if (opts.lang) args.push('-l', opts.lang);

    // Add -otxt to get plain text output where supported
    args.push('-otxt');

    console.log('[WHISPER RUNNER] Exec:', execPath, args.join(' '));

    const child = spawn(execPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const exitCode = await new Promise((resolve) => child.on('close', resolve));

    // If there was stderr but exitCode 0, still parse stdout
    if (exitCode !== 0) {
      return { success: false, error: 'whisper failed', code: exitCode, stderr, stdout };
    }

    // Basic parsing: combine stdout lines, strip prompts
    let text = stdout.toString().trim();
    // Some builds print multiple lines or segment info; collapse to a single line
    text = text.split('\n').map(l => l.trim()).filter(Boolean).join(' ');

    return { success: true, text, raw: { stdout, stderr, exitCode } };
  } catch (err) {
    return { success: false, error: 'exception', details: err.message || String(err) };
  }
}

module.exports = { runWhisper };
