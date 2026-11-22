import type { LanguageCode } from './languages';

export interface UiDictionary {
  // Application title
  appTitleSuffix: string;

  // Smart views & navigation
  allTasks: string;
  today: string;
  important: string;
  completed: string;
  categories: string;
  uncategorized: string;
  noCategoriesYet: string;
  newCategory: string;
  categoryNamePlaceholder: string;
  searchPlaceholder: string;
  clearSearch: string;
  settings: string;
  sponsor: string;
  collapseSidebar: string;
  expandSidebar: string;
  closeMenu: string;
  openMenu: string;

  // Task counts & status filters
  activeCountLabel: string;
  completedCountLabel: string;
  filterAll: string;
  filterActive: string;
  filterCompleted: string;
  clearCompleted: string;
  sortCustom: string;
  sortPriority: string;
  sortDueDate: string;
  sortNewest: string;
  retry: string;

  // QuickAddBar & Dates (Optional single / range / no date)
  addTaskPlaceholder: string;
  addButton: string;
  addingButton: string;
  applyButton: string;
  cancelButton: string;
  deleteToTrashButton: string;
  dateButton: string;
  startDateLabel: string;
  dueDateLabel: string;
  optionalDateHint: string;
  tomorrow: string;
  yesterday: string;
  overdueSuffix: string;
  clearDate: string;
  instantSaveBadge: string;
  autoSavedBadge: string;
  createdPrefix: string;

  // Priorities
  priorityLabel: string;
  priorityLow: string;
  priorityNormal: string;
  priorityHigh: string;
  prioritySuffix: string;

  // Subtasks & Detail Panel
  subtasksTitle: string;
  subtaskCountUnit: string;
  addSubtaskPlaceholder: string;
  notesPlaceholder: string;
  taskTitlePlaceholder: string;
  markComplete: string;
  markCompletedDone: string;
  pinLabel: string;
  unpinLabel: string;

  // Empty states
  emptySearchTitle: string;
  emptySearchDesc: string;
  emptyCompletedTitle: string;
  emptyCompletedDesc: string;
  emptyListTitle: string;
  emptyListDesc: string;
  addFirstTaskButton: string;

  // Settings Modal
  settingsSubtitle: string;
  tabGeneral: string;
  tabTrash: string;
  languageSectionTitle: string;
  languageSearchPlaceholder: string;
  appearanceModeTitle: string;
  lightMode: string;
  darkMode: string;
  systemMode: string;
  colorThemeTitle: string;
  themesCountUnit: string;
  dataAndBackupTitle: string;
  localRecordsBadge: string;
  dragReorderTitle: string;
  dragLockedDesc: string;
  dragUnlockedDesc: string;
  lockedBadge: string;
  unlockedBadge: string;
  enabledBadge: string;
  disabledBadge: string;
  backupRestoreTitle: string;
  backupRestoreDesc: string;
  restoreButton: string;
  restoringButton: string;
  downloadBackupButton: string;
  overwriteAndRestore: string;
  moveCompletedToTrashTitle: string;
  moveCompletedToTrashEmptyDesc: string;
  moveButton: string;
  movingButton: string;
  keyboardShortcutsTitle: string;
  shortcutNewTask: string;
  shortcutSearch: string;
  shortcutReorder: string;
  shortcutEscape: string;

  // Trash tab
  trashIntroDesc: string;
  emptyTrashButton: string;
  confirmDeleteAllPermanent: string;
  deletingButton: string;
  trashEmptyTitle: string;
  trashEmptyDesc: string;
  tasksTitle: string;
  deletedPrefix: string;
  restoreItemButton: string;
  permanentDeleteTitle: string;
  confirmMoveCategoryTrash: string;

  // Auto & Manual Update System
  updatesSectionTitle: string;
  currentVersionLabel: string;
  checkForUpdatesButton: string;
  checkingUpdatesLabel: string;
  upToDateLabel: string;
  updateAvailableLabel: string;
  downloadAndInstallButton: string;
  downloadingUpdateLabel: string;
  updateErrorOfflineLabel: string;
  autoUpdateToggleTitle: string;
  autoUpdateToggleDesc: string;
  lastCheckedPrefix: string;
  viewReleaseNotes: string;

  // Legal & Compliance (Microsoft Store & Global)
  legalSectionTitle: string;
  legalSectionSubtitle: string;
  backToSettingsButton: string;
  legalPrivacyTitle: string;
  legalTermsTitle: string;
  legalKvkkGdprTitle: string;
  legalOpenSourceTitle: string;
  legalAccessibilityTitle: string;
  legalLastUpdated: string;

  // Offline & Toasts
  offlineBannerText: string;
  undoButton: string;
  todoMovedToTrashToast: string;
  categoryMovedToTrashToast: string;
  backupRestoredToast: string;

  // Window Controls
  windowControlsLabel: string;
  windowMinimize: string;
  windowMaximize: string;
  windowRestore: string;
  windowClose: string;
  windowMinimizedToast: string;
  windowFullscreenBlockedToast: string;
  windowCloseTabToast: string;

  // Category Color Picker
  selectColorLabel: string;
  customColorTitle: string;
  customColorHexLabel: string;

  // 16 Localized Color Names (14 Theme Colors + Pure Yellow + White)
  colorObsidian: string;
  colorSlate: string;
  colorNavy: string;
  colorBlue: string;
  colorCyan: string;
  colorIndigo: string;
  colorPurple: string;
  colorPink: string;
  colorRed: string;
  colorOrange: string;
  colorYellow: string;
  colorPureYellow: string;
  colorEmerald: string;
  colorGrass: string;
  colorLime: string;
  colorWhite: string;

  // Localized Error & Validation Messages
  importSizeExceededError: string;
  importInvalidBackupError: string;
  importRestoreFailedError: string;
  operationFailedToast: string;
  loadFailedError: string;

  // Views (List, Kanban, Calendar, Matrix), Time, Tags & OneDrive Sync
  viewList: string;
  viewKanban: string;
  viewCalendar: string;
  viewMatrix: string;
  kanbanGroupByPriority: string;
  kanbanGroupByStatus: string;
  matrixQ1Title: string;
  matrixQ2Title: string;
  matrixQ3Title: string;
  matrixQ4Title: string;
  dueTimeLabel: string;
  tagsLabel: string;
  addTagPlaceholder: string;
  unscheduledTasksTitle: string;
  onedriveSectionTitle: string;
  onedriveSectionDesc: string;
  onedriveConnectButton: string;
  onedriveDisconnectButton: string;
  onedriveSyncNowButton: string;
  onedriveRestoreButton: string;
  onedriveAutoSyncTitle: string;
  onedriveConnectedBadge: string;
  onedriveLastSyncedPrefix: string;
  onedriveSyncedToast: string;
  onedriveOpenFolderButton: string;
  onedriveBackupDetectedTitle: string;
  onedriveBackupDetectedDesc: string;
  onedriveStartFreshButton: string;
  welcomeReplayButton: string;
  welcomeSkipButton: string;
  welcomeBackButton: string;
  welcomeNextButton: string;
  welcomeStartButton: string;
  welcomeOpenSettingsButton: string;
  welcomeStep1Title: string;
  welcomeStep1Desc: string;
  welcomeStep2Title: string;
  welcomeStep2Desc: string;
  welcomeStep3Title: string;
  welcomeStep3Desc: string;
  welcomeStep4Title: string;
  welcomeStep4Desc: string;
  welcomeCardListDesc: string;
  welcomeCardKanbanDesc: string;
  welcomeCardCalendarDesc: string;
  welcomeCardMatrixDesc: string;
  welcomePrivacyLocalTitle: string;
  welcomePrivacyLocalDesc: string;
  welcomePrivacyCloudTitle: string;
  welcomePrivacyCloudDesc: string;
  welcomePrivacyUndoTitle: string;
  welcomePrivacyUndoDesc: string;
  customThemeButton: string;
  customThemeHexTitle: string;
  customThemeHexHint: string;
  appIconSectionTitle: string;
  appIconSectionDesc: string;
  appIconMatchTheme: string;
  appIconDarkMono: string;
  appIconLightMono: string;
  appIconCustom: string;
  accessibilitySectionTitle: string;
  zoomLevelTitle: string;
  zoomLevelDesc: string;
  zoomResetButton: string;
  highContrastTitle: string;
  highContrastDesc: string;
  reducedMotionTitle: string;
  reducedMotionDesc: string;
  closeBehaviorSectionTitle: string;
  closeBehaviorDesc: string;
  closeBehaviorAsk: string;
  closeBehaviorTray: string;
  closeBehaviorQuit: string;
  closeModalTitle: string;
  closeModalDesc: string;
  closeActionTrayTitle: string;
  closeActionTrayDesc: string;
  closeActionQuitTitle: string;
  closeActionQuitDesc: string;
  closeRememberChoiceLabel: string;
  trayOpenApp: string;
  launchAtStartupTitle: string;
  launchAtStartupDesc: string;
  globalQuickAddTitle: string;
  globalQuickAddDesc: string;
  cloudPickFolderButton: string;
  cloudCustomFolderHint: string;
  copyDiagnosticsButton: string;
  diagnosticsCopiedToast: string;
  updateReadyToInstallLabel: string;
  restartAndUpdateButton: string;
  settingsBackToTasks: string;
  settingsNavGroupPersonalization: string;
  settingsNavGroupWorkspace: string;
  settingsNavGroupSystem: string;
  settingsTabAppearance: string;
  settingsTabGeneral: string;
  settingsTabDocs: string;
  settingsTabAbout: string;
  welcomeLanguageDesc: string;
  welcomeBenefitOffline: string;
  welcomeBenefitInstant: string;
  welcomeBenefitPrivate: string;
  cloudSyncSectionTitle: string;
  cloudSyncSectionDesc: string;
  cloudSyncProvidersTitle: string;
  cloudDetectedBadge: string;
  cloudNotInstalledHint: string;
  trashSearchPlaceholder: string;
  trashFilterAll: string;
  trashFilterTodos: string;
  trashFilterCategories: string;
  trashSortNewest: string;
  trashSortOldest: string;
  trashSortAZ: string;
  trashSortZA: string;
  trashDateFrom: string;
  trashDateTo: string;
  trashNoMatchesTitle: string;
  docsSubtitle: string;
  docsCliTitle: string;
  docsCliDesc: string;
  docsMcpTitle: string;
  docsMcpDesc: string;
  docsCopyButton: string;
  docsCopiedLabel: string;
  docsCmdListDesc: string;
  docsCmdAddDesc: string;
  docsCmdDoneDesc: string;
  docsCmdDelDesc: string;
  docsCmdSearchDesc: string;
  docsCmdUndoDesc: string;
  docsCmdStatusDesc: string;
  docsCmdAddExample: string;
  docsCmdSearchExample: string;
  docsCmdUndoExample: string;
  docsCliInstallButton: string;
  docsCliInstalledBadge: string;
  docsCliTryTerminalButton: string;
  docsCliInstallHint: string;
  docsCliAllCommandsToggle: string;
  docsCliAllCommandsHint: string;
  docsCmdShowExample: string;
  docsCmdShowDesc: string;
  docsCmdEditExample: string;
  docsCmdEditDesc: string;
  docsCmdSubExample: string;
  docsCmdSubDesc: string;
  docsCmdCatExample: string;
  docsCmdCatDesc: string;
  docsCmdTrashExample: string;
  docsCmdTrashDesc: string;
  docsCmdMatrixExample: string;
  docsCmdMatrixDesc: string;
  docsCmdBackupExample: string;
  docsCmdBackupDesc: string;
  docsCmdConfigExample: string;
  docsCmdConfigDesc: string;
  docsCmdServeExample: string;
  docsCmdServeDesc: string;
  docsWebhookTitle: string;
  docsWebhookDesc: string;
  docsWebhookUrlPlaceholder: string;
  docsWebhookSecretPlaceholder: string;
  docsWebhookSaveButton: string;
  docsWebhookTestButton: string;
  docsWebhookIncomingTitle: string;
  docsWebhookSavedToast: string;
  docsWebhookTestOk: string;
  taskDateRangeFilterButton: string;
  resetDataSectionTitle: string;
  resetDataSectionDesc: string;
  resetDataButton: string;
  resetDataConfirmWarning: string;
  resetDataIncludeSettingsLabel: string;
  resetDataConfirmButton: string;
  resetDataDoneToast: string;
}

