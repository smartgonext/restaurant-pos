/**
 * VOSK Speech Recognition Engine
 * Offline, production-grade speech recognition for Electron POS
 * Supports English (India) and Tamil
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { spawn, spawnSync } = require('child_process');
const axios = require('axios');
const unzipper = require('unzipper');

const MODELS_DIR = path.join(app.getPath('userData'), 'vosk-models');
const EN_MODEL = 'vosk-model-small-en-us-0.15';
const TA_MODEL = 'vosk-model-small-ta-0.4';

const MODEL_URLS = {
  en: 'https://github.com/alphacep/vosk-api/releases/download/v0.3.45/vosk-model-small-en-us-0.15.zip',
  // Tamil model auto-download is not available reliably; prefer manual download
  ta: null
};

let voskProcess = null;
let modelPath = null;
let currentLang = 'en';

/**
 * Initialize VOSK engine with specified language model
 * Idempotent: if the requested language/model is already active, return quickly
 */
async function initVosk(language = 'en') {
  try {
    const modelName = language === 'ta' ? TA_MODEL : EN_MODEL;
    const candidateModelPath = path.join(MODELS_DIR, modelName);

    // Ensure models directory exists
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
    }

    // If already initialized for this language and model exists, return early
    if (currentLang === language && modelPath && fs.existsSync(modelPath) && path.resolve(modelPath) === path.resolve(candidateModelPath)) {
      return {
        success: true,
        modelPath,
        language: currentLang,
        alreadyInitialized: true
      };
    }

    // Check if model exists, if not return URL for download
    if (!fs.existsSync(candidateModelPath)) {
      return {
        success: false,
        needsDownload: true,
        modelName,
        downloadUrl: MODEL_URLS[language],
        reason: `Model ${modelName} not found`
      };
    }

    // Activate the requested model
    currentLang = language;
    modelPath = candidateModelPath;

    console.log(`[VOSK] Initialized model: ${modelName} (${language}) at ${modelPath}`);

    return {
      success: true,
      modelPath,
      language: currentLang,
      initialized: true
    };
  } catch (err) {
    console.error('[VOSK] Init failed:', err);
    return { success: false, error: err.message };
  }
} 

// Validate model integrity before starting listener


/**
 * Start listening with microphone stream
 * Returns object with start/stop methods
 */
