import type { LanguageCode } from './languages';
import { LOCALE_EXTENSIONS } from './localeExtensions';
import type {
  LegalDocId,
  LegalDocumentContent,
  UiDictionary,
} from './translations';

export interface CompactLocaleSeed {
  /**
   * 40 core navigation, filter, date & action terms:
   * [0:appTitleSuffix, 1:allTasks, 2:today, 3:tomorrow, 4:yesterday, 5:important, 6:completed, 7:active,
   *  8:tasks, 9:subtasks, 10:categories, 11:uncategorized, 12:noCategoriesYet, 13:newCategory,
   *  14:search, 15:clear, 16:settings, 17:sponsor, 18:menu, 19:open, 20:close, 21:sidebar,
   *  22:all, 23:customOrder, 24:priority, 25:date, 26:newest, 27:retry,
   *  28:add, 29:apply, 30:cancel, 31:moveToTrash, 32:startDate, 33:dueDate,
   *  34:overdue, 35:instantSave, 36:autoSaved, 37:created, 38:deleted, 39:undo]
   */
  w: readonly [
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
  ];

  /**
   * 36 priority, detail panel, empty state & settings labels:
   * [0:priorityLow, 1:priorityNormal, 2:priorityHigh, 3:notes, 4:completeVerb, 5:pin, 6:unpin, 7:optionalDateHint,
   *  8:emptySearchTitle, 9:emptySearchDesc, 10:emptyCompletedTitle, 11:emptyCompletedDesc,
   *  12:emptyListTitle, 13:emptyListDesc, 14:addFirstTask, 15:settingsSubtitle,
   *  16:generalAndTheme, 17:trash, 18:languageTitle, 19:appearance, 20:light, 21:dark,
   *  22:colorTheme, 23:themesUnit, 24:dataAndBackup, 25:localRecords, 26:dragReorder,
   *  27:locked, 28:unlocked, 29:enabled, 30:disabled, 31:backupRestore, 32:backupRestoreDesc,
   *  33:restore, 34:download, 35:move]
   */
  p: readonly [
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
    string, string, string, string,
  ];

  /**
   * 32 shortcuts, trash, updates, legal & window controls:
   * [0:keyboardShortcuts, 1:emptyTrash, 2:deletePermanently, 3:trashIntroDesc,
   *  4:trashEmptyTitle, 5:trashEmptyDesc, 6:confirmMoveCategoryTrash,
   *  7:updatesTitle, 8:currentVersion, 9:checkForUpdates, 10:checkingUpdates,
   *  11:upToDate, 12:updateAvailable, 13:downloadAndUpdate, 14:downloadingUpdate,
   *  15:updateErrorOffline, 16:autoUpdateTitle, 17:autoUpdateDesc, 18:lastChecked, 19:releaseNotes,
   *  20:legalSectionTitle, 21:legalSectionSubtitle, 22:backToSettings,
   *  23:legalPrivacy, 24:legalTerms, 25:legalGdpr, 26:legalOpenSource, 27:legalAccessibility,
   *  28:offlineBanner, 29:windowControls, 30:minimize, 31:maximize]
   */
  u: readonly [
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
  ];

  /**
   * 14 remaining window controls, color picker, toasts, errors & legal bodies:
   * [0:restoreWindow, 1:closeApp, 2:selectColor, 3:customColor,
   *  4:todoMovedToTrash, 5:categoryMovedToTrash, 6:backupRestored,
   *  7:importInvalidBackup, 8:operationFailed, 9:loadFailed,
   *  10:legalPrivacyBody, 11:legalTermsBody, 12:legalGdprBody, 13:legalAccessBody]
   */
  e: readonly [
    string, string, string, string, string, string, string,
    string, string, string, string, string, string, string,
  ];

  /**
   * 16 localized color names:
   * [0:obsidian, 1:slate, 2:navy, 3:blue, 4:cyan, 5:indigo, 6:purple, 7:pink,
   *  8:red, 9:orange, 10:amber, 11:yellow, 12:emerald, 13:green, 14:lime, 15:white]
   */
  c: readonly [
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
  ];
}

