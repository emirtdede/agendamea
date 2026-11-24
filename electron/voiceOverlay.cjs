'use strict';

/**
 * WBS-5.1: Frameless, Transparent Taskbar-Floating Voice Dictation Overlay Window Manager
 * - Positions horizontally centered on the cursor's active display, exactly 14 px above taskbar workArea
 * - Opens via showInactive() so it NEVER steals focus from games, slides, or other apps
 * - NEVER opens mainWindow while Agendamea runs silently in the System Tray
 * - Loads strictly over http://127.0.0.1:<port>/overlay.html (Chromium Secure Context for AudioWorklet)
 */

const path = require('node:path');

function loadElectron() {
  if (!process.versions?.electron) {
    throw new Error('VoiceOverlayManager requires the Electron runtime.');
  }
  return require('electron');
}

const OVERLAY_WIDTH = 440;
const OVERLAY_HEIGHT = 216;
const TASKBAR_MARGIN_PX = 14;
const IDLE_DESTROY_MS = 180_000;

function computeOverlayBounds(
  workArea,
  width = OVERLAY_WIDTH,
  height = OVERLAY_HEIGHT,
  bottomMargin = TASKBAR_MARGIN_PX,
) {
  const area = workArea || { x: 0, y: 0, width: 1920, height: 1040 };
  const x = Math.round(area.x + (area.width - width) / 2);
  const y = Math.round(area.y + area.height - height - bottomMargin);
  return { x, y, width, height };
}

class VoiceOverlayManager {
  constructor(options = {}) {
    this.preloadPath = options.preloadPath || path.join(__dirname, 'preload.cjs');
    this.idleDestroyMs =
      typeof options.idleDestroyMs === 'number' ? options.idleDestroyMs : IDLE_DESTROY_MS;
    this.window = null;
    this.idleTimer = null;
    this.isListening = false;
    this._creatingPromise = null;
  }

  _clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  _scheduleIdleDestroy() {
    this._clearIdleTimer();
    if (this.idleDestroyMs <= 0) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.window && !this.window.isDestroyed() && !this.window.isVisible()) {
        this.destroy();
      }
    }, this.idleDestroyMs);
    if (typeof this.idleTimer.unref === 'function') this.idleTimer.unref();
  }

  _getTargetBounds() {
    const { screen } = loadElectron();
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay();
    return computeOverlayBounds(display.workArea, OVERLAY_WIDTH, OVERLAY_HEIGHT, TASKBAR_MARGIN_PX);
  }

  async ensureWindow(port) {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }
    if (this._creatingPromise) {
      return this._creatingPromise;
    }
    this._creatingPromise = this._createWindowInternal(port).finally(() => {
      this._creatingPromise = null;
    });
    return this._creatingPromise;
  }

  async _createWindowInternal(port) {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }
    const { BrowserWindow, ipcMain } = loadElectron();
    const bounds = this._getTargetBounds();
    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setMenu(null);

    win.on('closed', () => {
      this.window = null;
      this.isListening = false;
    });

    const overlayUrl = `http://127.0.0.1:${port}/overlay.html`;
    let resolveReady = null;
    const readyPromise = new Promise((resolve) => {
      resolveReady = resolve;
    });
    const onOverlayReady = (event) => {
      if (!win.isDestroyed() && event?.sender === win.webContents) {
        resolveReady?.();
      }
    };
    const readyTimeout = setTimeout(() => resolveReady?.(), 1500);
    if (typeof readyTimeout.unref === 'function') readyTimeout.unref();
    ipcMain.on('overlay:ready', onOverlayReady);
    win.once('closed', () => resolveReady?.());

    try {
      await win.loadURL(overlayUrl);
      if (!win.isDestroyed() && win.webContents.isLoading()) {
        await new Promise(
          /** @param {(v?: void) => void} resolve */ (resolve) => {
            const timer = setTimeout(() => resolve(), 1500);
            win.webContents.once('did-finish-load', () => {
              clearTimeout(timer);
              resolve();
            });
          },
        );
      }
      if (!win.isDestroyed()) {
        await readyPromise;
      }
    } finally {
      clearTimeout(readyTimeout);
      ipcMain.removeListener('overlay:ready', onOverlayReady);
    }
    if (win.isDestroyed()) {
      throw new Error('Overlay window closed during initialization.');
    }
    this.window = win;
    return win;
  }

  setListeningState(listening) {
    this.isListening = Boolean(listening);
    return { ok: true, listening: this.isListening };
  }

  async toggle(port) {
    if (!port) return { ok: false, error: 'Server port not ready.' };
    this._clearIdleTimer();
    const win = await this.ensureWindow(port);
    const bounds = this._getTargetBounds();
    win.setBounds(bounds, false);

    if (!win.isVisible()) {
      win.setFocusable(false);
      win.showInactive();
      this.isListening = true;
      win.webContents.send('overlay:command', { action: 'start' });
      return { ok: true, visible: true, listening: true, bounds };
    }

    if (this.isListening) {
      this.isListening = false;
      win.webContents.send('overlay:command', { action: 'stop' });
      return { ok: true, visible: true, listening: false, bounds };
    }

    this.isListening = true;
    win.webContents.send('overlay:command', { action: 'start' });
    return { ok: true, visible: true, listening: true, bounds };
  }

  async showInactive(port, action = 'start') {
    if (!port) return { ok: false, error: 'Server port not ready.' };
    this._clearIdleTimer();
    const win = await this.ensureWindow(port);
    const bounds = this._getTargetBounds();
    win.setBounds(bounds, false);
    win.setFocusable(false);
    win.showInactive();
    this.isListening = action === 'start';
    win.webContents.send('overlay:command', { action });
    return { ok: true, visible: true, bounds };
  }

  setFocusable(focusable) {
    if (!this.window || this.window.isDestroyed()) return { ok: false };
    const next = Boolean(focusable);
    this.window.setFocusable(next);
    if (next) {
      this.window.focus();
    }
    return { ok: true, focusable: next };
  }

  hide() {
    this.isListening = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.setFocusable(false);
      this.window.hide();
      this._scheduleIdleDestroy();
    }
    return { ok: true, visible: false };
  }

  getBounds() {
    if (!this.window || this.window.isDestroyed()) return null;
    return this.window.getBounds();
  }

  destroy() {
    this._clearIdleTimer();
    this.isListening = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }
}

module.exports = {
  VoiceOverlayManager,
  computeOverlayBounds,
  OVERLAY_WIDTH,
  OVERLAY_HEIGHT,
  TASKBAR_MARGIN_PX,
};
