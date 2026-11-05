const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const dgram = require("dgram");
const { pathToFileURL } = require("url");
const axios = require('axios');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');

// ── Hardware Acceleration & Touch Optimization (Scangle Touch POS / Win 10) ──
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('enable-touch-drag-drop');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=2048');

// Global Exception Protection for Electron Main Process
process.on('uncaughtException', (err) => {
  console.error('[Electron Main Process Exception Caught]:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Electron Main Process Rejection Caught]:', reason && reason.stack ? reason.stack : reason);
});

function getCliArg(prefix) {
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match ? match.split('=')[1] : null;
}
const isTerminalMode = process.argv.includes('--mode=terminal') || getCliArg('--mode') === 'terminal';
const terminalType = getCliArg('--terminal') || 'billing'; // 'token' or 'billing'
const nodeIdArg = getCliArg('--node-id') || (isTerminalMode ? 'TERMINAL' : 'C1');
const nodeRoleArg = getCliArg('--role') || (nodeIdArg === 'C1' ? 'LEADER' : 'STANDBY');
const masterIpArg = getCliArg('--master-ip') || getCliArg('--leader-ip') || process.env.POS_MASTER_IP || null;

function discoverActiveServer(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const client = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let resolved = false;

    client.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        try { client.close(); } catch (e) {}
        resolve(null);
      }
    });

    client.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString('utf8'));
        if (data.magic === 'RESTAURANT_POS_BEACON' && data.role === 'LEADER') {
          if (!resolved) {
            resolved = true;
            try { client.close(); } catch (e) {}
            const serverUrl = `http://${rinfo.address}:${data.httpPort || 3001}`;
            console.log(`[LAN-Terminal] Discovered active server at: ${serverUrl}`);
            resolve({ serverUrl, ip: rinfo.address, port: data.httpPort || 3001 });
          }
        }
      } catch (e) {}
    });

    client.bind(0, () => {
      try { client.setBroadcast(true); } catch (e) {}
      const probe = Buffer.from('DISCOVER_POS_SERVER');
      client.send(probe, 0, probe.length, 3002, '255.255.255.255', () => {});
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { client.close(); } catch (e) {}
        resolve(null);
      }
    }, timeoutMs);
  });
}

let backend = null;
let mainWindow = null;
let customerDisplayWindow = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

/* ================================
   🗄️ ENSURE SQLITE DB
================================ */
async function ensureDatabase() {
  if (isTerminalMode) {
    console.log('[LAN-Terminal] Skipping local DB setup in Terminal Mode.');
    return;
  }
  const userDataPath = app.getPath("userData");
  const dbPath = path.join(userDataPath, "restaurant.db");
  
  // Set the DATABASE_URL for Prisma
  process.env.DATABASE_URL = `file:${dbPath}`;
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  // Look for template DB in multiple candidate paths
  const templateCandidates = [
    path.join(process.resourcesPath, "api", "prisma", "sqlite-template", "dev.db"),
    path.join(process.resourcesPath, "api", "sqlite-template", "dev.db"),
    path.join(process.resourcesPath, "api", "prisma", "maligai.db"),
    path.join(app.getAppPath(), "api", "prisma", "sqlite-template", "dev.db"),
    path.join(app.getAppPath(), "api", "sqlite-template", "dev.db"),
    path.join(app.getAppPath(), "api", "prisma", "maligai.db"),
  ];

  let templateDbPath = null;
  for (const cand of templateCandidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).size > 10000) {
      templateDbPath = cand;
      break;
    }
  }

  const forceReset = process.argv.includes('--reset-db');
  const exists = fs.existsSync(dbPath);
  
  // Auto-upgrade if existing file is an older template (<800KB) and we have the full 843KB+ template
  const isOldTemplate = exists && templateDbPath && fs.statSync(dbPath).size < 800000 && fs.statSync(templateDbPath).size >= 800000;

  if (exists && !forceReset && !isOldTemplate) {
    console.log('[OK] Database already exists at:', dbPath, `(size: ${fs.statSync(dbPath).size} bytes)`);
    return;
  }

  if (isOldTemplate) {
    console.log('[UPGRADE] Detected old database file (<800KB). Upgrading to full template...');
    try {
      fs.copyFileSync(dbPath, path.join(userDataPath, `restaurant.db.old_${Date.now()}`));
    } catch (e) { /**/ }
  } else if (forceReset) {
    console.log('[RESET] --reset-db flag detected. Re-initializing database...');
  } else {
    console.log('[INFO] Initializing new database at:', dbPath);
  }

  if (templateDbPath) {
    try {
      fs.copyFileSync(templateDbPath, dbPath);
      console.log('✅ SQLite DB copied from template:', templateDbPath, `(${fs.statSync(dbPath).size} bytes)`);
    } catch (err) {
      console.error('❌ Failed to copy template DB:', err.message);
    }
  } else {
    fs.writeFileSync(dbPath, "");
    console.log('⚠️ Created empty DB file (No template found in candidates)');
  }
}