export const TR_DICTIONARY: UiDictionary = {
  appTitleSuffix: 'Görev Yöneticisi',

  allTasks: 'Tüm Görevler',
  today: 'Bugün',
  important: 'Önemli',
  completed: 'Tamamlananlar',
  categories: 'Kategoriler',
  uncategorized: 'Kategorisiz',
  noCategoriesYet: 'Henüz kategori yok.',
  newCategory: 'Yeni Kategori',
  categoryNamePlaceholder: 'Kategori adı...',
  searchPlaceholder: 'Ara...',
  clearSearch: 'Aramayı Temizle',
  settings: 'Ayarlar',
  sponsor: 'Sponsor',
  collapseSidebar: 'Minimal menü',
  expandSidebar: 'Kenar menüsünü genişlet',
  closeMenu: 'Menüyü kapat',
  openMenu: 'Menüyü aç',

  activeCountLabel: 'aktif',
  completedCountLabel: 'tamamlanan',
  filterAll: 'Tümü',
  filterActive: 'Aktif',
  filterCompleted: 'Tamamlanan',
  clearCompleted: 'Tamamlananları Temizle',
  sortCustom: 'Özel Sıra',
  sortPriority: 'Öncelik',
  sortDueDate: 'Tarih',
  sortNewest: 'En Yeni',
  retry: 'Tekrar Dene',

  addTaskPlaceholder: 'Yeni görev ekle...',
  addButton: 'Ekle',
  addingButton: 'Ekleniyor...',
  applyButton: 'Uygula',
  cancelButton: 'Vazgeç',
  deleteToTrashButton: 'Çöpe Taşı',
  dateButton: 'Tarih',
  startDateLabel: 'Başlangıç Tarihi',
  dueDateLabel: 'Bitiş / Son Tarih',
  optionalDateHint: 'İsteğe bağlı: Tek tarih, başlangıç-bitiş aralığı veya tarihsiz bırakabilirsiniz.',
  tomorrow: 'Yarın',
  yesterday: 'Dün',
  overdueSuffix: 'Gecikti',
  clearDate: 'Temizle',
  instantSaveBadge: 'Anlık kaydedilir',
  autoSavedBadge: 'Otomatik kaydedildi',
  createdPrefix: 'Oluşturuldu',

  priorityLabel: 'Öncelik',
  priorityLow: 'Düşük',
  priorityNormal: 'Normal',
  priorityHigh: 'Yüksek',
  prioritySuffix: 'öncelik',

  subtasksTitle: 'Alt Görevler',
  subtaskCountUnit: 'alt görev',
  addSubtaskPlaceholder: "Alt görev ekle ve Enter'a bas...",
  notesPlaceholder: 'Notlar veya ayrıntılar ekleyin (anlık kaydedilir)...',
  taskTitlePlaceholder: 'Görev başlığı...',
  markComplete: 'Tamamla',
  markCompletedDone: 'Tamamlandı',
  pinLabel: 'Sabitle',
  unpinLabel: 'Sabitlemeyi kaldır',

  emptySearchTitle: 'Eşleşen görev bulunamadı',
  emptySearchDesc: 'Aramanıza uygun kayıt bulunamadı.',
  emptyCompletedTitle: 'Henüz tamamlanan görev yok',
  emptyCompletedDesc: 'Tamamladığınız görevler burada listelenir.',
  emptyListTitle: 'Bu liste şu an boş',
  emptyListDesc: 'Yukarıdaki alana yazıp Enter tuşuna basarak ilk görevinizi hemen ekleyebilirsiniz.',
  addFirstTaskButton: 'İlk Görevi Ekle',

  settingsSubtitle: 'Tüm değişiklikler bilgisayarınıza anında kaydedilir.',
  tabGeneral: 'Genel ve Tema',
  tabTrash: 'Çöp Kutusu',
  languageSectionTitle: 'Uygulama Dili',
  languageSearchPlaceholder: 'Dil ara (Türkçe, English, Deutsch...)...',
  appearanceModeTitle: 'Görünüm Modu',
  lightMode: 'Açık',
  darkMode: 'Koyu',
  systemMode: 'Sistem',
  colorThemeTitle: 'Renk Teması',
  themesCountUnit: 'tema',
  dataAndBackupTitle: 'Veri ve Yedekleme',
  localRecordsBadge: 'kayıt · Cihazda kayıtlı',
  dragReorderTitle: 'Sürükleyerek Sıralama',
  dragLockedDesc: 'Kilitli - kategori ve görevlerin konumu sürüklenerek değiştirilemez.',
  dragUnlockedDesc: 'Açık - kategori ve görevleri tutup sürükleyerek yeniden sıralayabilirsiniz.',
  lockedBadge: 'Kilitli',
  unlockedBadge: 'Açık',
  enabledBadge: 'Açık',
  disabledBadge: 'Kapalı',
  backupRestoreTitle: 'Yedek İndir / Geri Yükle',
  backupRestoreDesc: 'Tüm görev, kategori, alt görev ve çöp kutusu verilerinizi yedek dosyası olarak indirin veya geri yükleyin.',
  restoreButton: 'Geri Yükle',
  restoringButton: 'Yükleniyor...',
  downloadBackupButton: 'İndir',
  overwriteAndRestore: 'Üzerine Yaz ve Yükle',
  moveCompletedToTrashTitle: 'Tamamlananları Çöp Kutusuna Taşı',
  moveCompletedToTrashEmptyDesc: 'Taşınacak tamamlanmış görev bulunmuyor.',
  moveButton: 'Taşı',
  movingButton: 'Taşınıyor...',
  keyboardShortcutsTitle: 'Klavye Kısayolları',
  shortcutNewTask: 'Yeni görev girişine odaklan',
  shortcutSearch: 'Görevlerde ara',
  shortcutReorder: 'Seçili görevin sırasını taşı',
  shortcutEscape: 'Açık paneli veya pencereyi kapat',

  trashIntroDesc: 'Silinen görev ve kategoriler buradan geri yüklenebilir veya kalıcı olarak silinebilir.',
  emptyTrashButton: 'Çöp Kutusunu Boşalt',
  confirmDeleteAllPermanent: 'Tümünü Kalıcı Sil',
  deletingButton: 'Siliniyor...',
  trashEmptyTitle: 'Çöp kutusu boş',
  trashEmptyDesc: 'Sildiğiniz görevler ve kategoriler burada güvenle saklanır.',
  tasksTitle: 'Görevler',
  deletedPrefix: 'Silindi',
  restoreItemButton: 'Geri Yükle',
  permanentDeleteTitle: 'Kalıcı Sil',
  confirmMoveCategoryTrash: 'çöp kutusuna taşınsın mı? Görevler korunur.',

  updatesSectionTitle: 'Güncellemeler ve Sürüm Kontrolü',
  currentVersionLabel: 'Mevcut Sürüm',
  checkForUpdatesButton: 'Güncellemeleri Kontrol Et',
  checkingUpdatesLabel: 'Yeni sürüm kontrol ediliyor...',
  upToDateLabel: 'Agendamea güncel. En son sürümü kullanıyorsunuz.',
  updateAvailableLabel: 'Yeni sürüm mevcut',
  downloadAndInstallButton: 'İndir ve Güncelle',
  downloadingUpdateLabel: 'Güncelleme indiriliyor...',
  updateErrorOfflineLabel: 'Güncelleme sunucusuna şu an ulaşılamadı. İnternet bağlantınızı kontrol edin.',
  autoUpdateToggleTitle: 'Otomatik Güncelleme Kontrolü',
  autoUpdateToggleDesc: 'Uygulama açılışında yeni sürümleri arka planda otomatik denetle.',
  lastCheckedPrefix: 'Son kontrol',
  viewReleaseNotes: 'Sürüm Notları',

  legalSectionTitle: 'Yasal Belgeler ve Microsoft Store Uyumluluğu',
  legalSectionSubtitle: 'Bilgileri görüntülemek için ilgili başlığa tıklayın.',
  backToSettingsButton: 'Ayarlara Dön',
  legalPrivacyTitle: 'Gizlilik Politikası',
  legalTermsTitle: 'Kullanım Koşulları ve Lisans (EULA)',
  legalKvkkGdprTitle: 'KVKK ve GDPR Veri Koruma Aydınlatma Metni',
  legalOpenSourceTitle: 'Açık Kaynak ve Üçüncü Taraf Lisansları',
  legalAccessibilityTitle: 'Erişilebilirlik ve Destek Beyanı',
  legalLastUpdated: 'Son güncelleme: 22 Kasım 2026 · © 2026 Vellium Teknoloji Anonim Şirketi (vellium.dev)',

  offlineBannerText: 'Çevrimdışı çalışıyor - verileriniz cihazınızda güvende',
  undoButton: 'Geri Al',
  todoMovedToTrashToast: 'Görev çöp kutusuna taşındı',
  categoryMovedToTrashToast: 'Kategori çöp kutusuna taşındı',
  backupRestoredToast: 'Yedek başarıyla geri yüklendi.',

  windowControlsLabel: 'Pencere kontrolleri',
  windowMinimize: 'Arka plana gönder',
  windowMaximize: 'Tam ekran yap',
  windowRestore: 'Tam ekrandan çık',
  windowClose: 'Uygulamayı kapat',
  windowMinimizedToast: 'Pencere arka plana gönderildi.',
  windowFullscreenBlockedToast: 'Tam ekran modu tarayıcı tarafından engellendi (F11 kullanabilirsiniz).',
  windowCloseTabToast: 'Tarayıcı sekmesini kapatmak için Ctrl+W veya sekme kapatma düğmesini kullanın.',

  selectColorLabel: 'Renk seç',
  customColorTitle: 'Özel renk seç',
  customColorHexLabel: 'Özel renk kodu (HEX)',

  colorObsidian: 'Siyah',
  colorSlate: 'Gri',
  colorNavy: 'Lacivert',
  colorBlue: 'Mavi',
  colorCyan: 'Turkuaz',
  colorIndigo: 'İndigo',
  colorPurple: 'Mor',
  colorPink: 'Pembe',
  colorRed: 'Kırmızı',
  colorOrange: 'Turuncu',
  colorYellow: 'Kehribar',
  colorPureYellow: 'Sarı',
  colorEmerald: 'Zümrüt',
  colorGrass: 'Yeşil',
  colorLime: 'Limon',
  colorWhite: 'Beyaz',

  importSizeExceededError: 'Seçilen yedek dosyası 5 MB sınırını aşıyor.',
  importInvalidBackupError: 'Seçilen dosya geçerli bir Agendamea yedeği değil.',
  importRestoreFailedError: 'Yedek geri yüklenemedi.',
  operationFailedToast: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
  loadFailedError: 'Veriler yüklenemedi.',

  viewList: 'Liste',
  viewKanban: 'Kanban',
  viewCalendar: 'Takvim',
  viewMatrix: 'Matris',
  kanbanGroupByPriority: 'Önceliğe Göre',
  kanbanGroupByStatus: 'Duruma Göre',
  matrixQ1Title: 'I · Önemli ve Acil (Bugün)',
  matrixQ2Title: 'II · Önemli ve Planlı',
  matrixQ3Title: 'III · Normal ve Bugün',
  matrixQ4Title: 'IV · Düşük Öncelik / Daha Sonra',
  dueTimeLabel: 'Saat',
  tagsLabel: 'Etiketler',
  addTagPlaceholder: 'Etiket ekle (#iş, #acil)...',
  unscheduledTasksTitle: 'Tarihsiz Görevler',
  onedriveSectionTitle: 'Bulut Klasörü Eşitleme',
  onedriveSectionDesc: 'OneDrive, Google Drive, iCloud Drive, Dropbox veya herhangi bir yerel klasörü kullanarak görevlerinizi sunucusuz ve ücretsiz olarak yedekleyin ve eşitleyin.',
  onedriveConnectButton: 'Bulutu Bağla',
  onedriveDisconnectButton: 'Bağlantıyı Kes',
  onedriveSyncNowButton: 'Şimdi Eşitle',
  onedriveRestoreButton: 'Buluttan Yükle',
  onedriveAutoSyncTitle: 'Değişiklikleri Bulutla Otomatik Eşitle',
  onedriveConnectedBadge: 'Bulut Bağlı',
  onedriveLastSyncedPrefix: 'Son eşitleme',
  onedriveSyncedToast: 'Bulut eşitlemesi tamamlandı.',
  onedriveOpenFolderButton: 'Klasörü Aç',
  onedriveBackupDetectedTitle: 'Bulut Yedeği Tespit Edildi',
  onedriveBackupDetectedDesc:
    'Bulut eşitleme klasörünüzde daha önceden kaydedilmiş bir Agendamea yedeği bulundu. Verilerinizi geri yüklemek mi, yoksa yeni bir başlangıç yapmak mı istersiniz?',
  onedriveStartFreshButton: 'Yeni Başlangıç Yap',
  welcomeReplayButton: 'Karşılama Rehberi',
  welcomeSkipButton: 'Atla',
  welcomeBackButton: 'Geri',
  welcomeNextButton: 'İleri',
  welcomeStartButton: 'Planlamaya Başla',
  welcomeOpenSettingsButton: 'Bulut Ayarları',
  welcomeStep1Title: "Agendamea'ya Hoş Geldiniz",
  welcomeStep1Desc:
    'İnternetsiz çalışan, her değişikliği anında cihazınıza kaydeden sade ve hızlı günlük planlayıcınız. Şimdi kısa bir turla temel özellikleri keşfedelim.',
  welcomeStep2Title: 'Gününüzü 4 Farklı Görünümde Planlayın',
  welcomeStep2Desc:
    'Tek tıkla Düz Liste, Kanban Panosu, Takvim Planlayıcı ve Eisenhower Matrisi arasında geçiş yapın; görevlerinizi sürükleyip bırakarak düzenleyin.',
  welcomeStep3Title: 'Akıllı Detaylar ve Klavye Kısayolları',
  welcomeStep3Desc:
    'Başlangıç-bitiş tarihleri, saatler, alt görevler, otomatik kaydedilen notlar ve #etiketler ile her işi netleştirin; kısayollarla hız kazanın.',
  welcomeStep4Title: 'Verileriniz Sizde Kalır, Yedekleriniz Güvende',
  welcomeStep4Desc:
    'Tüm verileriniz yalnızca kendi bilgisayarınızda saklanır. Dilerseniz kendi bulut klasörünüzü bağlayarak ücretsiz 15 günlük otomatik yedekleme açabilirsiniz.',
  welcomeCardListDesc: 'Hızlı günlük akış ve akıllı filtreler',
  welcomeCardKanbanDesc: 'Öncelik veya duruma göre sütunlar',
  welcomeCardCalendarDesc: 'Saatli aylık takvim ve sürükle-planla',
  welcomeCardMatrixDesc: '4 kadranlı aciliyet-önem matrisi',
  welcomePrivacyLocalTitle: 'Cihazınızda Güvende ve Anlık Kayıt',
  welcomePrivacyLocalDesc: 'Hesap veya internet gerekmez; veriler cihazınızdan dışarı çıkmaz.',
  welcomePrivacyCloudTitle: 'Ücretsiz Bulut Klasör Yedekleme',
  welcomePrivacyCloudDesc: 'OneDrive, Google Drive, iCloud veya Dropbox ile 15 günlük otomatik yedek.',
  welcomePrivacyUndoTitle: 'Çöp Kutusu ve 12 Saniyelik Geri Al',
  welcomePrivacyUndoDesc: 'Yanlışlıkla silinen görev ve kategorileri tek tıkla geri getirin.',
  customThemeButton: 'Özel Renk',
  customThemeHexTitle: 'Özel Tema Rengi (HEX)',
  customThemeHexHint: 'İstediğiniz HEX renk kodunu girin veya renk seçiciden seçin.',
  appIconSectionTitle: 'Uygulama İkonu',
  appIconSectionDesc: 'Masaüstü kısayolu, görev çubuğu, sistem tepsisi ve pencere ikonunu anında değiştirir.',
  appIconMatchTheme: 'Temayla Eşleştir',
  appIconDarkMono: 'Koyu Monokrom',
  appIconLightMono: 'Açık Monokrom',
  appIconCustom: 'Özel İkon',
  accessibilitySectionTitle: 'Erişilebilirlik',
  zoomLevelTitle: 'Yakınlaştırma Yüzdesi',
  zoomLevelDesc: 'Metin ve arayüz boyutunu göz rahatlığınıza göre ölçeklendirin.',
  zoomResetButton: 'Sıfırla',
  highContrastTitle: 'Yüksek Kontrast Modu',
  highContrastDesc: 'Kenarlıkları, metin karşıtlığını ve klavye odak halkalarını güçlendirir.',
  reducedMotionTitle: 'Azaltılmış Hareket',
  reducedMotionDesc: 'Geçiş animasyonlarını en aza indirerek daha sakin bir deneyim sunar.',
  closeBehaviorSectionTitle: 'Kapanış ve Sistem Tepsisi',
  closeBehaviorDesc: 'Pencereyi kapat düğmesine bastığınızda ne yapılacağını seçin.',
  closeBehaviorAsk: 'Her Zaman Sor',
  closeBehaviorTray: 'Sistem Tepsisi',
  closeBehaviorQuit: 'Tamamen Kapat',
  closeModalTitle: 'Agendamea Kapatılsın mı?',
  closeModalDesc: 'Pencereyi kapattığınızda nasıl devam etmek istersiniz?',
  closeActionTrayTitle: 'Sistem Tepsisine Küçült',
  closeActionTrayDesc: 'Arka planda sessizce çalışır; tepsiden tek tıkla açılır.',
  closeActionQuitTitle: 'Tamamen Kapat',
  closeActionQuitDesc: 'Pencereyi ve arka plan sürecini tamamen sonlandırır.',
  closeRememberChoiceLabel: 'Tercihimi hatırla (Ayarlardan değiştirilebilir)',
  trayOpenApp: "Agendamea'yı Aç",
  launchAtStartupTitle: 'Windows ile Başlat (Tepside Sessiz Açılış)',
  launchAtStartupDesc: 'Bilgisayar açıldığında Agendamea arka planda sistem tepsisinde hazır başlar.',
  globalQuickAddTitle: 'Global Hızlı Görev Kısayolu (Ctrl+Alt+N)',
  globalQuickAddDesc: 'Başka bir uygulamadayken Ctrl+Alt+N ile Agendamea penceresini açıp yeni görev girişine odaklanır.',
  cloudPickFolderButton: 'Klasör Seç',
  cloudCustomFolderHint: 'OneDrive, Google Drive, Dropbox veya istediğiniz bir yerel yedek klasörünü seçebilirsiniz.',
  copyDiagnosticsButton: 'Sistem Bilgisini Kopyala',
  diagnosticsCopiedToast: 'Sistem ve tanı bilgisi panoya kopyalandı.',
  updateReadyToInstallLabel: 'Güncelleme indirildi ve kuruluma hazır. Yeniden başlatıldığında sessizce kurulur.',
  restartAndUpdateButton: 'Yeniden Başlat ve Güncelle',
  settingsBackToTasks: 'Görevlere Dön',
  settingsNavGroupPersonalization: 'Kişiselleştirme',
  settingsNavGroupWorkspace: 'Çalışma Alanı',
  settingsNavGroupSystem: 'Sistem ve Hakkında',
  settingsTabAppearance: 'Görünüm ve Tema',
  settingsTabGeneral: 'Genel ve Dil',
  settingsTabDocs: 'Dokümantasyon',
  settingsTabAbout: 'Güncelleme ve Yasal',
  welcomeLanguageDesc: 'Uygulamayı kullanmak istediğiniz dili seçin.',
  welcomeBenefitOffline: 'İnternetsiz çalışır',
  welcomeBenefitInstant: 'Anlık otomatik kayıt',
  welcomeBenefitPrivate: 'Hesapsız ve reklamsız',
  cloudSyncSectionTitle: 'Bulut Klasör Eşitleme (Ücretsiz)',
  cloudSyncSectionDesc:
    'OneDrive, Google Drive, iCloud Drive, Dropbox veya istediğiniz bir yerel klasör üzerinden sunucusuz, hesapsız ve ücretsiz otomatik yedekleme yapın.',
  cloudSyncProvidersTitle: 'Bulut Sağlayıcıları (Tek Tıkla Bağla)',
  cloudDetectedBadge: 'Algılandı',
  cloudNotInstalledHint: 'Klasör seçilerek bağlanabilir',
  trashSearchPlaceholder: 'Çöp kutusunda görev veya kategori ara...',
  trashFilterAll: 'Tümü',
  trashFilterTodos: 'Görevler',
  trashFilterCategories: 'Kategoriler',
  trashSortNewest: 'En Yeni Silinen',
  trashSortOldest: 'En Eski Silinen',
  trashSortAZ: 'Ada Göre (A-Z)',
  trashSortZA: 'Ada Göre (Z-A)',
  trashDateFrom: 'Başlangıç',
  trashDateTo: 'Bitiş',
  trashNoMatchesTitle: 'Filtreyle eşleşen silinmiş öğe bulunamadı',
  docsSubtitle: 'Kısa terminal komutları (CLI), yapay zeka MCP sunucusu, webhook ve klavye kısayolları.',
  docsCliTitle: 'Terminal ve CLI Komutları (ag)',
  docsCliDesc: 'Uygulama açıkken veya kapalıyken (çevrimdışı SQLite) terminalden kısa komutlarla görev yönetin.',
  docsMcpTitle: 'MCP Sunucusu (Yapay Zeka Entegrasyonu)',
  docsMcpDesc: 'Claude Desktop, Cursor, Antigravity veya VS Code ayarlarına bu JSON yapılandırmasını yapıştırın (ek Node.js kurulumu gerekmez).',
  docsCopyButton: 'Kopyala',
  docsCopiedLabel: 'Kopyalandı',
  docsCmdListDesc: 'Aktif görevleri 1, 2, 3 diye numaralı listeler (ag bugun, ag onemli)',
  docsCmdAddDesc: 'Tırnaksız görev ekler (@bugun, @yarin, ! yüksek, * önemli, #etiket)',
  docsCmdDoneDesc: 'Numarayla (1) veya görev ismiyle (ag ok sunum) tamamlar',
  docsCmdDelDesc: 'Numarayla veya görev ismiyle çöp kutusuna taşır',
  docsCmdSearchDesc: 'Başlık, not ve #etiketlerde anlık arama yapar',
  docsCmdUndoDesc: 'Çöp kutusuna taşınan son görevi tek komutla geri yükler',
  docsCmdStatusDesc: 'Anlık görev, kategori ve bağlantı özetini gösterir',
  docsCmdAddExample: 'ag + Sunumu hazirla @bugun ! #is',
  docsCmdSearchExample: 'ag ara fatura',
  docsCmdUndoExample: 'ag geri',
  docsCliInstallButton: 'Terminale Kur (ag)',
  docsCliInstalledBadge: 'Terminalde Hazır (ag)',
  docsCliTryTerminalButton: 'Terminalde Dene',
  docsCliInstallHint: 'ag, agenda ve agendamea komutları kullanıcı PATH dizinine eklenir. Mevcut açık terminaller yerine yeni bir terminal açın veya "Terminalde Dene"ye tıklayın.',
  docsCliAllCommandsToggle: 'Tüm Arayüzsüz Komutlar (Detay, Alt Görev, Kategori, Çöp, Matris, Bulut, Ayar)',
  docsCliAllCommandsHint: 'Uygulama arayüzü hiç açılmasa bile Agendamea üzerinde %100 tam kontrol sağlar (ag help all).',
  docsCmdShowExample: 'ag bak 1',
  docsCmdShowDesc: 'Görevin notlarını, alt görevlerini, saatini ve etiketlerini tam gösterir',
  docsCmdEditExample: 'ag edit 1 --time 15:00 --note "Not"',
  docsCmdEditDesc: 'Başlık, not, tarih aralığı, saat, öncelik, kategori ve etiket günceller (ag move 1 2)',
  docsCmdSubExample: 'ag sub 1 + Tasarımı kontrol et',
  docsCmdSubDesc: 'Alt görev ekler, tamamlar (ok), yeniden adlandırır (edit) veya siler (rm)',
  docsCmdCatExample: 'ag cat + İş #7c3aed',
  docsCmdCatDesc: 'Kategori oluşturur, düzenler (edit), sıralar (move) veya çöpe taşır (rm)',
  docsCmdTrashExample: 'ag cop',
  docsCmdTrashDesc: 'Çöp kutusunu filtreler, kalıcı siler (ag cop sil 1) veya boşaltır (ag cop bosalt --yes)',
  docsCmdMatrixExample: 'ag matris',
  docsCmdMatrixDesc: 'Eisenhower 4 kadran öncelik görünümünü terminalde listeler',
  docsCmdBackupExample: 'ag export yedek.json',
  docsCmdBackupDesc: 'JSON yedekleme/geri yükleme (ag import), bulut (ag sync pull) ve temiz sıfırlama (ag reset --yes)',
  docsCmdConfigExample: 'ag config themeMode dark',
  docsCmdConfigDesc: 'Tema, dil, bulut klasörü ve webhook dahil tüm uygulama ayarlarını yönetir',
  docsCmdServeExample: 'ag serve start',
  docsCmdServeDesc: 'Arayüzü açmadan yerel API ve Gelen Webhook sunucusunu arka planda başlatır (ag hook logs)',
  docsWebhookTitle: 'Webhook (Otomasyon ve Bildirim)',
  docsWebhookDesc: 'Görev eklendiğinde, tamamlandığında veya silindiğinde Discord, Slack, n8n, Zapier veya kendi sunucunuza anlık JSON bildirim gönderin.',
  docsWebhookUrlPlaceholder: 'https://discord.com/api/webhooks/... veya özel URL',
  docsWebhookSecretPlaceholder: 'İsteğe bağlı gizli anahtar (X-Agendamea-Signature)',
  docsWebhookSaveButton: 'Kaydet',
  docsWebhookTestButton: 'Test Gönder',
  docsWebhookIncomingTitle: 'Gelen Webhook (Dışarıdan Görev Ekleme)',
  docsWebhookSavedToast: 'Webhook ayarları kaydedildi.',
  docsWebhookTestOk: 'Bağlantı başarılı',
  taskDateRangeFilterButton: 'Tarih Aralığı',
  resetDataSectionTitle: 'Verileri Sıfırla (Temiz Başlangıç)',
  resetDataSectionDesc: 'Tüm aktif görevleri, alt görevleri, kategorileri ve çöp kutusunu kalıcı olarak temizleyerek sıfırdan başlayın.',
  resetDataButton: 'Verileri Sıfırla',
  resetDataConfirmWarning: 'Tüm görevleriniz, kategorileriniz ve çöp kutusu öğeleriniz kalıcı olarak silinecek. Öncesinde JSON yedeği indirmeniz önerilir.',
  resetDataIncludeSettingsLabel: 'Uygulama ayarlarını da varsayılana döndür (tema, ikon, bulut, webhook)',
  resetDataConfirmButton: 'Evet, Tümünü Sıfırla',
  resetDataDoneToast: 'Tüm veriler sıfırlandı. Temiz başlangıç hazır.',
};

