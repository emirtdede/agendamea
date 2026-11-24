import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { ValidationError } from '../../src/db/database.ts';
import {
  assertSafeLocalSyncFolder,
  isLoopbackAddress,
  sendRouteError,
} from '../middleware/security.ts';
import type { ServerContext } from '../types.ts';

export function registerOneDriveRoutes(ctx: ServerContext): void {
  const { app, db, cloudSync } = ctx;

  app.get('/api/onedrive/status', (_req, res) => {
    try {
      res.json(cloudSync.resolveOneDriveStatus());
    } catch (err) {
      sendRouteError(res, 'GET /api/onedrive/status', err, 'OneDrive durumu alınamadı.');
    }
  });

  app.post('/api/onedrive/connect', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const body = req.body ?? {};
      const requestedPath =
        typeof body.folderPath === 'string' && body.folderPath.trim().length > 0
          ? assertSafeLocalSyncFolder(body.folderPath)
          : cloudSync.detectDefaultOneDriveRoot();
      const autoSync = typeof body.autoSync === 'boolean' ? body.autoSync : true;
      db.updateSettings({
        onedriveCustomPath: requestedPath,
        onedriveAutoSync: autoSync,
      });

      const localSnap = db.getBootstrap();
      const isLocalEmpty =
        localSnap.todos.length === 0 &&
        localSnap.categories.length === 0 &&
        localSnap.trashedTodos.length === 0 &&
        localSnap.trashedCategories.length === 0;
      const existingRemote = cloudSync.readValidOneDriveBackup(requestedPath);

      if (
        isLocalEmpty &&
        existingRemote &&
        (existingRemote.todoCount > 0 || existingRemote.categoryCount > 0)
      ) {
        const restoredBootstrap = db.importBackup(existingRemote.payload);
        res.json({
          ...cloudSync.resolveOneDriveStatus(),
          restoredBootstrap,
        });
        return;
      }

      if (isLocalEmpty && !existingRemote) {
        fs.mkdirSync(requestedPath, { recursive: true });
        res.json(cloudSync.resolveOneDriveStatus());
        return;
      }

      const status = cloudSync.writeOneDriveSyncSnapshot(requestedPath, true);
      res.json(status);
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/connect', err, 'OneDrive bağlantısı kurulamadı.');
    }
  });

  app.post('/api/onedrive/disconnect', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      db.updateSettings({
        onedriveCustomPath: '',
        onedriveAutoSync: false,
      });
      res.json(cloudSync.resolveOneDriveStatus());
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/disconnect', err, 'OneDrive bağlantısı kesilemedi.');
    }
  });

  app.post('/api/onedrive/sync-push', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const current = cloudSync.resolveOneDriveStatus();
      if (!current.connected && current.folderPath) {
        db.updateSettings({ onedriveCustomPath: current.folderPath, onedriveAutoSync: true });
      }
      const status = cloudSync.writeOneDriveSyncSnapshot(undefined, true);
      res.json(status);
    } catch (err) {
      sendRouteError(
        res,
        'POST /api/onedrive/sync-push',
        err,
        'OneDrive eşitlemesi başarısız oldu.',
      );
    }
  });

  app.post('/api/onedrive/sync-pull', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const current = cloudSync.resolveOneDriveStatus();
      const folder = current.folderPath ?? cloudSync.detectDefaultOneDriveRoot();
      const validBackup = cloudSync.readValidOneDriveBackup(folder);
      if (!validBackup) {
        throw new ValidationError('OneDrive yedek dosyası bulunamadı.');
      }
      if (!current.connected) {
        db.updateSettings({
          onedriveCustomPath: folder,
          onedriveAutoSync: true,
        });
      }
      const bootstrap = db.importBackup(validBackup.payload);
      res.json({
        status: cloudSync.resolveOneDriveStatus(),
        bootstrap,
      });
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/sync-pull', err, 'OneDrive verisi geri yüklenemedi.');
    }
  });

  app.get('/api/onedrive/backups', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      res.json({ backups: cloudSync.listCloudBackupSnapshots() });
    } catch (err) {
      sendRouteError(res, 'GET /api/onedrive/backups', err, 'Yedek geçmişi okunamadı.');
    }
  });

  app.post('/api/onedrive/restore-file', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
      const found = cloudSync.readCloudBackupByFileName(fileName);
      if (!found) {
        throw new ValidationError('Seçilen yedek dosyası bulunamadı veya geçersiz.');
      }
      const bootstrap = db.importBackup(found.payload);
      res.json({
        status: cloudSync.resolveOneDriveStatus(),
        bootstrap,
      });
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/restore-file', err, 'Yedek geri yüklenemedi.');
    }
  });

  app.post('/api/onedrive/open-folder', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const current = cloudSync.resolveOneDriveStatus();
      const folder = current.folderPath ?? cloudSync.detectDefaultOneDriveRoot();
      fs.mkdirSync(folder, { recursive: true });
      const onExecDone = () => {
        // OS file explorer process launched asynchronously
      };
      if (process.platform === 'win32') {
        execFile('explorer.exe', [folder], { timeout: 5000 }, onExecDone);
      } else if (process.platform === 'darwin') {
        execFile('open', [folder], { timeout: 5000 }, onExecDone);
      } else {
        execFile('xdg-open', [folder], { timeout: 5000 }, onExecDone);
      }
      res.json({ ok: true, path: folder });
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/open-folder', err, 'OneDrive klasörü açılamadı.');
    }
  });
}