function getActiveAppVersion() {
  try {
    const runtimeMetaFile = path.join(app.getPath("userData"), "runtime_update", "version.json");
    if (fs.existsSync(runtimeMetaFile)) {
      const data = JSON.parse(fs.readFileSync(runtimeMetaFile, "utf8"));
      if (data && data.version) return data.version;
    }
  } catch (e) {}
  return app.getVersion();
}

/* ================================
   🚀 START BACKEND
=============================== */
function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = output.trim().split('\n');
      const pidsToKill = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${port}`) && parts[3] === 'LISTENING') {
          const pid = parseInt(parts[4], 10);
          if (pid && pid !== process.pid) {
            pidsToKill.add(pid);
          }
        }
      }
      for (const pid of pidsToKill) {
        console.log(`[Process Cleanup] Freeing port ${port} by terminating PID ${pid}...`);
        try {
          execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
        } catch (e) {}
      }
    }
  } catch (err) {
    // Port is already free
  }
}

async function waitForBackend(port = 3001, maxWaitMs = 30000) {
  const startTime = Date.now();
  const healthUrl = `http://127.0.0.1:${port}/health`;
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const resp = await axios.get(healthUrl, { timeout: 800 });
      if (resp.status === 200) {
        console.log(`✅ Backend health check verified in ${Date.now() - startTime}ms`);
        return true;
      }
    } catch (e) {
      // Waiting for backend to bind and respond
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.warn(`⚠️ Backend health check timed out after ${maxWaitMs}ms`);
  return false;
}