export function compileSeedToDictionary(
  seed: CompactLocaleSeed,
  lang: LanguageCode = 'en',
): UiDictionary {
  const { w, p, u, e, c } = seed;
  const ext = LOCALE_EXTENSIONS[lang] ?? LOCALE_EXTENSIONS.en;
  const [viewList, viewKanban, viewCalendar, viewMatrix, dueTimeLabel, tagsLabel, cloudSync] = ext;
  const [
    appTitleSuffix, allTasks, today, tomorrow, yesterday, important, completed, active,
    tasks, subtasks, categories, uncategorized, noCategoriesYet, newCategory,
    search, clear, settings, sponsor, menu, open, close, sidebar,
    all, customOrder, priority, date, newest, retry,
    add, apply, cancel, moveToTrash, startDate, dueDate,
    overdue, instantSave, autoSaved, created, deleted, undo,
  ] = w;

  const [
    priorityLow, priorityNormal, priorityHigh, notes, completeVerb, pin, unpin, optionalDateHint,
    emptySearchTitle, emptySearchDesc, emptyCompletedTitle, emptyCompletedDesc,
    emptyListTitle, emptyListDesc, addFirstTask, settingsSubtitle,
    generalAndTheme, trash, languageTitle, appearance, light, dark,
    colorTheme, themesUnit, dataAndBackup, localRecords, dragReorder,
    locked, unlocked, enabled, disabled, backupRestore, backupRestoreDesc,
    restore, download, move,
  ] = p;

  const [
    keyboardShortcuts, emptyTrash, deletePermanently, trashIntroDesc,
    trashEmptyTitle, trashEmptyDesc, confirmMoveCategoryTrash,
    updatesTitle, currentVersion, checkForUpdates, checkingUpdates,
    upToDate, updateAvailable, downloadAndUpdate, downloadingUpdate,
    updateErrorOffline, autoUpdateTitle, autoUpdateDesc, lastChecked, releaseNotes,
    legalSectionTitle, legalSectionSubtitle, backToSettings,
    legalPrivacy, legalTerms, legalGdpr, legalOpenSource, legalAccessibility,
    offlineBanner, windowControls, minimize, maximize,
  ] = u;

  const [
    restoreWindow, closeApp, selectColor, customColor,
    todoMovedToTrash, categoryMovedToTrash, backupRestored,
    importInvalidBackup, operationFailed, loadFailed,
  ] = e;

  const [
    colorObsidian, colorSlate, colorNavy, colorBlue, colorCyan, colorIndigo, colorPurple, colorPink,
    colorRed, colorOrange, colorYellow, colorPureYellow, colorEmerald, colorGrass, colorLime, colorWhite,
  ] = c;

  return {
    appTitleSuffix,

    allTasks,
    today,
    important,
    completed,
    categories,
    uncategorized,
    noCategoriesYet,
    newCategory,
    categoryNamePlaceholder: `${newCategory}...`,
    searchPlaceholder: `${search}...`,
    clearSearch: `${clear} (${search})`,
    settings,
    sponsor,
    collapseSidebar: `${sidebar} (-)` ,
    expandSidebar: `${sidebar} (+)`,
    closeMenu: `${close} (${menu})`,
    openMenu: `${open} (${menu})`,

    activeCountLabel: active.toLowerCase(),
    completedCountLabel: completed.toLowerCase(),
    filterAll: all,
    filterActive: active,
    filterCompleted: completed,
    clearCompleted: `${clear} (${completed})`,
    sortCustom: customOrder,
    sortPriority: priority,
    sortDueDate: date,
    sortNewest: newest,
    retry,

    addTaskPlaceholder: `${add} (${tasks.toLowerCase()})...`,
    addButton: add,
    addingButton: `${add}...`,
    applyButton: apply,
    cancelButton: cancel,
    deleteToTrashButton: moveToTrash,
    dateButton: date,
    startDateLabel: startDate,
    dueDateLabel: dueDate,
    optionalDateHint,
    tomorrow,
    yesterday,
    overdueSuffix: overdue,
    clearDate: clear,
    instantSaveBadge: instantSave,
    autoSavedBadge: autoSaved,
    createdPrefix: created,

    priorityLabel: priority,
    priorityLow,
    priorityNormal,
    priorityHigh,
    prioritySuffix: priority.toLowerCase(),

    subtasksTitle: subtasks,
    subtaskCountUnit: subtasks.toLowerCase(),
    addSubtaskPlaceholder: `${add} (${subtasks.toLowerCase()})...`,
    notesPlaceholder: `${notes} (${instantSave.toLowerCase()})...`,
    taskTitlePlaceholder: `${tasks}...`,
    markComplete: completeVerb,
    markCompletedDone: completed,
    pinLabel: pin,
    unpinLabel: unpin,

    emptySearchTitle,
    emptySearchDesc,
    emptyCompletedTitle,
    emptyCompletedDesc,
    emptyListTitle,
    emptyListDesc,
    addFirstTaskButton: addFirstTask,

    settingsSubtitle,
    tabGeneral: generalAndTheme,
    tabTrash: trash,
    languageSectionTitle: `${languageTitle} (73)`,
    languageSearchPlaceholder: `${search} (${languageTitle})...`,
    appearanceModeTitle: appearance,
    lightMode: light,
    darkMode: dark,
    colorThemeTitle: colorTheme,
    themesCountUnit: themesUnit,
    dataAndBackupTitle: dataAndBackup,
    localRecordsBadge: localRecords,
    dragReorderTitle: dragReorder,
    dragLockedDesc: `${locked} - ${dragReorder}`,
    dragUnlockedDesc: `${unlocked} - ${dragReorder}`,
    lockedBadge: locked,
    unlockedBadge: unlocked,
    enabledBadge: enabled,
    disabledBadge: disabled,
    backupRestoreTitle: backupRestore,
    backupRestoreDesc,
    restoreButton: restore,
    restoringButton: `${restore}...`,
    downloadBackupButton: download,
    overwriteAndRestore: `${apply} & ${restore}`,
    moveCompletedToTrashTitle: `${moveToTrash} (${completed})`,
    moveCompletedToTrashEmptyDesc: emptyCompletedTitle,
    moveButton: move,
    movingButton: `${move}...`,
    keyboardShortcutsTitle: keyboardShortcuts,
    shortcutNewTask: `${add} (${tasks.toLowerCase()})`,
    shortcutSearch: `${search} (${tasks.toLowerCase()})`,
    shortcutReorder: `${dragReorder} (${tasks.toLowerCase()})`,
    shortcutEscape: `${close} (${menu})`,

    trashIntroDesc,
    emptyTrashButton: emptyTrash,
    confirmDeleteAllPermanent: `${deletePermanently} (${all})`,
    deletingButton: `${deletePermanently}...`,
    trashEmptyTitle,
    trashEmptyDesc,
    tasksTitle: tasks,
    deletedPrefix: deleted,
    restoreItemButton: restore,
    permanentDeleteTitle: deletePermanently,
    confirmMoveCategoryTrash,

    updatesSectionTitle: updatesTitle,
    currentVersionLabel: currentVersion,
    checkForUpdatesButton: checkForUpdates,
    checkingUpdatesLabel: checkingUpdates,
    upToDateLabel: upToDate,
    updateAvailableLabel: updateAvailable,
    downloadAndInstallButton: downloadAndUpdate,
    downloadingUpdateLabel: downloadingUpdate,
    updateErrorOfflineLabel: updateErrorOffline,
    autoUpdateToggleTitle: autoUpdateTitle,
    autoUpdateToggleDesc: autoUpdateDesc,
    lastCheckedPrefix: lastChecked,
    viewReleaseNotes: releaseNotes,

    legalSectionTitle,
    legalSectionSubtitle,
    backToSettingsButton: backToSettings,
    legalPrivacyTitle: legalPrivacy,
    legalTermsTitle: legalTerms,
    legalKvkkGdprTitle: legalGdpr,
    legalOpenSourceTitle: legalOpenSource,
    legalAccessibilityTitle: legalAccessibility,
    legalLastUpdated: '© 2026 Vellium Teknoloji Anonim Şirketi (vellium.dev)',

    offlineBannerText: offlineBanner,
    undoButton: undo,
    todoMovedToTrashToast: todoMovedToTrash,
    categoryMovedToTrashToast: categoryMovedToTrash,
    backupRestoredToast: backupRestored,

    windowControlsLabel: windowControls,
    windowMinimize: minimize,
    windowMaximize: maximize,
    windowRestore: restoreWindow,
    windowClose: closeApp,
    windowMinimizedToast: `${windowControls}: ${minimize}`,
    windowFullscreenBlockedToast: `${windowControls}: ${maximize} (F11)`,
    windowCloseTabToast: `${closeApp} (Ctrl+W)`,

    selectColorLabel: selectColor,
    customColorTitle: customColor,
    customColorHexLabel: `${customColor} (HEX)`,

    colorObsidian,
    colorSlate,
    colorNavy,
    colorBlue,
    colorCyan,
    colorIndigo,
    colorPurple,
    colorPink,
    colorRed,
    colorOrange,
    colorYellow,
    colorPureYellow,
    colorEmerald,
    colorGrass,
    colorLime,
    colorWhite,

    importSizeExceededError: `${importInvalidBackup} (> 5 MB)`,
    importInvalidBackupError: importInvalidBackup,
    importRestoreFailedError: operationFailed,
    operationFailedToast: operationFailed,
    loadFailedError: loadFailed,

    viewList,
    viewKanban,
    viewCalendar,
    viewMatrix,
    kanbanGroupByPriority: `${viewKanban} · ${priority}`,
    kanbanGroupByStatus: `${viewKanban} · ${active} / ${completed}`,
    matrixQ1Title: `I · ${important} & ${today}`,
    matrixQ2Title: `II · ${important} & ${tomorrow}`,
    matrixQ3Title: `III · ${priorityNormal} & ${today}`,
    matrixQ4Title: `IV · ${priorityLow} / ${tomorrow}`,
    dueTimeLabel,
    tagsLabel,
    addTagPlaceholder: `${add} (${tagsLabel.toLowerCase()})...`,
    unscheduledTasksTitle: `${tasks} (${uncategorized.toLowerCase()} · ${date.toLowerCase()})`,
    onedriveSectionTitle: `OneDrive · ${cloudSync}`,
    onedriveSectionDesc: `OneDrive · ${cloudSync} — ${backupRestoreDesc}`,
    onedriveConnectButton: `OneDrive · ${apply}`,
    onedriveDisconnectButton: `OneDrive · ${close}`,
    onedriveSyncNowButton: `OneDrive · ${cloudSync}`,
    onedriveRestoreButton: `OneDrive · ${restore}`,
    onedriveAutoSyncTitle: `OneDrive · ${cloudSync} (${autoSaved})`,
    onedriveConnectedBadge: `OneDrive · ${enabled}`,
    onedriveLastSyncedPrefix: `OneDrive · ${lastChecked}`,
    onedriveSyncedToast: `OneDrive · ${cloudSync} (${autoSaved})`,
    onedriveOpenFolderButton: `OneDrive · ${open}`,
    onedriveBackupDetectedTitle: `OneDrive · ${cloudSync} (${backupRestore})`,
    onedriveBackupDetectedDesc: `OneDrive · ${backupRestoreDesc}`,
    onedriveStartFreshButton: addFirstTask,
  };
}