async function startListening(onResult, onError) {
  try {
    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new Error('Model not loaded. Call initVosk first.');
    }

    // Use Python subprocess with pyaudio for cross-platform audio
    // If Python not available, return error with download instructions
    const basePath = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
    const pythonScript = path.join(basePath, 'backend', 'scripts', 'vosk_listener.py');
    
    console.log(`[VOSK] Spawning listener script: ${pythonScript}`);
    console.log(`[VOSK] Using model: ${modelPath}`);
    
    if (!fs.existsSync(pythonScript)) {
      console.error(`[VOSK] Script not found at: ${pythonScript}`);
      throw new Error(`VOSK Python script not found at ${pythonScript}`);
    }

    // Check model integrity (basic checks for required files)
    const integrity = checkModelIntegrity(currentLang);
    if (!integrity.ok) {
      const missingList = integrity.missing.join(', ');
      const errMsg = `Model appears incomplete or corrupted. Missing: ${missingList}. Try re-downloading the model.`;
      console.error('[VOSK]', errMsg);
      throw new Error(errMsg);
    }

    // Find a working Python executable (platform-aware order)
    const pythonCandidates = process.platform === 'win32'
      ? ['python','python.exe','python3','python3.exe']
      : ['python3','python','python3.exe','python.exe'];

    let pythonCmdToUse = null;
    for (const candidate of pythonCandidates) {
      try {
        const res = spawnSync(candidate, ['--version'], { stdio: 'ignore', timeout: 2000 });
        if (res && res.status === 0) {
          pythonCmdToUse = candidate;
          break;
        }
      } catch (e) {
        // ignore and try next
      }
    }

    if (!pythonCmdToUse) {
      const errMsg = `No Python executable found. Tried: ${pythonCandidates.join(', ')}`;
      console.error('[VOSK] ' + errMsg);
      throw new Error(errMsg);
    }

    voskProcess = spawn(pythonCmdToUse, [pythonScript, modelPath, currentLang], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      timeout: 60000
    });
    console.log(`[VOSK] Successfully spawned listener with: ${pythonCmdToUse}`);

    let buffer = '';

    voskProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[VOSK OUT]', output);
      
      try {
        const result = JSON.parse(output.trim());
        if (result.error) {
          if (onError) onError({ error: result.error });
          return;
        }
        if (result.result && result.result.length > 0) {
          const text = result.result.map(r => r.conf ? r.result : '').join(' ').trim();
          if (text) {
            onResult({ transcript: text, isFinal: true });
          }
        } else if (result.text) {
          onResult({ transcript: result.text, isFinal: false });
        }
      } catch (e) {
        // Partial results or non-JSON output
        if (output.trim()) {
          onResult({ transcript: output.trim(), isFinal: false });
        }
      }
    });

    voskProcess.stderr.on('data', (data) => {
      const raw = data.toString();
      // Split into lines to handle multi-line logs
      const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      lines.forEach((line) => {
        // Ignore VOSK internal LOG lines which are verbose but not errors
        if (/^LOG \(VoskAPI:/.test(line) || /^LOG \(/.test(line)) {
          console.debug('[VOSK LOG]', line);
          return; // not an actionable error
        }

        console.error('[VOSK ERR]', line);
        // Provide helpful hint for known audio/python issues
        let hint = null;
        if (/pyaudio|PortAudio|No Default Input|ALSA|Pa_StartStream/i.test(line)) {
          hint = 'Microphone/PyAudio error: Check if microphone is connected and drivers are installed. Run: pip install pyaudio';
        } else if (/ModuleNotFoundError|ImportError.*vosk/i.test(line)) {
          hint = 'VOSK library missing: Run: pip install vosk';
        } else if (/ModuleNotFoundError|ImportError.*pyaudio/i.test(line)) {
          hint = 'PyAudio missing: Run: pip install pyaudio';
        }
        if (onError) onError({ error: line.trim(), hint });
      });
    });

    voskProcess.on('error', (err) => {
      console.error('[VOSK] Process error:', err);
      if (err && err.code === 'ENOENT') {
        if (onError) onError({ 
          error: 'Python executable not found. Please install Python 3 and ensure it is on PATH.',
          hint: 'Download Python from https://www.python.org/downloads and add to PATH during installation.'
        });
      } else {
        if (onError) onError({ error: err.message || String(err) });
      }
      voskProcess = null;
    });

    voskProcess.on('exit', (code) => {
      console.log('[VOSK] Process exited with code:', code);
      voskProcess = null;
    });

    return {
      success: true,
      stop: () => {
        if (voskProcess && !voskProcess.killed) {
          voskProcess.kill();
          voskProcess = null;
        }
      }
    };
  } catch (err) {
    console.error('[VOSK] Start listening failed:', err);
    if (onError) {
      onError({ 
        error: err.message,
        hint: 'Ensure Python 3 is installed and VOSK models are available. Check logs for details.'
      });
    }
    return { success: false, error: err.message };
  }
}

/**
 * Stop current listening session
 */
function stopListening() {
  if (voskProcess && !voskProcess.killed) {
    voskProcess.kill();
    voskProcess = null;
  }
}

/**
 * Check if model exists locally
 */
function hasModel(language = 'en') {
  const modelName = language === 'ta' ? TA_MODEL : EN_MODEL;
  const modelPath = path.join(MODELS_DIR, modelName);
  if (!fs.existsSync(modelPath)) return false;
  // Validate basic integrity; treat models with only optional warnings as present
  const integrity = checkModelIntegrity(language);
  if (integrity && integrity.ok) return true;
  return false;
}

/**
 * Get available models
 */