function cleanupBackend() {
  if (backend) {
    console.log(`[Shutdown] Terminating backend child PID: ${backend.pid}`);
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${backend.pid} /T`, { stdio: 'ignore' });
      } else {
        process.kill(backend.pid, 'SIGTERM');
      }
    } catch (e) {
      try { backend.kill('SIGKILL'); } catch (e2) {}
    }
    backend = null;
  }
}

function startBackend() {
  if (isTerminalMode) {
    console.log('[LAN-Terminal] Skipping local backend spawn in Terminal Mode.');
    return;
  }
  if (isDev) {
    console.log('🔧 [Dev] Development mode: backend is already running via "npm run dev:api"');
    return;
  }
  if (backend) return;

  // Clean any previous ghost process holding port 3001
  killProcessOnPort(3001);

  const basePath = app.getAppPath();
  let serverPath = path.join(basePath, "api", "src", "server.js");
  
  // Handle packaged app path
  if (app.isPackaged) {
    const unpackedPath = path.join(process.resourcesPath, 'api', 'src', 'server.js');
    if (fs.existsSync(unpackedPath)) {
      serverPath = unpackedPath;
    }
  }

  const userDataPath = app.getPath("userData");
  const runtimeUpdateDir = path.join(userDataPath, "runtime_update");
  const runtimeServerPath = path.join(runtimeUpdateDir, "api", "src", "server.js");
  const runtimeWebDist = path.join(runtimeUpdateDir, "web", "dist");

  // ⚡ If a fast runtime hot-update is installed, use it!
  if (fs.existsSync(runtimeServerPath)) {
    serverPath = runtimeServerPath;
    console.log(`⚡ Using fast runtime hot-update backend: ${serverPath}`);
  }

  console.log(`🚀 Starting backend from: ${serverPath}`);

  const uploadsPath = path.join(userDataPath, "uploads");
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }

  // Ensure bundled uploads (e.g. seeded product images) are copied to userData uploads if missing
  const bundledUploadsCandidates = [
    path.join(process.resourcesPath, "api", "uploads"),
    path.join(app.getAppPath(), "api", "uploads"),
    path.join(__dirname, "api", "uploads"),
  ];
  for (const srcDir of bundledUploadsCandidates) {
    if (fs.existsSync(srcDir)) {
      try {
        const files = fs.readdirSync(srcDir);
        for (const file of files) {
          const destFile = path.join(uploadsPath, file);
          if (!fs.existsSync(destFile) || fs.statSync(destFile).size === 0) {
            fs.copyFileSync(path.join(srcDir, file), destFile);
          }
        }
      } catch (e) {
        console.warn('Could not copy bundled uploads:', e.message);
      }
      break;
    }
  }

  let webDistPath = app.isPackaged
    ? path.join(process.resourcesPath, "web", "dist")
    : path.join(__dirname, "web", "dist");

  if (fs.existsSync(path.join(runtimeWebDist, "index.html"))) {
    webDistPath = runtimeWebDist;
    console.log(`⚡ Using fast runtime hot-update webDist: ${webDistPath}`);
  }

  const nodeModulesPath = app.isPackaged
    ? path.join(process.resourcesPath, "api", "node_modules")
    : path.join(basePath, "api", "node_modules");

  const env = Object.assign({}, process.env, {
    NODE_ENV: app.isPackaged ? "production" : "development",
    PORT: 3001,
    DATABASE_URL: process.env.DATABASE_URL, // Ensure this is passed
    UPLOAD_DIR: uploadsPath,
    POS_NODE_ID: nodeIdArg,
    POS_NODE_ROLE: nodeRoleArg,
    POS_MASTER_IP: masterIpArg || '',
    WEB_DIST_PATH: webDistPath,
    NODE_PATH: nodeModulesPath
  });

  // Ensure JWT_SECRET is available
  if (!env.JWT_SECRET) {
    const crypto = require('crypto');
    const secretPath = path.join(app.getPath('userData'), '.jwt_secret');
    if (fs.existsSync(secretPath)) {
      env.JWT_SECRET = fs.readFileSync(secretPath, 'utf8').trim();
    } else {
      env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretPath, env.JWT_SECRET, 'utf8');
    }
  }

  // Runtime selection
  let nodeExec = 'node';
  if (app.isPackaged) {
    nodeExec = process.execPath;
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  const apiRoot = path.join(basePath, "api");
  const unpackedApiRoot = path.join(process.resourcesPath, "api");
  const finalApiRoot = app.isPackaged && fs.existsSync(unpackedApiRoot) ? unpackedApiRoot : apiRoot;

  const logPath = path.join(app.getPath("userData"), "backend.log");
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  
  // Write startup header to log
  logStream.write(`\n--- Backend Start: ${new Date().toISOString()} ---\n`);
  logStream.write(`Server Path: ${serverPath}\n`);
  logStream.write(`CWD: ${finalApiRoot}\n`);
  logStream.write(`Node Exec: ${nodeExec}\n`);

  backend = spawn(nodeExec, [serverPath], {
    env: env,
    cwd: finalApiRoot,
    shell: false,
    windowsHide: true
  });

  backend.stdout.pipe(logStream);
  backend.stderr.pipe(logStream);

  backend.stdout.on('data', (data) => console.log(`[BACKEND] ${data}`));
  backend.stderr.on('data', (data) => console.error(`[BACKEND ERR] ${data}`));

  backend.on("exit", (code) => {
    console.error(`❌ Backend exited with code ${code}`);
    backend = null;
  });
}

/* ================================
   🖥️ CREATE WINDOW
================================ */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false
    },
  });

  mainWindow.maximize();

  if (isTerminalMode) {
    console.log('[LAN-Terminal] Running in Terminal Mode. Probing LAN for active server...');
    const result = await discoverActiveServer(3500);
    const targetPath = terminalType === 'token' ? '/admin/token-management' : '/admin/pos';
    if (result && result.serverUrl) {
      console.log(`[LAN-Terminal] Connecting directly to active server: ${result.serverUrl}${targetPath}`);
      mainWindow.loadURL(`${result.serverUrl}${targetPath}`);
      mainWindow.on("closed", () => { mainWindow = null; });
      return;
    } else {
      console.warn('[LAN-Terminal] No active server discovered via UDP broadcast. Falling back to default URL.');
    }
  }

  if (isDev) {
    const viteUrl = "http://localhost:5173";
    try {
      await axios.get(viteUrl, { timeout: 1000 });
      console.log('🔧 Vite dev server detected, loading URL');
      mainWindow.loadURL(viteUrl);
    } catch (e) {
      console.warn('⚠️ Vite dev server not detected, falling back to built files');
      const indexPath = path.join(__dirname, "web", "dist", "index.html");
      if (fs.existsSync(indexPath)) {
        mainWindow.loadFile(indexPath);
      } else {
        mainWindow.loadURL("http://localhost:3001");
      }
    }
    mainWindow.webContents.openDevTools();
  } else {
    // In production, display an instant sleek splash screen while checking backend readiness
    const splashHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Amora POS</title>
        <style>
          body {
            margin: 0;
            background: #060813;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
            user-select: none;
          }
          .card {
            text-align: center;
            background: rgba(22, 25, 41, 0.88);
            border: 1px solid rgba(255, 255, 255, 0.12);
            padding: 42px 52px;
            border-radius: 28px;
            box-shadow: 0 25px 60px rgba(0,0,0,0.7);
            max-width: 440px;
          }
          .brand {
            font-size: 34px;
            font-weight: 900;
            letter-spacing: 3px;
            color: #ffffff;
            margin-bottom: 6px;
          }
          .sub {
            font-size: 13px;
            font-weight: 700;
            color: #94a3b8;
            margin-bottom: 28px;
            letter-spacing: 1.5px;
          }
          .spinner {
            width: 44px;
            height: 44px;
            border: 4px solid rgba(255,255,255,0.08);
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 0.9s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite;
            margin: 0 auto 22px auto;
          }
          .status {
            font-size: 13px;
            color: #cbd5e1;
            font-weight: 600;
            letter-spacing: 0.5px;
          }
          .footer {
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            margin-top: 24px;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="brand">AMORA</div>
          <div class="sub">BAKES & CAFE · TOUCH POS</div>
          <div class="spinner"></div>
          <div class="status">Starting POS Engine & Database...</div>
          <div class="footer">Powered by SMARTGONEXT</div>
        </div>
      </body>
      </html>
    `;
    mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(splashHtml));

    // Ensure backend is ready before rendering React app so data is never stuck
    const backendReady = await waitForBackend(3001, 25000);

    // In production, load the built files from runtime_update, resourcesPath, or local fallback
    const userDataPath = app.getPath("userData");
    const runtimeIndexPath = path.join(userDataPath, "runtime_update", "web", "dist", "index.html");
    const indexPath = path.join(process.resourcesPath, "web", "dist", "index.html");
    const fallbackPath = path.join(__dirname, "web", "dist", "index.html");
    const finalIndexPath = fs.existsSync(runtimeIndexPath)
      ? runtimeIndexPath
      : fs.existsSync(indexPath)
        ? indexPath
        : fs.existsSync(fallbackPath)
          ? fallbackPath
          : null;

    if (backendReady) {
      console.log('🚀 Backend ready! Loading app at http://localhost:3001');
      mainWindow.loadURL("http://localhost:3001").catch((err) => {
        console.warn('⚠️ Could not load http://localhost:3001, falling back to file URL:', err);
        if (finalIndexPath) {
          mainWindow.loadURL(pathToFileURL(finalIndexPath).toString());
        }
      });
    } else if (finalIndexPath) {
      console.warn('⚠️ Backend health check timed out, falling back to local file URL');
      mainWindow.loadURL(pathToFileURL(finalIndexPath).toString());
    } else {
      mainWindow.loadURL("http://localhost:3001");
    }
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ================================
   📡 IPC HANDLERS
================================ */
ipcMain.handle("save-bill-txt", (event, data) => {
  try {
    const billsDir = path.join(app.getPath("userData"), "bills");
    if (!fs.existsSync(billsDir)) fs.mkdirSync(billsDir, { recursive: true });
    const safeName = String(data?.filename || 'bill').replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 80);
    const filePath = path.join(billsDir, `${safeName}.txt`);
    fs.writeFileSync(filePath, String(data?.content || ''), 'utf8');
    console.log(`[POS] Bill text saved: ${filePath}`);
    return { success: true, path: filePath };
  } catch (err) {
    console.error('[POS] Failed to save bill text:', err.message);
    return { success: false, message: err.message };
  }
});