export const EN_DICTIONARY: UiDictionary = {
  appTitleSuffix: 'Task Manager',

  allTasks: 'All Tasks',
  today: 'Today',
  important: 'Important',
  completed: 'Completed',
  categories: 'Categories',
  uncategorized: 'Uncategorized',
  noCategoriesYet: 'No categories yet.',
  newCategory: 'New Category',
  categoryNamePlaceholder: 'Category name...',
  searchPlaceholder: 'Search...',
  clearSearch: 'Clear Search',
  settings: 'Settings',
  sponsor: 'Sponsor',
  collapseSidebar: 'Minimal sidebar',
  expandSidebar: 'Expand sidebar',
  closeMenu: 'Close menu',
  openMenu: 'Open menu',

  activeCountLabel: 'active',
  completedCountLabel: 'completed',
  filterAll: 'All',
  filterActive: 'Active',
  filterCompleted: 'Completed',
  clearCompleted: 'Clear Completed',
  sortCustom: 'Custom Order',
  sortPriority: 'Priority',
  sortDueDate: 'Date',
  sortNewest: 'Newest',
  retry: 'Retry',

  addTaskPlaceholder: 'Add a new task...',
  addButton: 'Add',
  addingButton: 'Adding...',
  applyButton: 'Apply',
  cancelButton: 'Cancel',
  deleteToTrashButton: 'Move to Trash',
  dateButton: 'Date',
  startDateLabel: 'Start Date',
  dueDateLabel: 'End / Due Date',
  optionalDateHint: 'Optional: Choose a single date, a start-end range, or leave undated.',
  tomorrow: 'Tomorrow',
  yesterday: 'Yesterday',
  overdueSuffix: 'Overdue',
  clearDate: 'Clear',
  instantSaveBadge: 'Saved instantly',
  autoSavedBadge: 'Saved automatically',
  createdPrefix: 'Created',

  priorityLabel: 'Priority',
  priorityLow: 'Low',
  priorityNormal: 'Normal',
  priorityHigh: 'High',
  prioritySuffix: 'priority',

  subtasksTitle: 'Subtasks',
  subtaskCountUnit: 'subtasks',
  addSubtaskPlaceholder: 'Add subtask and press Enter...',
  notesPlaceholder: 'Add notes or details (saved instantly)...',
  taskTitlePlaceholder: 'Task title...',
  markComplete: 'Complete',
  markCompletedDone: 'Completed',
  pinLabel: 'Pin',
  unpinLabel: 'Unpin',

  emptySearchTitle: 'No matching tasks found',
  emptySearchDesc: 'No items matched your search query.',
  emptyCompletedTitle: 'No completed tasks yet',
  emptyCompletedDesc: 'Tasks you complete will appear here.',
  emptyListTitle: 'This list is currently empty',
  emptyListDesc: 'Type above and press Enter to add your first task right away.',
  addFirstTaskButton: 'Add First Task',

  settingsSubtitle: 'All changes are saved instantly to your device.',
  tabGeneral: 'General & Theme',
  tabTrash: 'Trash',
  languageSectionTitle: 'Application Language',
  languageSearchPlaceholder: 'Search language (English, Türkçe, Deutsch...)...',
  appearanceModeTitle: 'Appearance Mode',
  lightMode: 'Light',
  darkMode: 'Dark',
  systemMode: 'System',
  colorThemeTitle: 'Color Theme',
  themesCountUnit: 'themes',
  dataAndBackupTitle: 'Data & Backup',
  localRecordsBadge: 'items · Stored on device',
  dragReorderTitle: 'Drag & Drop Reordering',
  dragLockedDesc: 'Locked - categories and tasks cannot be dragged to reorder.',
  dragUnlockedDesc: 'Unlocked - drag categories and tasks to reorder them freely.',
  lockedBadge: 'Locked',
  unlockedBadge: 'Unlocked',
  enabledBadge: 'Enabled',
  disabledBadge: 'Disabled',
  backupRestoreTitle: 'Download / Restore Backup',
  backupRestoreDesc: 'Download or restore all tasks, categories, subtasks, and trash as a backup file.',
  restoreButton: 'Restore',
  restoringButton: 'Restoring...',
  downloadBackupButton: 'Download',
  overwriteAndRestore: 'Overwrite & Restore',
  moveCompletedToTrashTitle: 'Move Completed to Trash',
  moveCompletedToTrashEmptyDesc: 'No completed tasks to move.',
  moveButton: 'Move',
  movingButton: 'Moving...',
  keyboardShortcutsTitle: 'Keyboard Shortcuts',
  shortcutNewTask: 'Focus new task input',
  shortcutSearch: 'Search tasks',
  shortcutReorder: 'Move selected task up or down',
  shortcutEscape: 'Close active panel or dialog',

  trashIntroDesc: 'Deleted tasks and categories can be restored or permanently removed here.',
  emptyTrashButton: 'Empty Trash',
  confirmDeleteAllPermanent: 'Delete All Permanently',
  deletingButton: 'Deleting...',
  trashEmptyTitle: 'Trash is empty',
  trashEmptyDesc: 'Tasks and categories you delete are safely kept here.',
  tasksTitle: 'Tasks',
  deletedPrefix: 'Deleted',
  restoreItemButton: 'Restore',
  permanentDeleteTitle: 'Delete Permanently',
  confirmMoveCategoryTrash: 'Move to trash? Tasks will be preserved.',

  updatesSectionTitle: 'Updates & Version Check',
  currentVersionLabel: 'Current Version',
  checkForUpdatesButton: 'Check for Updates',
  checkingUpdatesLabel: 'Checking for updates...',
  upToDateLabel: 'Agendamea is up to date. You are running the latest version.',
  updateAvailableLabel: 'New version available',
  downloadAndInstallButton: 'Download & Update',
  downloadingUpdateLabel: 'Downloading update...',
  updateErrorOfflineLabel: 'Could not reach the update server. Please check your internet connection.',
  autoUpdateToggleTitle: 'Automatic Update Check',
  autoUpdateToggleDesc: 'Automatically check for new releases in the background on startup.',
  lastCheckedPrefix: 'Last checked',
  viewReleaseNotes: 'Release Notes',

  legalSectionTitle: 'Legal Notices & Microsoft Store Compliance',
  legalSectionSubtitle: 'Click any document below to view its full content.',
  backToSettingsButton: 'Back to Settings',
  legalPrivacyTitle: 'Privacy Policy',
  legalTermsTitle: 'Terms of Use & License (EULA)',
  legalKvkkGdprTitle: 'GDPR & Data Protection Notice',
  legalOpenSourceTitle: 'Open Source & Third-Party Notices',
  legalAccessibilityTitle: 'Accessibility & Support Statement',
  legalLastUpdated: 'Last updated: November 22, 2026 · © 2026 Vellium Teknoloji Anonim Şirketi (vellium.dev)',

  offlineBannerText: 'Working offline - your data is safely stored on your device',
  undoButton: 'Undo',
  todoMovedToTrashToast: 'Task moved to trash',
  categoryMovedToTrashToast: 'Category moved to trash',
  backupRestoredToast: 'Backup restored successfully.',

  windowControlsLabel: 'Window controls',
  windowMinimize: 'Minimize',
  windowMaximize: 'Maximize',
  windowRestore: 'Restore down',
  windowClose: 'Close application',
  windowMinimizedToast: 'Window minimized to background.',
  windowFullscreenBlockedToast: 'Fullscreen mode was blocked by the browser (press F11).',
  windowCloseTabToast: 'Use Ctrl+W or the browser tab close button to close this tab.',

  selectColorLabel: 'Select color',
  customColorTitle: 'Choose custom color',
  customColorHexLabel: 'Custom color code (HEX)',

  colorObsidian: 'Obsidian',
  colorSlate: 'Slate',
  colorNavy: 'Navy',
  colorBlue: 'Blue',
  colorCyan: 'Cyan',
  colorIndigo: 'Indigo',
  colorPurple: 'Purple',
  colorPink: 'Pink',
  colorRed: 'Red',
  colorOrange: 'Orange',
  colorYellow: 'Amber',
  colorPureYellow: 'Yellow',
  colorEmerald: 'Emerald',
  colorGrass: 'Green',
  colorLime: 'Lime',
  colorWhite: 'White',

  importSizeExceededError: 'Selected backup file exceeds the 5 MB limit.',
  importInvalidBackupError: 'Selected file is not a valid Agendamea backup.',
  importRestoreFailedError: 'Failed to restore backup.',
  operationFailedToast: 'Operation could not be completed. Please try again.',
  loadFailedError: 'Failed to load data.',

  viewList: 'List',
  viewKanban: 'Kanban',
  viewCalendar: 'Calendar',
  viewMatrix: 'Matrix',
  kanbanGroupByPriority: 'By Priority',
  kanbanGroupByStatus: 'By Status',
  matrixQ1Title: 'I · Urgent & Important (Today)',
  matrixQ2Title: 'II · Important & Scheduled',
  matrixQ3Title: 'III · Normal & Due Today',
  matrixQ4Title: 'IV · Low Priority / Later',
  dueTimeLabel: 'Time',
  tagsLabel: 'Tags',
  addTagPlaceholder: 'Add tag (#work, #urgent)...',
  unscheduledTasksTitle: 'Undated Tasks',
  onedriveSectionTitle: 'Cloud Folder Sync',
  onedriveSectionDesc: 'Sync and back up your tasks directly to OneDrive, Google Drive, iCloud Drive, Dropbox, or any local folder with zero server cost.',
  onedriveConnectButton: 'Connect Cloud',
  onedriveDisconnectButton: 'Disconnect',
  onedriveSyncNowButton: 'Sync Now',
  onedriveRestoreButton: 'Restore Cloud',
  onedriveAutoSyncTitle: 'Auto-Sync Changes to Cloud',
  onedriveConnectedBadge: 'Cloud Connected',
  onedriveLastSyncedPrefix: 'Last synced',
  onedriveSyncedToast: 'Cloud sync completed.',
  onedriveOpenFolderButton: 'Open Folder',
  onedriveBackupDetectedTitle: 'Cloud Backup Detected',
  onedriveBackupDetectedDesc:
    'An existing Agendamea backup was found in your cloud sync folder. Would you like to restore your previous tasks or start fresh?',
  onedriveStartFreshButton: 'Start Fresh',
  welcomeReplayButton: 'Welcome Guide',
  welcomeSkipButton: 'Skip',
  welcomeBackButton: 'Back',
  welcomeNextButton: 'Next',
  welcomeStartButton: 'Start Planning',
  welcomeOpenSettingsButton: 'Cloud Settings',
  welcomeStep1Title: 'Welcome to Agendamea',
  welcomeStep1Desc:
    'Your fast, offline-first daily planner that saves every change instantly on your device. Take a quick tour of the core features below.',
  welcomeStep2Title: 'Plan Your Day Across 4 Views',
  welcomeStep2Desc:
    'Switch effortlessly between List, Kanban Board, Calendar Planner, and Eisenhower Matrix with smooth drag-and-drop organization.',
  welcomeStep3Title: 'Smart Details & Keyboard Shortcuts',
  welcomeStep3Desc:
    'Organize tasks with date ranges, due times, subtasks, auto-saving notes, and #tags, and move faster with built-in keyboard shortcuts.',
  welcomeStep4Title: 'Your Data Stays Private & Protected',
  welcomeStep4Desc:
    'Everything stays locally on your own computer. Connect your own cloud folder anytime for free automatic 15-day backups.',
  welcomeCardListDesc: 'Fast daily flow & smart filters',
  welcomeCardKanbanDesc: 'Columns by priority or status',
  welcomeCardCalendarDesc: 'Timed monthly grid & drag-to-schedule',
  welcomeCardMatrixDesc: '4-quadrant urgent-important grid',
  welcomePrivacyLocalTitle: 'Stored Locally & Saved Instantly',
  welcomePrivacyLocalDesc: 'No account or internet needed; data never leaves your PC.',
  welcomePrivacyCloudTitle: 'Free Cloud Folder Backup',
  welcomePrivacyCloudDesc: 'Automatic 15-day backups via OneDrive, Google Drive, iCloud, or Dropbox.',
  welcomePrivacyUndoTitle: 'Trash Bin & 12-Second Undo',
  welcomePrivacyUndoDesc: 'Recover accidentally deleted tasks or categories in one click.',
  customThemeButton: 'Custom Color',
  customThemeHexTitle: 'Custom Theme Color (HEX)',
  customThemeHexHint: 'Enter any HEX color code or choose one from the picker.',
  appIconSectionTitle: 'App Icon',
  appIconSectionDesc: 'Synchronizes the window, taskbar, system tray, and Desktop / Start Menu shortcut icons live.',
  appIconMatchTheme: 'Match Theme',
  appIconDarkMono: 'Dark Monochrome',
  appIconLightMono: 'Light Monochrome',
  appIconCustom: 'Custom Icon',
  accessibilitySectionTitle: 'Accessibility',
  zoomLevelTitle: 'Zoom Level',
  zoomLevelDesc: 'Scale text and interface elements for comfortable reading.',
  zoomResetButton: 'Reset',
  highContrastTitle: 'High Contrast Mode',
  highContrastDesc: 'Strengthens borders, text contrast, and keyboard focus rings.',
  reducedMotionTitle: 'Reduced Motion',
  reducedMotionDesc: 'Minimizes UI transitions and animations for visual comfort.',
  closeBehaviorSectionTitle: 'Close & System Tray',
  closeBehaviorDesc: 'Choose what happens when you click the window close button.',
  closeBehaviorAsk: 'Always Ask',
  closeBehaviorTray: 'System Tray',
  closeBehaviorQuit: 'Quit Completely',
  closeModalTitle: 'Close Agendamea?',
  closeModalDesc: 'Choose what happens when you close the window.',
  closeActionTrayTitle: 'Minimize to System Tray',
  closeActionTrayDesc: 'Stays quietly in the background; click tray icon to open.',
  closeActionQuitTitle: 'Quit Completely',
  closeActionQuitDesc: 'Exits the window and background process completely.',
  closeRememberChoiceLabel: 'Remember my choice (changeable in Settings)',
  trayOpenApp: 'Open Agendamea',
  launchAtStartupTitle: 'Launch at Windows Startup (Start in Tray)',
  launchAtStartupDesc: 'Starts Agendamea quietly in the system tray when Windows signs in.',
  globalQuickAddTitle: 'Global Quick Task Shortcut (Ctrl+Alt+N)',
  globalQuickAddDesc: 'Press Ctrl+Alt+N from any application to bring Agendamea forward and focus the new task input.',
  cloudPickFolderButton: 'Choose Folder',
  cloudCustomFolderHint: 'Select OneDrive, Google Drive, Dropbox, or any local folder for automatic backups.',
  copyDiagnosticsButton: 'Copy System Info',
  diagnosticsCopiedToast: 'System diagnostic info copied to clipboard.',
  updateReadyToInstallLabel: 'Update downloaded and ready to install. It installs silently on restart.',
  restartAndUpdateButton: 'Restart & Update',
  settingsBackToTasks: 'Back to Tasks',
  settingsNavGroupPersonalization: 'Personalization',
  settingsNavGroupWorkspace: 'Workspace',
  settingsNavGroupSystem: 'System & About',
  settingsTabAppearance: 'Appearance & Theme',
  settingsTabGeneral: 'General & Language',
  settingsTabDocs: 'Documentation',
  settingsTabAbout: 'Updates & Legal',
  welcomeLanguageDesc: 'Choose the language you would like to use in Agendamea.',
  welcomeBenefitOffline: 'Works offline',
  welcomeBenefitInstant: 'Instant auto-save',
  welcomeBenefitPrivate: 'Private & no account needed',
  cloudSyncSectionTitle: 'Cloud Folder Sync (Free)',
  cloudSyncSectionDesc:
    'Back up and sync your tasks automatically using OneDrive, Google Drive, iCloud Drive, Dropbox, or any local folder - zero servers and zero cost.',
  cloudSyncProvidersTitle: 'Cloud Providers (One-Click Connect)',
  cloudDetectedBadge: 'Detected',
  cloudNotInstalledHint: 'Connect via folder picker',
  trashSearchPlaceholder: 'Search deleted tasks or categories...',
  trashFilterAll: 'All',
  trashFilterTodos: 'Tasks',
  trashFilterCategories: 'Categories',
  trashSortNewest: 'Newest Deleted',
  trashSortOldest: 'Oldest Deleted',
  trashSortAZ: 'Name (A-Z)',
  trashSortZA: 'Name (Z-A)',
  trashDateFrom: 'From',
  trashDateTo: 'To',
  trashNoMatchesTitle: 'No deleted items match the current filter',
  docsSubtitle: 'Short terminal commands (CLI), AI MCP server, webhooks, and keyboard shortcuts.',
  docsCliTitle: 'Terminal & CLI Commands (ag)',
  docsCliDesc: 'Manage tasks from your terminal with short commands whether Agendamea is open or closed (offline SQLite).',
  docsMcpTitle: 'MCP Server (AI Assistant Integration)',
  docsMcpDesc: 'Paste this JSON configuration into Claude Desktop, Cursor, Antigravity, or VS Code (no global Node.js required).',
  docsCopyButton: 'Copy',
  docsCopiedLabel: 'Copied',
  docsCmdListDesc: 'List active tasks numbered 1, 2, 3 (ag today, ag imp)',
  docsCmdAddDesc: 'Add a task without quotes (@today, @tomorrow, ! high, * important, #tag)',
  docsCmdDoneDesc: 'Complete by number (1) or title keyword (ag ok deck)',
  docsCmdDelDesc: 'Move a task to Trash by number or keyword',
  docsCmdSearchDesc: 'Instant search across titles, notes, and #tags',
  docsCmdUndoDesc: 'Restore the last task moved to Trash in one command',
  docsCmdStatusDesc: 'Show live task, category, and connection summary',
  docsCmdAddExample: 'ag + Prepare deck @today ! #work',
  docsCmdSearchExample: 'ag find invoice',
  docsCmdUndoExample: 'ag undo',
  docsCliInstallButton: 'Install CLI (ag)',
  docsCliInstalledBadge: 'Ready in Terminal (ag)',
  docsCliTryTerminalButton: 'Try in Terminal',
  docsCliInstallHint: 'Installs ag, agenda, and agendamea to your user PATH. Open a new terminal window or click "Try in Terminal" to test immediately.',
  docsCliAllCommandsToggle: 'All Headless Commands (Details, Subtasks, Categories, Trash, Matrix, Cloud, Config)',
  docsCliAllCommandsHint: 'Provides 100% full control over Agendamea without ever opening the desktop GUI (ag help all).',
  docsCmdShowExample: 'ag show 1',
  docsCmdShowDesc: 'Inspect full task details including notes, subtasks, schedule, and #tags',
  docsCmdEditExample: 'ag edit 1 --time 15:00 --note "Details"',
  docsCmdEditDesc: 'Update title, notes, date range, time, priority, category, tags, or order (ag move 1 2)',
  docsCmdSubExample: 'ag sub 1 + Review design',
  docsCmdSubDesc: 'Add, toggle (ok), rename (edit), or delete (rm) subtasks for any task',
  docsCmdCatExample: 'ag cat + Work #7c3aed',
  docsCmdCatDesc: 'Create, edit, reorder (move), or soft-delete (rm) categories',
  docsCmdTrashExample: 'ag trash',
  docsCmdTrashDesc: 'Filter Trash, permanently delete items (ag trash delete 1), or empty (ag trash empty --yes)',
  docsCmdMatrixExample: 'ag matrix',
  docsCmdMatrixDesc: 'Display the 4-quadrant Eisenhower Matrix right in your terminal',
  docsCmdBackupExample: 'ag export backup.json',
  docsCmdBackupDesc: 'JSON backup/restore (ag import), cloud sync (ag sync pull), and clean reset (ag reset --yes)',
  docsCmdConfigExample: 'ag config themeMode dark',
  docsCmdConfigDesc: 'Inspect or change any preference including theme, language, cloud folder, and webhooks',
  docsCmdServeExample: 'ag serve start',
  docsCmdServeDesc: 'Start the headless API and Incoming Webhook daemon without opening the GUI (ag hook logs)',
  docsWebhookTitle: 'Webhooks (Automation & Alerts)',
  docsWebhookDesc: 'Send instant JSON events to Discord, Slack, n8n, Zapier, or your own server when tasks are created, completed, or deleted.',
  docsWebhookUrlPlaceholder: 'https://discord.com/api/webhooks/... or custom URL',
  docsWebhookSecretPlaceholder: 'Optional secret key (X-Agendamea-Signature)',
  docsWebhookSaveButton: 'Save',
  docsWebhookTestButton: 'Send Test',
  docsWebhookIncomingTitle: 'Incoming Webhook (Create Tasks Externally)',
  docsWebhookSavedToast: 'Webhook settings saved.',
  docsWebhookTestOk: 'Connection verified',
  taskDateRangeFilterButton: 'Date Range',
  resetDataSectionTitle: 'Reset All Data (Clean Start)',
  resetDataSectionDesc: 'Permanently erase all tasks, subtasks, categories, and Trash items for a clean fresh start.',
  resetDataButton: 'Reset Data',
  resetDataConfirmWarning: 'All your tasks, categories, and Trash items will be permanently erased. Downloading a JSON backup first is recommended.',
  resetDataIncludeSettingsLabel: 'Also reset app preferences to defaults (theme, icon, cloud, webhook)',
  resetDataConfirmButton: 'Yes, Reset Everything',
  resetDataDoneToast: 'All data cleared. Clean start ready.',
};

