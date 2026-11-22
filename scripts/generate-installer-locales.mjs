import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_LANGUAGES } from '../src/i18n/languages.ts';
import { getDictionary } from '../src/i18n/localesWorld.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.resolve(
  __dirname,
  '..',
  'installer',
  'Agendamea.Setup',
  'Localization',
  'locales.json',
);

function cleanDash(value) {
  return String(value ?? '').replace(/[\u2013\u2014]/g, '-');
}

const entries = SUPPORTED_LANGUAGES.map((meta) => {
  const d = getDictionary(meta.code);
  const isTr = meta.code === 'tr';
  const isEn = meta.code === 'en';

  return {
    code: meta.code,
    nativeName: cleanDash(meta.nativeName),
    englishName: cleanDash(meta.englishName),
    dir: meta.dir,
    windowTitle: isTr ? 'Agendamea Kurulum' : isEn ? 'Agendamea Setup' : `Agendamea · ${cleanDash(d.settings)}`,
    uninstallWindowTitle: isTr
      ? 'Agendamea Kaldır'
      : isEn
        ? 'Uninstall Agendamea'
        : `Agendamea · ${cleanDash(d.permanentDeleteTitle)}`,
    tagline: isTr
      ? 'İnternetsiz çalışan, hızlı ve gizlilik odaklı günlük görev yöneticiniz.'
      : isEn
        ? 'Fast, offline-first daily task manager with on-device AI.'
        : cleanDash(d.appTitleSuffix),
    installButton: isTr ? 'Kur' : isEn ? 'Install' : cleanDash(d.applyButton),
    optionsButton: isTr ? 'Seçenekler' : isEn ? 'Options' : cleanDash(d.settings),
    optionsTitle: isTr ? 'Kurulum Seçenekleri' : isEn ? 'Install Options' : cleanDash(d.settings),
    languageLabel: cleanDash(d.languageSectionTitle),
    installDirLabel: isTr ? 'Kurulum Klasörü' : isEn ? 'Install Folder' : cleanDash(d.cloudPickFolderButton),
    browseButton: isTr ? 'Gözat' : isEn ? 'Browse' : cleanDash(d.openMenu),
    desktopShortcutLabel: isTr
      ? 'Masaüstü kısayolu oluştur'
      : isEn
        ? 'Create Desktop shortcut'
        : `Desktop · ${cleanDash(d.applyButton)}`,
    startMenuShortcutLabel: isTr
      ? 'Başlat Menüsü kısayolu oluştur'
      : isEn
        ? 'Create Start Menu shortcut'
        : `Start Menu · ${cleanDash(d.applyButton)}`,
    launchAtStartupLabel: cleanDash(d.launchAtStartupTitle),
    installCliLabel: isTr
      ? 'Terminal CLI komutlarını (ag) PATH içine ekle'
      : isEn
        ? 'Add terminal CLI commands (ag) to user PATH'
        : cleanDash(d.docsCliInstallButton),
    diskRequiredLabel: isTr ? 'Gerekli alan' : isEn ? 'Required space' : 'Disk',
    stepPreparing: isTr
      ? 'Kurulum hazırlanıyor...'
      : isEn
        ? 'Preparing installation...'
        : `${cleanDash(d.applyButton)}...`,
    stepClosingApp: isTr
      ? 'Çalışan Agendamea kapatılıyor...'
      : isEn
        ? 'Closing running Agendamea...'
        : `${cleanDash(d.windowClose)}...`,
    stepExtracting: isTr
      ? 'Uygulama dosyaları çıkarılıyor...'
      : isEn
        ? 'Extracting application files...'
        : `${cleanDash(d.downloadingUpdateLabel)}`,
    stepIntegrating: isTr
      ? 'Kısayollar ve sistem kaydı oluşturuluyor...'
      : isEn
        ? 'Creating shortcuts and registration...'
        : `${cleanDash(d.settings)}...`,
    stepFinalizing: isTr
      ? 'Son dokunuşlar yapılıyor...'
      : isEn
        ? 'Finalizing installation...'
        : `${cleanDash(d.applyButton)}...`,
    doneTitle: isTr ? 'Agendamea kuruldu' : isEn ? 'Agendamea is ready' : `Agendamea · ${cleanDash(d.enabledBadge)}`,
    doneSubtitle: isTr
      ? 'Kurulum başarıyla tamamlandı. Hemen planlamaya başlayabilirsiniz.'
      : isEn
        ? 'Installation finished cleanly. Ready to start planning.'
        : cleanDash(d.settingsSubtitle),
    closeButton: isTr ? 'Kapat' : isEn ? 'Close' : cleanDash(d.cancelButton),
    launchButton: isTr
      ? "Agendamea'yı başlat"
      : isEn
        ? 'Launch Agendamea'
        : cleanDash(d.trayOpenApp),
    uninstallTitle: isTr
      ? "Agendamea'yı Kaldır"
      : isEn
        ? 'Uninstall Agendamea'
        : cleanDash(d.permanentDeleteTitle),
    uninstallSubtitle: isTr
      ? 'Uygulama dosyaları ve kısayollar bilgisayarınızdan kaldırılacak.'
      : isEn
        ? 'Application binaries and shortcuts will be removed from your PC.'
        : cleanDash(d.trashIntroDesc),
    deleteUserDataLabel: isTr
      ? 'Kullanıcı verilerini ve görevleri de sil'
      : isEn
        ? 'Also delete local user data and tasks'
        : cleanDash(d.resetDataSectionTitle),
    cancelButton: cleanDash(d.cancelButton),
    uninstallButton: isTr ? 'Kaldır' : isEn ? 'Uninstall' : cleanDash(d.permanentDeleteTitle),
    uninstallingStep: isTr
      ? 'Agendamea kaldırılıyor...'
      : isEn
        ? 'Removing Agendamea...'
        : `${cleanDash(d.deletingButton)}`,
    uninstalledTitle: isTr
      ? 'Agendamea kaldırıldı'
      : isEn
        ? 'Agendamea was uninstalled'
        : `Agendamea · ${cleanDash(d.deletedPrefix)}`,
    uninstalledSubtitle: isTr
      ? 'Tüm uygulama bileşenleri sisteminizden temizlendi.'
      : isEn
        ? 'All application files have been removed cleanly.'
        : cleanDash(d.resetDataDoneToast),
    errorTitle: isTr ? 'Kurulum tamamlanamadı' : isEn ? 'Setup could not finish' : cleanDash(d.operationFailedToast),
    retryButton: cleanDash(d.retry),
    footerText: 'Vellium Teknoloji A.S. · MIT',
  };
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), 'utf8');
console.log(`[installer-locales] Generated ${entries.length} languages -> ${outPath}`);