ipcMain.handle("get-printers", async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (win) {
      return await win.webContents.getPrintersAsync();
    }
  } catch (err) {
    console.error("[POS] Failed to get printers:", err);
  }
  return [];
});

ipcMain.handle("print-bill", async (event, payload) => {
  const html = typeof payload === 'string' ? payload : payload?.html;
  const deviceName = typeof payload === 'object' && payload?.deviceName ? payload.deviceName : '';
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURI(html)}`);

  return new Promise((resolve) => {
    win.webContents.on("did-finish-load", () => {
      const opts = { silent: true, printBackground: true };
      if (deviceName) opts.deviceName = deviceName;
      win.webContents.print(opts, (success, failureReason) => {
        win.close();
        if (success) resolve({ success: true });
        else resolve({ success: false, message: failureReason });
      });
    });
  });
});

ipcMain.handle("get-display-info", () => {
  try {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    return {
      count: displays.length,
      hasSecondary: displays.length > 1,
      displays: displays.map(d => ({
        id: d.id,
        isPrimary: d.id === primary.id,
        bounds: d.bounds
      }))
    };
  } catch (e) {
    return { count: 1, hasSecondary: false, displays: [] };
  }
});

ipcMain.on("open-customer-display", (event, url) => {
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const normalizedPath = url ? (url.startsWith('/') ? url : `/${url}`) : '/admin/customer-display';
  const sep = normalizedPath.includes('?') ? '&' : '?';

  let targetUrl = '';
  if (isDev) {
    targetUrl = `http://localhost:5173${normalizedPath}${sep}__cd=1`;
  } else {
    const indexPath = path.join(process.resourcesPath, "web", "dist", "index.html");
    const fallbackPath = path.join(__dirname, "web", "dist", "index.html");
    const finalPath = fs.existsSync(indexPath) ? indexPath : fallbackPath;
    const targetPath = normalizedPath.includes('__cd=1') ? normalizedPath : `${normalizedPath}${sep}__cd=1`;
    targetUrl = pathToFileURL(finalPath).toString() + `#${targetPath}`;
  }

  // Detect displays using Electron screen API
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplay = displays.find(d => d.id !== primaryDisplay.id) || (displays.length > 1 ? displays[1] : null);

  const targetBounds = secondaryDisplay ? secondaryDisplay.bounds : primaryDisplay.bounds;
  const isDualScreen = Boolean(secondaryDisplay);

  console.log(`[CustomerDisplay] Total displays detected: ${displays.length}. Dual-screen active: ${isDualScreen}`);
  if (secondaryDisplay) {
    console.log(`[CustomerDisplay] Targeting secondary monitor: x=${targetBounds.x}, y=${targetBounds.y}, w=${targetBounds.width}, h=${targetBounds.height}`);
  }

  // Reuse existing customer display window if already open
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    console.log(`[CustomerDisplay] Window already open. Reloading/navigating to: ${targetUrl}`);
    customerDisplayWindow.loadURL(targetUrl).catch((err) => {
      console.error('❌ Failed to navigate customer display window:', err);
    });
    if (secondaryDisplay) {
      customerDisplayWindow.setBounds(secondaryDisplay.bounds);
      customerDisplayWindow.setFullScreen(true);
    }
    if (customerDisplayWindow.isMinimized()) customerDisplayWindow.restore();
    if (isDualScreen) {
      customerDisplayWindow.showInactive();
    } else {
      customerDisplayWindow.show();
      customerDisplayWindow.focus();
    }
    return;
  }

  customerDisplayWindow = new BrowserWindow({
    x: targetBounds.x,
    y: targetBounds.y,
    width: targetBounds.width,
    height: targetBounds.height,
    fullscreen: isDualScreen,
    frame: !isDualScreen,
    autoHideMenuBar: true,
    title: "Customer Facing Display",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
    }
  });

  if (!isDualScreen) {
    customerDisplayWindow.maximize();
  }

  customerDisplayWindow.webContents.setUserAgent(chromeUA);

  console.log(`[CustomerDisplay] Opening new window: ${targetUrl}`);
  customerDisplayWindow.loadURL(targetUrl).catch((err) => {
    console.error('❌ Failed to load customer display page:', err);
    if (!isDev) {
      customerDisplayWindow.loadURL("http://localhost:3001");
    }
  });

  if (isDualScreen) {
    customerDisplayWindow.showInactive();
  }

  customerDisplayWindow.on('closed', () => {
    customerDisplayWindow = null;
  });
});