export const THEME_COLOR_DICT_KEYS: Record<string, keyof UiDictionary> = {
  obsidian: 'colorObsidian',
  slate: 'colorSlate',
  navy: 'colorNavy',
  blue: 'colorBlue',
  cyan: 'colorCyan',
  indigo: 'colorIndigo',
  purple: 'colorPurple',
  pink: 'colorPink',
  red: 'colorRed',
  orange: 'colorOrange',
  yellow: 'colorYellow',
  emerald: 'colorEmerald',
  grass: 'colorGrass',
  lime: 'colorLime',
};

export const CATEGORY_HEX_DICT_KEYS: Record<string, keyof UiDictionary> = {
  '#dc2626': 'colorRed',
  '#2563eb': 'colorBlue',
  '#16a34a': 'colorGrass',
  '#eab308': 'colorPureYellow',
  '#ea580c': 'colorOrange',
  '#7c3aed': 'colorPurple',
  '#db2777': 'colorPink',
  '#ffffff': 'colorWhite',
};

export function resolveThemeColorName(
  themeId: string,
  fallbackName: string,
  dict: UiDictionary,
): string {
  const key = THEME_COLOR_DICT_KEYS[themeId];
  return key ? dict[key] : fallbackName;
}

export function resolveCategoryColorName(
  hex: string,
  fallbackName: string,
  dict: UiDictionary,
): string {
  const key = CATEGORY_HEX_DICT_KEYS[hex.toLowerCase()];
  return key ? dict[key] : fallbackName;
}

