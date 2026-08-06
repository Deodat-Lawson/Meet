/**
 * Meet for macOS — an Electron shell around the web client.
 *
 * The shell exists for one reason the browser cannot match: screen sharing.
 * In a browser `getDisplayMedia` is handled by the browser's own picker; in
 * Electron the app must service the request itself, which is what most of this
 * file is about. The rest is macOS integration — permissions, the menu, window
 * state and keeping navigation inside the app.
 */
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  systemPreferences,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const DEFAULT_SERVER = 'https://meet.hide-me.online';
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

interface Settings {
  serverUrl: string;
  windowBounds?: { width: number; height: number; x?: number; y?: number };
}

function readSettings(): Settings {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as Partial<Settings>;
    return { serverUrl: parsed.serverUrl || DEFAULT_SERVER, windowBounds: parsed.windowBounds };
  } catch {
    return { serverUrl: process.env.MEET_SERVER_URL || DEFAULT_SERVER };
  }
}

function writeSettings(settings: Settings): void {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.warn('could not persist settings', error);
  }
}

let settings = readSettings();
let mainWindow: BrowserWindow | null = null;
let pickerWindow: BrowserWindow | null = null;

/* ------------------------------------------------------------ main window */

function createWindow(): void {
  const bounds = settings.windowBounds;
  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0e1014',
    // Keeps the traffic lights floating over the app's own dark header.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer is our own first-party origin only; see the navigation guard.
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    const { width, height, x, y } = mainWindow.getBounds();
    settings = { ...settings, windowBounds: { width, height, x, y } };
    writeSettings(settings);
  };
  mainWindow.on('resized', persistBounds);
  mainWindow.on('moved', persistBounds);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links belong in the user's browser, not in a chromeless app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Never let the app navigate off its own origin.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(settings.serverUrl).origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, description, failedUrl) => {
    if (code === -3) return; // aborted by a redirect, not a real failure
    void dialog.showMessageBox({
      type: 'error',
      message: 'Could not reach the Meet server',
      detail: `${failedUrl}\n\n${description} (${code})\n\nCheck the server address in Meet ▸ Settings, or your network connection.`,
      buttons: ['OK'],
    });
  });

  void mainWindow.loadURL(settings.serverUrl);
}

/* --------------------------------------------------------- media requests */

/**
 * Grants camera and microphone to our own origin.
 *
 * macOS still gates the actual devices behind its own TCC prompt, driven by the
 * usage strings in Info.plist — this only stops Chromium from refusing before
 * the OS ever asks.
 */
function installPermissionHandlers(): void {
  const ses = session.defaultSession;
  const appOrigin = new URL(settings.serverUrl).origin;

  ses.setPermissionRequestHandler((contents, permission, callback) => {
    const origin = contents.getURL() ? new URL(contents.getURL()).origin : '';
    const allowed = ['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen', 'notifications'];
    callback(origin === appOrigin && allowed.includes(permission));
  });

  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return requestingOrigin === appOrigin && ['media', 'display-capture'].includes(permission);
  });
}

/**
 * Services `getDisplayMedia` from the page.
 *
 * On macOS 15+ Electron can defer to the system's own ScreenCaptureKit picker,
 * which is what users expect and handles the permission dance itself. Older
 * macOS has no such picker, so we enumerate sources and present our own.
 */
function installDisplayMediaHandler(): void {
  const ses = session.defaultSession;

  const useSystemPicker = process.platform === 'darwin' && Number(process.getSystemVersion().split('.')[0]) >= 15;

  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      if (useSystemPicker) {
        // Electron forwards to the OS picker; nothing for us to choose.
        callback({});
        return;
      }

      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 200 },
          fetchWindowIcons: true,
        });
        if (sources.length === 0) {
          callback({});
          return;
        }
        const chosen = await showPicker(
          sources.map((s) => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail.toDataURL(),
            icon: s.appIcon?.toDataURL() ?? null,
            isScreen: s.id.startsWith('screen:'),
          })),
        );
        if (!chosen) {
          callback({});
          return;
        }
        const source = sources.find((s) => s.id === chosen);
        callback(source ? { video: source } : {});
      } catch (error) {
        console.error('display media request failed', error);
        callback({});
      }
    },
    { useSystemPicker },
  );
}