// Silent print — no dialog
ipcMain.on('silent-print', (event, data) => {
  const html = typeof data === 'string' ? data : data?.html;
  const printOptions = typeof data === 'object' && data?.options ? data.options : {};
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: true } });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.webContents.once('did-finish-load', () => {
    const opts = {
      silent: true,
      printBackground: true,
      deviceName: '',
      margins: { marginType: 'none' },
      ...printOptions
    };
    win.webContents.print(
      opts,
      (success, errorType) => {
        event.reply('print-result', success ? null : errorType);
        setTimeout(() => win.destroy(), 1000);
      }
    );
  });
});

// Cash drawer — ESC/POS kick command via printer
ipcMain.on('open-cash-drawer', (event, config) => {
  const { type = 'usb', ip = '192.168.1.200', port = 9100, kickCode = [27, 112, 0, 25, 250] } = config || {};
  const drawerKick = Buffer.from(kickCode);

  console.log(`[POS] Processing cash drawer kick signal. Type: ${type}, IP: ${ip}, KickCode: ${JSON.stringify(kickCode)}`);

  if (type === 'network') {
    // Direct network connection (TCP raw socket on port 9100) - extremely robust for Ethernet printers!
    const net = require('net');
    const client = new net.Socket();
    
    // Set a timeout of 3 seconds
    client.setTimeout(3000);
    
    client.connect(port, ip, () => {
      client.write(drawerKick);
      client.end();
      console.log(`[POS] Successfully sent network cash drawer kick command to ${ip}:${port}`);
    });

    client.on('timeout', () => {
      console.error(`[POS] Connection to network printer at ${ip}:${port} timed out.`);
      client.destroy();
    });

    client.on('error', (err) => {
      console.error(`[POS] Network cash drawer error:`, err.message);
      client.destroy();
    });
  } else {
    // USB / OS default printer raw kick
    const { execSync } = require('child_process');
    try {
      const fs = require('fs');
      const tmpFile = require('os').tmpdir() + '/drawer_kick.bin';
      fs.writeFileSync(tmpFile, drawerKick);
      
      // Get default printer name dynamically using PowerShell
      let printerName = '';
      try {
        const stdout = execSync('powershell -Command "Get-CimInstance Win32_Printer -Filter \\"Default = true\\" | Select-Object -ExpandProperty Name"', { windowsHide: true });
        if (stdout && stdout.toString().trim()) {
          printerName = stdout.toString().trim();
        }
      } catch (e) {
        console.error('Failed to get default printer name via PowerShell:', e.message);
      }

      if (printerName) {
        console.log(`[POS] Found default printer: "${printerName}". Sending raw drawer kick via Out-Printer.`);
        // Send raw bytes using a PowerShell command that spools raw data directly to named printer
        const psCmd = `powershell -Command "[System.IO.File]::WriteAllBytes('${tmpFile.replace(/'/g, "''")}', [byte[]](${kickCode.join(',')})); Out-Printer -Name '${printerName.replace(/'/g, "''")}' -InputObject (Get-Content '${tmpFile.replace(/'/g, "''")}' -Raw)"`;
        execSync(psCmd, { windowsHide: true });
      } else {
        console.warn('[POS] No default printer detected. Falling back to print command.');
        execSync(`print /D:"\\\\%COMPUTERNAME%\\default" "${tmpFile}"`, { windowsHide: true });
      }
    } catch (e) {
      console.error('[POS] USB cash drawer error:', e.message);
    }
  }
});