export function localizeErrorMessage(
  err: unknown,
  fallback: string,
  lang: LanguageCode,
  dict: UiDictionary,
): string {
  if (!(err instanceof Error) || !err.message) {
    return fallback;
  }
  const msg = err.message.trim().toLowerCase();
  // Catch raw browser/V8 English technical errors across all languages (including Turkish)
  if (
    /^(failed to fetch|networkerror|load failed|unexpected token|unexpected end of json|http \d{3})/i.test(
      msg,
    )
  ) {
    return fallback;
  }
  if (lang === 'tr') {
    return err.message;
  }
  if (msg.includes('5 mb')) {
    return dict.importSizeExceededError;
  }
  if (msg.includes('yedek') || msg.includes('json')) {
    return dict.importInvalidBackupError;
  }
  // Never leak Turkish server/client error strings into non-Turkish locales
  return fallback;
}

export type LegalDocId = 'privacy' | 'terms' | 'gdpr' | 'opensource' | 'accessibility';

export interface LegalDocSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocumentContent {
  id: LegalDocId;
  title: string;
  subtitle: string;
  sections: LegalDocSection[];
}

export const TR_LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocumentContent> = {
  privacy: {
    id: 'privacy',
    title: TR_DICTIONARY.legalPrivacyTitle,
    subtitle: TR_DICTIONARY.legalLastUpdated,
    sections: [
      {
        heading: '1. Yerel Öncelikli (Offline-First) Veri Mimarisi',
        paragraphs: [
          'Agendamea, Vellium (vellium.dev) tarafından gizlilik öncelikli olarak geliştirilmiştir. Oluşturduğunuz tüm görevler, başlangıç ve bitiş tarihleri, alt görevler, notlar, kategoriler ve tema tercihleri yalnızca kendi bilgisayarınızda (%APPDATA%\\Agendamea dizininde) yerel olarak saklanır.',
          'Hiçbir görev veriniz uzak bir bulut sunucusuna gönderilmez, üçüncü taraflarla paylaşılmaz veya reklam/profilleme amacıyla işlenmez.',
        ],
      },
      {
        heading: '2. Telemetri, İzleme ve Analitik Yokluğu',
        paragraphs: [
          'Agendamea içinde hiçbir kullanıcı izleme kodu, analitik izleyicisi, reklam kimliği veya davranışsal telemetri bulunmaz. Uygulama internet bağlantısı olmadan tam kapasiteyle çalışır.',
        ],
      },
      {
        heading: '3. Güncelleme Politikası, Bulut Klasörleri ve Veri Taşınabilirliği',
        paragraphs: [
          'Microsoft Store üzerinden yüklenen sürümlerde tüm güncellemeler yalnızca Microsoft Store tarafından yönetilir ve uygulama harici güncelleme uç noktalarına bağlanmaz (Microsoft Store Politikası 10.2.7). GitHub üzerinden kurulan masaüstü sürümlerde güncelleme kontrolü yalnızca kişisel veri içermeyen standart bir HTTPS sorgusu ile GitHub Releases üzerinden SHA-512 doğrulamalı güncelleme denetimi yapar.',
          'İsteğe bağlı Bulut Klasör Eşitleme (OneDrive, Google Drive, iCloud Drive, Dropbox) kullanıldığında Agendamea hiçbir bulut hesap şifresi veya OAuth erişim anahtarı toplamaz; yalnızca kullanıcının seçtiği yerel klasöre JSON yedeği yazar. Verilerinizi dilediğiniz an dışa aktarabilir veya kaldırıcı üzerinden kalıcı olarak silebilirsiniz.',
          'Resmi Gizlilik Politikası: https://vellium.dev/tr/yasal/gizlilik-politikasi · Veri ve Gizlilik İletişim: privacy@vellium.dev',
        ],
      },
    ],
  },
  terms: {
    id: 'terms',
    title: TR_DICTIONARY.legalTermsTitle,
    subtitle: TR_DICTIONARY.legalLastUpdated,
    sections: [
      {
        heading: '1. Lisans Kapsamı ve Kullanım Hakkı',
        paragraphs: [
          'Agendamea, Vellium Teknoloji Anonim Şirketi (Microsoft Store ID: 9MT5X1NGZJXZ) tarafından MIT Açık Kaynak Lisansı ve Microsoft Store Standart Uygulama Lisans Koşulları çerçevesinde sunulmaktadır. Uygulamayı kişisel ve ticari görev yönetimi amacıyla cihazlarınızda ücretsiz olarak kurabilir ve kullanabilirsiniz.',
        ],
      },
      {
        heading: '2. Kullanıcı Sorumluluğu ve Yedekleme',
        paragraphs: [
          'Veriler tamamen kullanıcının kendi cihazında yerel olarak tutulduğundan, cihaz arızası veya işletim sistemi sıfırlaması gibi durumlara karşı Ayarlar > Veri ve Yedekleme bölümünden düzenli JSON yedeği almak veya isteğe bağlı yerel bulut klasörü (OneDrive, Google Drive, iCloud Drive, Dropbox) eşitlemesini etkinleştirmek kullanıcının sorumluluğundadır.',
        ],
      },
      {
        heading: '3. Garanti Reddi ve Fikri Mülkiyet',
        paragraphs: [
          'Yazılım, yürürlükteki yasaların izin verdiği azami ölçüde herhangi bir garanti olmaksızın "olduğu gibi" (AS-IS) sunulmaktadır. Agendamea adı, amblemi ve Vellium markası Vellium Teknoloji Anonim Şirketi (vellium.dev) bünyesine aittir.',
          'Hizmet Koşulları: https://vellium.dev/tr/yasal/hizmet-kosullari · Şirket Bilgileri: https://vellium.dev/tr/yasal/sirket-bilgileri · Hukuki İletişim: legal@vellium.dev',
        ],
      },
    ],
  },
  gdpr: {
    id: 'gdpr',
    title: TR_DICTIONARY.legalKvkkGdprTitle,
    subtitle: TR_DICTIONARY.legalLastUpdated,
    sections: [
      {
        heading: '1. Veri Sorumlusu ve İşleme Amacı',
        paragraphs: [
          '6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve Avrupa Birliği Genel Veri Koruma Tüzüğü (GDPR) kapsamında Vellium Teknoloji Anonim Şirketi, kullanıcı cihazında tutulan görev verilerine uzaktan erişmez ve merkezi bir veri tabanında kişisel veri toplamaz.',
        ],
      },
      {
        heading: '2. Yerel Depolama ve Güvenlik',
        paragraphs: [
          'Tüm uygulama ayarları ve görev kayıtları yalnızca cihazınızın işletim sistemi kullanıcı profili altında saklanır ve yerel ağ dışından erişime kapalıdır (127.0.0.1 geri döngü arayüzü).',
        ],
      },
      {
        heading: '3. İlgili Kişi Hakları (Erişim, Düzeltme, Silme ve Taşıma)',
        paragraphs: [
          'Tüm veriler cihazınızda olduğundan; verilerinize anında erişme, düzenleme, Çöp Kutusu üzerinden kalıcı olarak silme ve dışa aktarma haklarınızı doğrudan uygulama arayüzünden kullanabilirsiniz.',
          'KVKK Aydınlatma Metni: https://vellium.dev/tr/yasal/kvkk-aydinlatma-metni · Başvuru: privacy@vellium.dev',
        ],
      },
    ],
  },
  opensource: {
    id: 'opensource',
    title: TR_DICTIONARY.legalOpenSourceTitle,
    subtitle: TR_DICTIONARY.legalLastUpdated,
    sections: [
      {
        heading: '1. Agendamea Lisansı (MIT)',
        paragraphs: [
          '© 2026 Vellium Teknoloji Anonim Şirketi (https://vellium.dev). Bu yazılım MIT Lisansı altında lisanslanmıştır.',
        ],
      },
      {
        heading: '2. Üçüncü Taraf Açık Kaynak Bileşenleri',
        paragraphs: [
          '• Electron (MIT) · Electron Updater (MIT) · React & React DOM (MIT) · Better-SQLite3 & SQLite (MIT) · Express (MIT) · Tailwind CSS (MIT) · Lucide React (ISC) · Vite & Vite Plugin PWA (MIT) · esbuild (MIT)',
        ],
      },
    ],
  },
  accessibility: {
    id: 'accessibility',
    title: TR_DICTIONARY.legalAccessibilityTitle,
    subtitle: TR_DICTIONARY.legalLastUpdated,
    sections: [
      {
        heading: '1. Klavye, Yakınlaştırma ve Ekran Okuyucu Erişilebilirliği',
        paragraphs: [
          'Agendamea, WCAG 2.1 AA kontrast hedefleri, Yüksek Kontrast Modu, Azaltılmış Hareket, %80-%150 Yakınlaştırma (Ctrl + / - / 0) ve tam klavye navigasyonu gözetilerek tasarlanmıştır: N (yeni görev), Ctrl+Alt+N (global hızlı görev), / veya Ctrl+K (arama), Alt+Yukarı/Aşağı (sıralama) ve Esc (kapatma).',
        ],
      },
      {
        heading: '2. Çoklu Dil ve Sağdan Sola (RTL) Yazım Desteği',
        paragraphs: [
          'Uygulama 73 dili ve Arapça, Farsça, İbranice, Urduca gibi sağdan sola (RTL) yazılan diller için otomatik yönlendirmeyi destekler.',
        ],
      },
      {
        heading: '3. Microsoft Store Sertifikasyon ve Destek İletişimi',
        paragraphs: [
          'Yayıncı: Vellium Teknoloji Anonim Şirketi · Store ID: 9MT5X1NGZJXZ · Web Sitesi: https://vellium.dev · Destek Politikası: https://vellium.dev/tr/yasal/destek-politikasi · Güvenlik: https://vellium.dev/tr/yasal/guvenlik-acigi-bildirimi',
          'E-posta: support@vellium.dev · contact@vellium.dev · privacy@vellium.dev · legal@vellium.dev · security@vellium.dev · billing@vellium.dev',
        ],
      },
    ],
  },
};