export function compileSeedToLegalDocuments(
  seed: CompactLocaleSeed,
  dict: UiDictionary,
): Record<LegalDocId, LegalDocumentContent> {
  const { p, u, e } = seed;
  const [, , , , , , , , , , legalPrivacyBody, legalTermsBody, legalGdprBody, legalAccessBody] = e;

  return {
    privacy: {
      id: 'privacy',
      title: dict.legalPrivacyTitle,
      subtitle: dict.legalLastUpdated,
      sections: [
        {
          heading: `1. ${dict.legalPrivacyTitle} - ${p[24]}`,
          paragraphs: [legalPrivacyBody],
        },
        {
          heading: `2. ${u[28]}`,
          paragraphs: [dict.settingsSubtitle],
        },
        {
          heading: `3. ${dict.updatesSectionTitle} & ${dict.backupRestoreTitle}`,
          paragraphs: [dict.autoUpdateToggleDesc, dict.backupRestoreDesc],
        },
      ],
    },
    terms: {
      id: 'terms',
      title: dict.legalTermsTitle,
      subtitle: dict.legalLastUpdated,
      sections: [
        {
          heading: `1. ${dict.legalTermsTitle}`,
          paragraphs: [legalTermsBody],
        },
        {
          heading: `2. ${dict.backupRestoreTitle}`,
          paragraphs: [dict.backupRestoreDesc],
        },
        {
          heading: '3. Vellium Teknoloji Anonim Şirketi (vellium.dev)',
          paragraphs: [
            dict.settingsSubtitle,
            'https://vellium.dev/en/legal/terms · https://vellium.dev/en/legal/company-information · legal@vellium.dev',
          ],
        },
      ],
    },
    gdpr: {
      id: 'gdpr',
      title: dict.legalKvkkGdprTitle,
      subtitle: dict.legalLastUpdated,
      sections: [
        {
          heading: `1. ${dict.legalKvkkGdprTitle}`,
          paragraphs: [legalGdprBody],
        },
        {
          heading: `2. ${dict.dataAndBackupTitle} (127.0.0.1)`,
          paragraphs: [dict.settingsSubtitle],
        },
        {
          heading: `3. ${dict.backupRestoreTitle} & ${dict.emptyTrashButton}`,
          paragraphs: [
            dict.trashIntroDesc,
            'https://vellium.dev/en/legal/privacy · https://vellium.dev/en/legal/kvkk-notice · privacy@vellium.dev',
          ],
        },
      ],
    },
    opensource: {
      id: 'opensource',
      title: dict.legalOpenSourceTitle,
      subtitle: dict.legalLastUpdated,
      sections: [
        {
          heading: '1. Agendamea - MIT',
          paragraphs: ['© 2026 Vellium Teknoloji Anonim Şirketi (https://vellium.dev) · MIT'],
        },
        {
          heading: `2. ${dict.legalOpenSourceTitle}`,
          paragraphs: [
            '• Electron (MIT) · React & React DOM (MIT) · Better-SQLite3 & SQLite (MIT) · Express (MIT) · Tailwind CSS (MIT) · Lucide React (ISC) · Vite (MIT)',
          ],
        },
      ],
    },
    accessibility: {
      id: 'accessibility',
      title: dict.legalAccessibilityTitle,
      subtitle: dict.legalLastUpdated,
      sections: [
        {
          heading: `1. ${dict.keyboardShortcutsTitle} (WCAG 2.1 AA)`,
          paragraphs: [legalAccessBody],
        },
        {
          heading: `2. ${dict.languageSectionTitle} (LTR / RTL)`,
          paragraphs: [dict.settingsSubtitle],
        },
        {
          heading: '3. Vellium Teknoloji Anonim Şirketi · Microsoft Store',
          paragraphs: [
            'https://vellium.dev · https://vellium.dev/en/legal/support · https://vellium.dev/en/legal/company-information · support@vellium.dev · contact@vellium.dev · security@vellium.dev',
          ],
        },
      ],
    },
  };
}