/* ================================
   🔄 AUTO-UPDATER SERVICE (GITHUB RELEASES)
================================ */
function setupAutoUpdater() {
  let latestFastUpdate = null;

  async function checkGitHubForFastUpdate() {
    try {
      const resp = await axios.get('https://api.github.com/repos/SmartGoNext/restaurant-pos/releases/latest', {
        headers: { 'User-Agent': 'Restaurant-POS-Desktop' },
        timeout: 6000
      });
      const release = resp.data;
      if (!release || !release.tag_name) return null;
      const releaseVer = release.tag_name.replace(/^v/, '').trim();
      const currentVer = getActiveAppVersion().replace(/^v/, '').trim();

      const fastAsset = release.assets && release.assets.find(a => 
        a.name === 'fast-update.zip' || a.name.startsWith('fast-update')
      );

      if (fastAsset && releaseVer !== currentVer) {
        return {
          version: releaseVer,
          releaseDate: release.published_at,
          releaseNotes: release.body || 'New features, improvements, and bug fixes.',
          downloadUrl: fastAsset.browser_download_url,
          sizeBytes: fastAsset.size,
          sizeMb: (fastAsset.size / (1024 * 1024)).toFixed(2),
          isFastUpdate: true
        };
      }
    } catch (err) {
      console.log('[FastUpdater] GitHub release check notice:', err.message);
    }
    return null;
  }

  if (isDev) {
    console.log('[AutoUpdater] Development mode detected; auto-updates disabled.');
    ipcMain.handle('updater-check', async () => ({ success: true, message: 'Running in development mode' }));
    ipcMain.handle('updater-download', async () => ({ success: true }));
    ipcMain.handle('updater-install', async () => ({ success: true }));
    ipcMain.handle('get-app-version', () => getActiveAppVersion());
    return;
  }

  autoUpdater.autoDownload = false; // User controls download
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.logger = {
    info: (msg) => console.log('[AutoUpdater]', msg),
    warn: (msg) => console.warn('[AutoUpdater]', msg),
    error: (msg) => console.error('[AutoUpdater]', msg)
  };

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates on GitHub...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', { status: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Full installer update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || 'New features, improvements, and bug fixes.',
        isFastUpdate: false
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Up to date (Current:', getActiveAppVersion(), ')');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'up-to-date',
        version: getActiveAppVersion()
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'downloading',
        percent: Math.round(progressObj.percent || 0),
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Full installer update downloaded:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'downloaded',
        version: info.version,
        isFastUpdate: false
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('[AutoUpdater] Notice (offline or network error):', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'error',
        message: err.message
      });
    }
  });

  ipcMain.handle('updater-check', async () => {
    try {
      latestFastUpdate = await checkGitHubForFastUpdate();
      if (latestFastUpdate) {
        console.log(`⚡ Fast Update available: v${latestFastUpdate.version} (~${latestFastUpdate.sizeMb} MB)`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater-status', {
            status: 'available',
            version: latestFastUpdate.version,
            releaseDate: latestFastUpdate.releaseDate,
            releaseNotes: `${latestFastUpdate.releaseNotes}\n\n⚡ Fast Update: ~${latestFastUpdate.sizeMb} MB (installs in 15 seconds)`,
            isFastUpdate: true
          });
        }
        return { success: true, updateInfo: latestFastUpdate };
      }

      const res = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: res?.updateInfo };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater-download', async () => {
    try {
      if (latestFastUpdate && latestFastUpdate.downloadUrl) {
        console.log(`⚡ Downloading Fast Update from: ${latestFastUpdate.downloadUrl}`);
        const tempZip = path.join(app.getPath('userData'), 'temp_fast_update.zip');
        if (fs.existsSync(tempZip)) {
          try { fs.unlinkSync(tempZip); } catch (e) {}
        }

        const writer = fs.createWriteStream(tempZip);
        const response = await axios({
          url: latestFastUpdate.downloadUrl,
          method: 'GET',
          responseType: 'stream',
          timeout: 60000
        });

        const totalBytes = parseInt(response.headers['content-length'] || `${latestFastUpdate.sizeBytes}`, 10);
        let transferred = 0;
        let lastTime = Date.now();
        let lastTransferred = 0;
        let speed = 500 * 1024;

        response.data.on('data', (chunk) => {
          transferred += chunk.length;
          const now = Date.now();
          if (now - lastTime > 300) {
            speed = Math.round(((transferred - lastTransferred) / (now - lastTime)) * 1000);
            lastTime = now;
            lastTransferred = transferred;
          }

          const percent = totalBytes > 0 ? Math.min(100, Math.round((transferred / totalBytes) * 100)) : 50;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater-status', {
              status: 'downloading',
              percent,
              transferred,
              total: totalBytes,
              bytesPerSecond: speed
            });
          }
        });

        await new Promise((resolve, reject) => {
          response.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        console.log('⚡ Fast Update download completed!');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater-status', {
            status: 'downloaded',
            version: latestFastUpdate.version,
            isFastUpdate: true
          });
        }
        return { success: true, isFastUpdate: true };
      }

      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater-install', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const tempZip = path.join(userDataPath, 'temp_fast_update.zip');

      // 🛡️ Data Protection: Always backup SQLite database before updating
      const dbPath = path.join(userDataPath, 'restaurant.db');
      if (fs.existsSync(dbPath)) {
        const backupPath = path.join(userDataPath, `restaurant.db.pre_update_backup_${Date.now()}`);
        fs.copyFileSync(dbPath, backupPath);
        console.log('[AutoUpdater] Created pre-update database backup at:', backupPath);
      }

      if (latestFastUpdate && fs.existsSync(tempZip)) {
        console.log('⚡ Extracting Fast Hot Update into runtime_update...');
        const runtimeUpdateDir = path.join(userDataPath, 'runtime_update');
        if (!fs.existsSync(runtimeUpdateDir)) {
          fs.mkdirSync(runtimeUpdateDir, { recursive: true });
        }

        // Terminate backend process before replacing files
        if (backend) {
          try { process.kill(backend.pid, 'SIGTERM'); } catch (e) { backend.kill(); }
          backend = null;
        }

        const { execSync } = require('child_process');
        try {
          execSync(`tar.exe -xf "${tempZip}" -C "${runtimeUpdateDir}"`);
        } catch (e) {
          execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${runtimeUpdateDir}' -Force"`);
        }
        try { fs.unlinkSync(tempZip); } catch (e) {}

        console.log('✅ Fast Hot Update installed successfully! Relaunching...');
        app.relaunch();
        app.exit(0);
        return { success: true };
      }

      if (backend) {
        try { process.kill(backend.pid, 'SIGTERM'); } catch (e) { backend.kill(); }
      }

      setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater-revert-factory', () => {
    try {
      const runtimeUpdateDir = path.join(app.getPath('userData'), 'runtime_update');
      if (fs.existsSync(runtimeUpdateDir)) {
        fs.rmSync(runtimeUpdateDir, { recursive: true, force: true });
      }
      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-app-version', () => {
    return getActiveAppVersion();
  });

  // Check 12 seconds after launch (non-blocking)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 12000);

  // Periodic background check every 45 minutes
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 45 * 60 * 1000);
}

/* ================================
   🎬 APP LIFECYCLE
=============================== */
app.whenReady().then(async () => {
  // ── Auto-launch on Windows Startup (Power on / Reboot) ──
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false,
      path: process.execPath,
      args: []
    });
    console.log('✅ Auto-launch on system startup registered (openAtLogin: true)');
  } catch (err) {
    console.warn('⚠️ Could not set login item settings:', err.message);
  }

  // Auto-launch IPC handlers
  ipcMain.handle('get-autostart-status', () => {
    try {
      const settings = app.getLoginItemSettings();
      return { success: true, openAtLogin: settings.openAtLogin };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('set-autostart', (event, enable) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: !!enable,
        openAsHidden: false,
        path: process.execPath,
        args: []
      });
      return { success: true, openAtLogin: !!enable };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  await ensureDatabase();
  startBackend();
  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  cleanupBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  cleanupBackend();
});

app.on("before-quit", () => {
  cleanupBackend();
});