export const EN_LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocumentContent> = {
  privacy: {
    id: 'privacy',
    title: EN_DICTIONARY.legalPrivacyTitle,
    subtitle: 'Last updated: November 22, 2026 · © 2026 Vellium Teknoloji Anonim Şirketi (vellium.dev)',
    sections: [
      {
        heading: '1. Local-First (Offline-First) Data Architecture',
        paragraphs: [
          'Agendamea is built by Vellium Teknoloji Anonim Şirketi (vellium.dev) with a strict local-first privacy architecture. All tasks, optional start and due dates, subtasks, notes, categories, and theme settings you create are stored exclusively on your own device (%APPDATA%\\Agendamea).',
          'None of your task data is ever transmitted to Vellium servers, sold to third parties, or used for advertising or profiling.',
        ],
      },
      {
        heading: '2. Zero Telemetry, Tracking, or Analytics',
        paragraphs: [
          'Agendamea contains no analytics trackers, advertising identifiers, or behavioral telemetry. The application operates with full capability completely offline.',
        ],
      },
      {
        heading: '3. Update Policy, Optional Cloud Folders & Data Portability',
        paragraphs: [
          'For Microsoft Store installations, updates are managed exclusively by Microsoft Store and the app does not query external update endpoints (Microsoft Store Policy 10.2.7). Direct GitHub desktop builds perform read-only HTTPS checks against GitHub Releases with SHA-512 integrity verification.',
          'When optional Cloud Folder Sync (OneDrive, Google Drive, iCloud Drive, Dropbox) is enabled, Agendamea never accesses cloud credentials or OAuth tokens - it only writes local JSON backups into the folder you choose. You can export, restore, or permanently delete all local data at any time.',
          'Official Privacy Policy: https://vellium.dev/en/legal/privacy · Privacy Inquiries: privacy@vellium.dev',
        ],
      },
    ],
  },
  terms: {
    id: 'terms',
    title: EN_DICTIONARY.legalTermsTitle,
    subtitle: 'Last updated: November 22, 2026 · © 2026 Vellium Teknoloji Anonim Şirketi (vellium.dev)',
    sections: [
      {
        heading: '1. License Grant & Permitted Use',
        paragraphs: [
          'Agendamea is provided by Vellium Teknoloji Anonim Şirketi (Microsoft Store ID: 9MT5X1NGZJXZ) under the MIT License and the Microsoft Store Standard Application License Terms for personal and commercial task management.',
        ],
      },
      {
        heading: '2. User Data & Backup Responsibility',
        paragraphs: [
          'Because all records reside locally on your device by default, you are responsible for maintaining periodic backups using JSON export or optional user-controlled cloud folder sync (OneDrive, Google Drive, iCloud Drive, Dropbox) in Settings > Data & Backup.',
        ],
      },
      {
        heading: '3. Disclaimer of Warranties & Intellectual Property',
        paragraphs: [
          'The software is provided "AS IS" without warranty of any kind. The Agendamea name, emblem, and Vellium brand identity are property of Vellium Teknoloji Anonim Şirketi (vellium.dev).',
          'Terms of Service: https://vellium.dev/en/legal/terms · Company Information: https://vellium.dev/en/legal/company-information · Legal Contact: legal@vellium.dev',
        ],
      },
    ],
  },
  gdpr: {
    id: 'gdpr',
    title: EN_DICTIONARY.legalKvkkGdprTitle,
    subtitle: 'Last updated: November 22, 2026 · © 2026 Vellium Teknoloji Anonim Şirketi (vellium.dev)',
    sections: [
      {
        heading: '1. Data Controller & Local Processing',
        paragraphs: [
          'Under GDPR, UK GDPR, and KVKK, Vellium Teknoloji Anonim Şirketi does not collect, host, or remotely process personal user data on central servers.',
        ],
      },
      {
        heading: '2. Local Storage & Loopback Security',
        paragraphs: [
          'All application preferences and task records are stored strictly within your operating system user profile and served only over the local loopback interface (127.0.0.1).',
        ],
      },
      {
        heading: '3. Exercise of Data Subject Rights',
        paragraphs: [
          'Because all data is stored directly on your device, you have immediate self-service control over access, rectification, permanent erasure, and data portability directly within the application.',
          'KVKK & Data Protection Notice: https://vellium.dev/en/legal/kvkk-notice · Data Requests: privacy@vellium.dev',
        ],
      },
    ],
  },
  opensource: {
    id: 'opensource',
    title: EN_DICTIONARY.legalOpenSourceTitle,
    subtitle: 'Last updated: November 22, 2026 · © 2026 Vellium Teknoloji Anonim Şirketi (vellium.dev)',
    sections: [
      {
        heading: '1. Agendamea License (MIT)',
        paragraphs: [
          '© 2026 Vellium Teknoloji Anonim Şirketi (https://vellium.dev). Released under the MIT License.',
        ],
      },
      {
        heading: '2. Third-Party Open Source Attributions',
        paragraphs: [
          '• Electron (MIT) · Electron Updater (MIT) · React & React DOM (MIT) · Better-SQLite3 & SQLite (MIT) · Express (MIT) · Tailwind CSS (MIT) · Lucide React (ISC) · Vite & Vite Plugin PWA (MIT) · esbuild (MIT)',
        ],
      },
    ],
  },
  accessibility: {
    id: 'accessibility',
    title: EN_DICTIONARY.legalAccessibilityTitle,
    subtitle: 'Last updated: November 22, 2026 · © 2026 Vellium Teknoloji Anonim Şirketi (vellium.dev)',
    sections: [
      {
        heading: '1. Keyboard, Zoom & Screen Reader Accessibility',
        paragraphs: [
          'Agendamea is engineered for WCAG 2.1 AA contrast compliance, High Contrast Mode, Reduced Motion, 80%-150% Zoom (Ctrl + / - / 0), and complete keyboard operation: N (new task), Ctrl+Alt+N (global quick task), / or Ctrl+K (search), Alt+Up/Down (reorder), and Esc (close).',
        ],
      },
      {
        heading: '2. 73-Language & Right-to-Left (RTL) Support',
        paragraphs: [
          'The interface supports 73 world languages with automatic document direction switching for right-to-left (RTL) scripts including Arabic, Persian, Hebrew, and Urdu.',
        ],
      },
      {
        heading: '3. Microsoft Store Compliance & Publisher Support',
        paragraphs: [
          'Publisher: Vellium Teknoloji Anonim Şirketi · Store ID: 9MT5X1NGZJXZ · Website: https://vellium.dev · Support Policy: https://vellium.dev/en/legal/support · Security Disclosure: https://vellium.dev/en/legal/security-disclosure',
          'Official Emails: support@vellium.dev · contact@vellium.dev · privacy@vellium.dev · legal@vellium.dev · security@vellium.dev · billing@vellium.dev',
        ],
      },
    ],
  },
};