function getAvailableModels() {
  return {
    en: { hasModel: hasModel('en'), modelPath: path.join(MODELS_DIR, EN_MODEL) },
    ta: { hasModel: hasModel('ta'), modelPath: path.join(MODELS_DIR, TA_MODEL) }
  };
}

function checkModelIntegrity(language = 'en') {
  const modelName = language === 'ta' ? TA_MODEL : EN_MODEL;
  const modelPath = path.join(MODELS_DIR, modelName);
  if (!fs.existsSync(modelPath)) {
    return { ok: false, missing: ['model directory'] };
  }

  const missing = [];
  const hasModelConf = fs.existsSync(path.join(modelPath, 'conf', 'model.conf')) || fs.existsSync(path.join(modelPath, 'model.conf'));
  if (!hasModelConf) missing.push('model.conf or conf/model.conf');
  if (!fs.existsSync(path.join(modelPath, 'graph', 'Gr.fst'))) missing.push('graph/Gr.fst');

  // ivector is optional for some small models; only warn if the ivector directory exists but final.ie missing
  const ivectorDir = path.join(modelPath, 'ivector');
  if (fs.existsSync(ivectorDir) && !fs.existsSync(path.join(ivectorDir, 'final.ie'))) {
    missing.push('ivector/final.ie (optional)');
  }

  if (missing.length > 0) {
    // If the only missing item is optional ivector, return ok with warning
    const nonOptional = missing.filter(m => !/optional/.test(m));
    if (nonOptional.length === 0) {
      return { ok: true, warnings: missing };
    }
    return { ok: false, missing };
  }
  return { ok: true };
}

/**
 * Download model from GitHub
 */
async function downloadModel(language = 'en', onProgress) {
  try {
    const modelName = language === 'ta' ? TA_MODEL : EN_MODEL;
    const downloadUrl = MODEL_URLS[language];
    const modelPath = path.join(MODELS_DIR, modelName);
    const tempZipPath = path.join(MODELS_DIR, `${modelName}.zip`);

    if (!downloadUrl) {
      const hint = language === 'ta' 
        ? 'Tamil model auto-download is currently disabled due to broken URL. Please download manually from https://alphacephei.com/vosk/models and extract to the models folder.'
        : 'Model download URL not configured.';
      return {
        success: false,
        error: 'Download URL not available',
        hint: hint,
        manualDownloadUrl: null,
        extractPath: MODELS_DIR
      };
    }

    // Ensure models directory exists
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
    }

    // Download the model (only if a valid downloadUrl is provided)
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      timeout: 300000 // 5 minutes
    });

    const totalLength = parseInt(response.headers['content-length'], 10);
    let downloadedLength = 0;

    response.data.on('data', (chunk) => {
      downloadedLength += chunk.length;
      const progress = totalLength ? (downloadedLength / totalLength) * 100 : 0;
      if (onProgress) {
        onProgress(Math.round(progress));
      }
    });

    const writer = fs.createWriteStream(tempZipPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`[VOSK] Download complete, extracting to ${modelPath}`);

    // Extract the model
    await fs.createReadStream(tempZipPath)
      .pipe(unzipper.Extract({ path: MODELS_DIR }))
      .promise();

    // Clean up zip file
    fs.unlinkSync(tempZipPath);

    console.log(`[VOSK] Model ${language} downloaded and extracted successfully`);
    return { success: true, modelPath, modelName };
  } catch (err) {
    // Download failed — do not expose raw stack to UI, return friendly hint and log details at debug level
    console.debug(`[VOSK] Download failed for ${language}:`, err && err.message ? err.message : String(err));
    let hint = 'Failed to download model. Please download manually from https://alphacephei.com/vosk/models and extract into the application models folder.';

    return {
      success: false,
      error: 'Download failed',
      hint: hint,
      manualDownloadUrl: 'https://alphacephei.com/vosk/models',
      extractPath: MODELS_DIR
    };
  }
}

module.exports = {
  initVosk,
  startListening,
  stopListening,
  hasModel,
  getAvailableModels,
  downloadModel,
  checkModelIntegrity,
  MODELS_DIR
};