interface PickerSource {
  id: string;
  name: string;
  thumbnail: string;
  icon: string | null;
  isScreen: boolean;
}

/** Modal source chooser for macOS versions without a system picker. */
function showPicker(sources: PickerSource[]): Promise<string | null> {
  return new Promise((resolve) => {
    if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();

    pickerWindow = new BrowserWindow({
      width: 760,
      height: 560,
      parent: mainWindow ?? undefined,
      modal: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      backgroundColor: '#16191f',
      title: 'Choose what to share',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    let settled = false;
    const finish = (id: string | null) => {
      if (settled) return;
      settled = true;
      ipcMain.removeHandler('picker:sources');
      ipcMain.removeAllListeners('picker:choose');
      resolve(id);
      if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();
      pickerWindow = null;
    };

    ipcMain.handle('picker:sources', () => sources);
    ipcMain.on('picker:choose', (_event, id: string | null) => finish(id));
    pickerWindow.on('closed', () => finish(null));

    void pickerWindow.loadFile(path.join(__dirname, '..', 'static', 'picker.html'));
  });
}

/* ----------------------------------------------------------------- menu */

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Server Address…',
          accelerator: 'Cmd+,',
          click: () => void promptForServer(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'Cmd+R', click: () => mainWindow?.webContents.reload() },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
    {
      role: 'help',
      submenu: [
        {
          label: 'Check Screen Recording Permission',
          click: () => void checkScreenPermission(true),
        },
        {
          label: 'Open Project on GitHub',
          click: () => void shell.openExternal('https://github.com/Deodat-Lawson/Meet'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function promptForServer(): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'question',
    message: 'Meet server address',
    detail: `Currently: ${settings.serverUrl}\n\nChoose "Use Default" for the hosted server, or "Use Localhost" when running the stack on this machine.`,
    buttons: ['Cancel', 'Use Default', 'Use Localhost'],
    defaultId: 1,
    cancelId: 0,
  });
  if (result.response === 0) return;
  settings = {
    ...settings,
    serverUrl: result.response === 1 ? DEFAULT_SERVER : 'http://localhost:5173',
  };
  writeSettings(settings);
  installPermissionHandlers();
  void mainWindow?.loadURL(settings.serverUrl);
}

/**
 * Screen recording on macOS cannot be granted from inside the app — the user has
 * to flip it in System Settings and relaunch. Detect it early and say so
 * plainly, rather than letting the share silently produce a black frame.
 */
async function checkScreenPermission(interactive: boolean): Promise<void> {
  if (process.platform !== 'darwin') return;
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status === 'granted') {
    if (interactive) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Screen recording is allowed',
        detail: 'Meet can share your screen.',
        buttons: ['OK'],
      });
    }
    return;
  }
  const result = await dialog.showMessageBox({
    type: 'warning',
    message: 'Screen recording permission needed',
    detail:
      'macOS requires explicit permission before an app can share your screen.\n\n' +
      'Open System Settings ▸ Privacy & Security ▸ Screen & System Audio Recording, enable Meet, then quit and reopen the app.',
    buttons: ['Open System Settings', 'Later'],
    defaultId: 0,
  });
  if (result.response === 0) {
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
}

/* ------------------------------------------------------------- lifecycle */

// A second instance would fight over the camera; focus the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    installPermissionHandlers();
    installDisplayMediaHandler();
    buildMenu();
    createWindow();

    // Camera and microphone are deliberately not requested here. macOS shows its
    // prompt the moment the app asks, and firing that before the user has even
    // seen the window reads as an app grabbing at devices for no stated reason.
    // The pre-join screen opens a preview, so the prompt arrives exactly where
    // the user is being asked to check their camera.

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
