; Agendamea - Vellium Windows 11 Multi-Language (73 Languages) Setup & Uninstaller Script (UTF-8 BOM)

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var /GLOBAL LangDialog
  Var /GLOBAL LangIntroLabel
  Var /GLOBAL LangCombo
  Var /GLOBAL LangHintLabel
  Var /GLOBAL SelectedAppLang
!endif

!ifdef BUILD_UNINSTALLER
  Var /GLOBAL UnDataDialog
  Var /GLOBAL UnDataInfoLabel
  Var /GLOBAL UnDataCheckbox
  Var /GLOBAL UnDataHintLabel
  Var /GLOBAL DeleteUserDataFlag
!endif

!macro customHeader
  !ifndef MUI_HEADERIMAGE_RIGHT
    !define MUI_HEADERIMAGE_RIGHT
  !endif

  !ifdef MUI_FINISHPAGE_LINK
    !undef MUI_FINISHPAGE_LINK
  !endif
  !define MUI_FINISHPAGE_LINK "vellium.dev - support@vellium.dev"

  !ifdef MUI_FINISHPAGE_LINK_LOCATION
    !undef MUI_FINISHPAGE_LINK_LOCATION
  !endif
  !define MUI_FINISHPAGE_LINK_LOCATION "https://vellium.dev"
!macroend

!ifndef BUILD_UNINSTALLER
  !macro customInit
    ; Detect Windows Display Language (fallback to English "en" / 1033 if not matched)
    StrCpy $SelectedAppLang "en"
    System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
    IntOp $1 $0 & 0x03FF
    ${If} $0 == 2052
      StrCpy $SelectedAppLang "zh-CN"
    ${ElseIf} $0 == 4100
      StrCpy $SelectedAppLang "zh-CN"
    ${ElseIf} $0 == 1028
      StrCpy $SelectedAppLang "zh-TW"
    ${ElseIf} $0 == 3076
      StrCpy $SelectedAppLang "zh-TW"
    ${ElseIf} $0 == 5124
      StrCpy $SelectedAppLang "zh-TW"
    ${ElseIf} $0 == 1046
      StrCpy $SelectedAppLang "pt-BR"
    ${ElseIf} $0 == 8218
      StrCpy $SelectedAppLang "bs"
    ${ElseIf} $0 == 5146
      StrCpy $SelectedAppLang "bs"
    ${ElseIf} $0 == 3098
      StrCpy $SelectedAppLang "sr"
    ${ElseIf} $0 == 2074
      StrCpy $SelectedAppLang "sr"
    ${ElseIf} $0 == 7194
      StrCpy $SelectedAppLang "sr"
    ${ElseIf} $0 == 6170
      StrCpy $SelectedAppLang "sr"
    ${ElseIf} $0 == 1050
      StrCpy $SelectedAppLang "hr"
    ${ElseIf} $0 == 4122
      StrCpy $SelectedAppLang "hr"
    ${Else}
      ${If} $1 == 31
        StrCpy $SelectedAppLang "tr"
      ${ElseIf} $1 == 9
        StrCpy $SelectedAppLang "en"
      ${ElseIf} $1 == 7
        StrCpy $SelectedAppLang "de"
      ${ElseIf} $1 == 12
        StrCpy $SelectedAppLang "fr"
      ${ElseIf} $1 == 10
        StrCpy $SelectedAppLang "es"
      ${ElseIf} $1 == 16
        StrCpy $SelectedAppLang "it"
      ${ElseIf} $1 == 22
        StrCpy $SelectedAppLang "pt"
      ${ElseIf} $1 == 25
        StrCpy $SelectedAppLang "ru"
      ${ElseIf} $1 == 17
        StrCpy $SelectedAppLang "ja"
      ${ElseIf} $1 == 18
        StrCpy $SelectedAppLang "ko"
      ${ElseIf} $1 == 4
        StrCpy $SelectedAppLang "zh-CN"
      ${ElseIf} $1 == 1
        StrCpy $SelectedAppLang "ar"
      ${ElseIf} $1 == 57
        StrCpy $SelectedAppLang "hi"
      ${ElseIf} $1 == 69
        StrCpy $SelectedAppLang "bn"
      ${ElseIf} $1 == 70
        StrCpy $SelectedAppLang "pa"
      ${ElseIf} $1 == 32
        StrCpy $SelectedAppLang "ur"
      ${ElseIf} $1 == 41
        StrCpy $SelectedAppLang "fa"
      ${ElseIf} $1 == 13
        StrCpy $SelectedAppLang "he"
      ${ElseIf} $1 == 19
        StrCpy $SelectedAppLang "nl"
      ${ElseIf} $1 == 21
        StrCpy $SelectedAppLang "pl"
      ${ElseIf} $1 == 34
        StrCpy $SelectedAppLang "uk"
      ${ElseIf} $1 == 5
        StrCpy $SelectedAppLang "cs"
      ${ElseIf} $1 == 27
        StrCpy $SelectedAppLang "sk"
      ${ElseIf} $1 == 14
        StrCpy $SelectedAppLang "hu"
      ${ElseIf} $1 == 24
        StrCpy $SelectedAppLang "ro"
      ${ElseIf} $1 == 2
        StrCpy $SelectedAppLang "bg"
      ${ElseIf} $1 == 8
        StrCpy $SelectedAppLang "el"
      ${ElseIf} $1 == 29
        StrCpy $SelectedAppLang "sv"
      ${ElseIf} $1 == 6
        StrCpy $SelectedAppLang "da"
      ${ElseIf} $1 == 20
        StrCpy $SelectedAppLang "no"
      ${ElseIf} $1 == 11
        StrCpy $SelectedAppLang "fi"
      ${ElseIf} $1 == 15
        StrCpy $SelectedAppLang "is"
      ${ElseIf} $1 == 37
        StrCpy $SelectedAppLang "et"
      ${ElseIf} $1 == 38
        StrCpy $SelectedAppLang "lv"
      ${ElseIf} $1 == 39
        StrCpy $SelectedAppLang "lt"
      ${ElseIf} $1 == 26
        StrCpy $SelectedAppLang "hr"
      ${ElseIf} $1 == 36
        StrCpy $SelectedAppLang "sl"
      ${ElseIf} $1 == 47
        StrCpy $SelectedAppLang "mk"
      ${ElseIf} $1 == 28
        StrCpy $SelectedAppLang "sq"
      ${ElseIf} $1 == 44
        StrCpy $SelectedAppLang "az"
      ${ElseIf} $1 == 63
        StrCpy $SelectedAppLang "kk"
      ${ElseIf} $1 == 67
        StrCpy $SelectedAppLang "uz"
      ${ElseIf} $1 == 64
        StrCpy $SelectedAppLang "ky"
      ${ElseIf} $1 == 66
        StrCpy $SelectedAppLang "tk"
      ${ElseIf} $1 == 55
        StrCpy $SelectedAppLang "ka"
      ${ElseIf} $1 == 43
        StrCpy $SelectedAppLang "hy"
      ${ElseIf} $1 == 33
        StrCpy $SelectedAppLang "id"
      ${ElseIf} $1 == 62
        StrCpy $SelectedAppLang "ms"
      ${ElseIf} $1 == 42
        StrCpy $SelectedAppLang "vi"
      ${ElseIf} $1 == 30
        StrCpy $SelectedAppLang "th"
      ${ElseIf} $1 == 100
        StrCpy $SelectedAppLang "tl"
      ${ElseIf} $1 == 83
        StrCpy $SelectedAppLang "km"
      ${ElseIf} $1 == 84
        StrCpy $SelectedAppLang "lo"
      ${ElseIf} $1 == 85
        StrCpy $SelectedAppLang "my"
      ${ElseIf} $1 == 73
        StrCpy $SelectedAppLang "ta"
      ${ElseIf} $1 == 74
        StrCpy $SelectedAppLang "te"
      ${ElseIf} $1 == 78
        StrCpy $SelectedAppLang "mr"
      ${ElseIf} $1 == 71
        StrCpy $SelectedAppLang "gu"
      ${ElseIf} $1 == 75
        StrCpy $SelectedAppLang "kn"
      ${ElseIf} $1 == 76
        StrCpy $SelectedAppLang "ml"
      ${ElseIf} $1 == 91
        StrCpy $SelectedAppLang "si"
      ${ElseIf} $1 == 97
        StrCpy $SelectedAppLang "ne"
      ${ElseIf} $1 == 65
        StrCpy $SelectedAppLang "sw"
      ${ElseIf} $1 == 94
        StrCpy $SelectedAppLang "am"
      ${ElseIf} $1 == 54
        StrCpy $SelectedAppLang "af"
      ${ElseIf} $1 == 3
        StrCpy $SelectedAppLang "ca"
      ${ElseIf} $1 == 45
        StrCpy $SelectedAppLang "eu"
      ${ElseIf} $1 == 86
        StrCpy $SelectedAppLang "gl"
      ${ElseIf} $1 == 82
        StrCpy $SelectedAppLang "cy"
      ${Else}
        StrCpy $SelectedAppLang "en"
      ${EndIf}
    ${EndIf}

    ; Apply detected Windows language to NSIS wizard (English 1033 fallback)
    ${If} $SelectedAppLang == "en"
      StrCpy $LANGUAGE 1033
    ${ElseIf} $SelectedAppLang == "tr"
      StrCpy $LANGUAGE 1055
    ${ElseIf} $SelectedAppLang == "de"
      StrCpy $LANGUAGE 1031
    ${ElseIf} $SelectedAppLang == "fr"
      StrCpy $LANGUAGE 1036
    ${ElseIf} $SelectedAppLang == "es"
      StrCpy $LANGUAGE 3082
    ${ElseIf} $SelectedAppLang == "it"
      StrCpy $LANGUAGE 1040
    ${ElseIf} $SelectedAppLang == "pt"
      StrCpy $LANGUAGE 2070
    ${ElseIf} $SelectedAppLang == "pt-BR"
      StrCpy $LANGUAGE 1046
    ${ElseIf} $SelectedAppLang == "ru"
      StrCpy $LANGUAGE 1049
    ${ElseIf} $SelectedAppLang == "ja"
      StrCpy $LANGUAGE 1041
    ${ElseIf} $SelectedAppLang == "ko"
      StrCpy $LANGUAGE 1042
    ${ElseIf} $SelectedAppLang == "zh-CN"
      StrCpy $LANGUAGE 2052
    ${ElseIf} $SelectedAppLang == "zh-TW"
      StrCpy $LANGUAGE 1028
    ${ElseIf} $SelectedAppLang == "ar"
      StrCpy $LANGUAGE 1025
    ${ElseIf} $SelectedAppLang == "hi"
      StrCpy $LANGUAGE 1081
    ${ElseIf} $SelectedAppLang == "he"
      StrCpy $LANGUAGE 1037
    ${ElseIf} $SelectedAppLang == "nl"
      StrCpy $LANGUAGE 1043
    ${ElseIf} $SelectedAppLang == "pl"
      StrCpy $LANGUAGE 1045
    ${ElseIf} $SelectedAppLang == "uk"
      StrCpy $LANGUAGE 1058
    ${ElseIf} $SelectedAppLang == "cs"
      StrCpy $LANGUAGE 1029
    ${ElseIf} $SelectedAppLang == "sk"
      StrCpy $LANGUAGE 1051
    ${ElseIf} $SelectedAppLang == "hu"
      StrCpy $LANGUAGE 1038
    ${ElseIf} $SelectedAppLang == "ro"
      StrCpy $LANGUAGE 1048
    ${ElseIf} $SelectedAppLang == "bg"
      StrCpy $LANGUAGE 1026
    ${ElseIf} $SelectedAppLang == "el"
      StrCpy $LANGUAGE 1032
    ${ElseIf} $SelectedAppLang == "sv"
      StrCpy $LANGUAGE 1053
    ${ElseIf} $SelectedAppLang == "da"
      StrCpy $LANGUAGE 1030
    ${ElseIf} $SelectedAppLang == "no"
      StrCpy $LANGUAGE 1044
    ${ElseIf} $SelectedAppLang == "fi"
      StrCpy $LANGUAGE 1035
    ${ElseIf} $SelectedAppLang == "is"
      StrCpy $LANGUAGE 1039
    ${ElseIf} $SelectedAppLang == "et"
      StrCpy $LANGUAGE 1061
    ${ElseIf} $SelectedAppLang == "lv"
      StrCpy $LANGUAGE 1062
    ${ElseIf} $SelectedAppLang == "lt"
      StrCpy $LANGUAGE 1063
    ${ElseIf} $SelectedAppLang == "hr"
      StrCpy $LANGUAGE 1050
    ${ElseIf} $SelectedAppLang == "bs"
      StrCpy $LANGUAGE 8218
    ${ElseIf} $SelectedAppLang == "mk"
      StrCpy $LANGUAGE 1071
    ${ElseIf} $SelectedAppLang == "sq"
      StrCpy $LANGUAGE 1052
    ${ElseIf} $SelectedAppLang == "uz"
      StrCpy $LANGUAGE 2115
    ${ElseIf} $SelectedAppLang == "ka"
      StrCpy $LANGUAGE 1079
    ${ElseIf} $SelectedAppLang == "hy"
      StrCpy $LANGUAGE 1067
    ${ElseIf} $SelectedAppLang == "id"
      StrCpy $LANGUAGE 1057
    ${ElseIf} $SelectedAppLang == "ms"
      StrCpy $LANGUAGE 1086
    ${ElseIf} $SelectedAppLang == "vi"
      StrCpy $LANGUAGE 1066
    ${ElseIf} $SelectedAppLang == "th"
      StrCpy $LANGUAGE 1054
    ${ElseIf} $SelectedAppLang == "sw"
      StrCpy $LANGUAGE 1089
    ${ElseIf} $SelectedAppLang == "af"
      StrCpy $LANGUAGE 1078
    ${ElseIf} $SelectedAppLang == "ca"
      StrCpy $LANGUAGE 1027
    ${ElseIf} $SelectedAppLang == "eu"
      StrCpy $LANGUAGE 1069
    ${ElseIf} $SelectedAppLang == "gl"
      StrCpy $LANGUAGE 1110
    ${ElseIf} $SelectedAppLang == "cy"
      StrCpy $LANGUAGE 1106
    ${Else}
      StrCpy $LANGUAGE 1033
    ${EndIf}
  !macroend

  !macro customWelcomePage
    ; Show 73-Language selector as the very first page of Agendamea Setup
    Page custom LanguagePageCreate LanguagePageLeave
    !insertmacro MUI_PAGE_WELCOME

    Function LanguagePageCreate
      ${If} $LANGUAGE == 1055
        !insertmacro MUI_HEADER_TEXT "Dil Seçimi (73 Dil)" "Agendamea kurulum ve uygulama dilini seçin."
      ${Else}
        !insertmacro MUI_HEADER_TEXT "Select Language (73 Languages)" "Choose your language for Agendamea setup and application."
      ${EndIf}

      nsDialogs::Create 1018
      Pop $LangDialog
      ${If} $LangDialog == error
        Abort
      ${EndIf}

      ${If} $LANGUAGE == 1055
        ${NSD_CreateLabel} 0 8u 100% 28u "Agendamea 73 dili destekler. Windows sistem diliniz otomatik seçildi; aşağıdaki listeden istediğiniz dili seçebilirsiniz:"
      ${Else}
        ${NSD_CreateLabel} 0 8u 100% 28u "Agendamea supports 73 languages. Your Windows display language is pre-selected (English fallback). You may choose any language below:"
      ${EndIf}
      Pop $LangIntroLabel

      ${NSD_CreateDropList} 0 42u 100% 140u ""
      Pop $LangCombo
      ${NSD_CB_AddString} $LangCombo "English [en]"
      ${NSD_CB_AddString} $LangCombo "Türkçe - Turkish [tr]"
      ${NSD_CB_AddString} $LangCombo "Deutsch - German [de]"
      ${NSD_CB_AddString} $LangCombo "Français - French [fr]"
      ${NSD_CB_AddString} $LangCombo "Español - Spanish [es]"
      ${NSD_CB_AddString} $LangCombo "Italiano - Italian [it]"
      ${NSD_CB_AddString} $LangCombo "Português - Portuguese [pt]"
      ${NSD_CB_AddString} $LangCombo "Português (Brasil) - Brazilian Portuguese [pt-BR]"
      ${NSD_CB_AddString} $LangCombo "Русский - Russian [ru]"
      ${NSD_CB_AddString} $LangCombo "日本語 - Japanese [ja]"
      ${NSD_CB_AddString} $LangCombo "한국어 - Korean [ko]"
      ${NSD_CB_AddString} $LangCombo "简体中文 - Simplified Chinese [zh-CN]"
      ${NSD_CB_AddString} $LangCombo "繁體中文 - Traditional Chinese [zh-TW]"
      ${NSD_CB_AddString} $LangCombo "العربية - Arabic [ar]"
      ${NSD_CB_AddString} $LangCombo "हिन्दी - Hindi [hi]"
      ${NSD_CB_AddString} $LangCombo "বাংলা - Bengali [bn]"
      ${NSD_CB_AddString} $LangCombo "ਪੰਜਾਬੀ - Punjabi [pa]"
      ${NSD_CB_AddString} $LangCombo "اردو - Urdu [ur]"
      ${NSD_CB_AddString} $LangCombo "فارسی - Persian [fa]"
      ${NSD_CB_AddString} $LangCombo "עברית - Hebrew [he]"
      ${NSD_CB_AddString} $LangCombo "Nederlands - Dutch [nl]"
      ${NSD_CB_AddString} $LangCombo "Polski - Polish [pl]"
      ${NSD_CB_AddString} $LangCombo "Українська - Ukrainian [uk]"
      ${NSD_CB_AddString} $LangCombo "Čeština - Czech [cs]"
      ${NSD_CB_AddString} $LangCombo "Slovenčina - Slovak [sk]"
      ${NSD_CB_AddString} $LangCombo "Magyar - Hungarian [hu]"
      ${NSD_CB_AddString} $LangCombo "Română - Romanian [ro]"
      ${NSD_CB_AddString} $LangCombo "Български - Bulgarian [bg]"
      ${NSD_CB_AddString} $LangCombo "Ελληνικά - Greek [el]"
      ${NSD_CB_AddString} $LangCombo "Svenska - Swedish [sv]"
      ${NSD_CB_AddString} $LangCombo "Dansk - Danish [da]"
      ${NSD_CB_AddString} $LangCombo "Norsk - Norwegian [no]"
      ${NSD_CB_AddString} $LangCombo "Suomi - Finnish [fi]"
      ${NSD_CB_AddString} $LangCombo "Íslenska - Icelandic [is]"
      ${NSD_CB_AddString} $LangCombo "Eesti - Estonian [et]"
      ${NSD_CB_AddString} $LangCombo "Latviešu - Latvian [lv]"
      ${NSD_CB_AddString} $LangCombo "Lietuvių - Lithuanian [lt]"
      ${NSD_CB_AddString} $LangCombo "Hrvatski - Croatian [hr]"
      ${NSD_CB_AddString} $LangCombo "Српски - Serbian [sr]"
      ${NSD_CB_AddString} $LangCombo "Slovenščina - Slovenian [sl]"
      ${NSD_CB_AddString} $LangCombo "Bosanski - Bosnian [bs]"
      ${NSD_CB_AddString} $LangCombo "Македонски - Macedonian [mk]"
      ${NSD_CB_AddString} $LangCombo "Shqip - Albanian [sq]"
      ${NSD_CB_AddString} $LangCombo "Azərbaycan - Azerbaijani [az]"
      ${NSD_CB_AddString} $LangCombo "Қазақша - Kazakh [kk]"
      ${NSD_CB_AddString} $LangCombo "Oʻzbekcha - Uzbek [uz]"
      ${NSD_CB_AddString} $LangCombo "Кыргызча - Kyrgyz [ky]"
      ${NSD_CB_AddString} $LangCombo "Türkmençe - Turkmen [tk]"
      ${NSD_CB_AddString} $LangCombo "ქართული - Georgian [ka]"
      ${NSD_CB_AddString} $LangCombo "Հայերեն - Armenian [hy]"
      ${NSD_CB_AddString} $LangCombo "Bahasa Indonesia - Indonesian [id]"
      ${NSD_CB_AddString} $LangCombo "Bahasa Melayu - Malay [ms]"
      ${NSD_CB_AddString} $LangCombo "Tiếng Việt - Vietnamese [vi]"
      ${NSD_CB_AddString} $LangCombo "ไทย - Thai [th]"
      ${NSD_CB_AddString} $LangCombo "Filipino [tl]"
      ${NSD_CB_AddString} $LangCombo "ខ្មែរ - Khmer [km]"
      ${NSD_CB_AddString} $LangCombo "ລາວ - Lao [lo]"
      ${NSD_CB_AddString} $LangCombo "မြန်မာ - Burmese [my]"
      ${NSD_CB_AddString} $LangCombo "தமிழ் - Tamil [ta]"
      ${NSD_CB_AddString} $LangCombo "తెలుగు - Telugu [te]"
      ${NSD_CB_AddString} $LangCombo "मराठी - Marathi [mr]"
      ${NSD_CB_AddString} $LangCombo "ગુજરાતી - Gujarati [gu]"
      ${NSD_CB_AddString} $LangCombo "ಕನ್ನಡ - Kannada [kn]"
      ${NSD_CB_AddString} $LangCombo "മലയാളം - Malayalam [ml]"
      ${NSD_CB_AddString} $LangCombo "සිංහල - Sinhala [si]"
      ${NSD_CB_AddString} $LangCombo "नेपाली - Nepali [ne]"
      ${NSD_CB_AddString} $LangCombo "Kiswahili - Swahili [sw]"
      ${NSD_CB_AddString} $LangCombo "አማርኛ - Amharic [am]"
      ${NSD_CB_AddString} $LangCombo "Afrikaans [af]"
      ${NSD_CB_AddString} $LangCombo "Català - Catalan [ca]"
      ${NSD_CB_AddString} $LangCombo "Euskara - Basque [eu]"
      ${NSD_CB_AddString} $LangCombo "Galego - Galician [gl]"
      ${NSD_CB_AddString} $LangCombo "Cymraeg - Welsh [cy]"

      ${If} $SelectedAppLang == "en"
        ${NSD_CB_SelectString} $LangCombo "English [en]"
      ${ElseIf} $SelectedAppLang == "tr"
        ${NSD_CB_SelectString} $LangCombo "Türkçe - Turkish [tr]"
      ${ElseIf} $SelectedAppLang == "de"
        ${NSD_CB_SelectString} $LangCombo "Deutsch - German [de]"
      ${ElseIf} $SelectedAppLang == "fr"
        ${NSD_CB_SelectString} $LangCombo "Français - French [fr]"
      ${ElseIf} $SelectedAppLang == "es"
        ${NSD_CB_SelectString} $LangCombo "Español - Spanish [es]"
      ${ElseIf} $SelectedAppLang == "it"
        ${NSD_CB_SelectString} $LangCombo "Italiano - Italian [it]"
      ${ElseIf} $SelectedAppLang == "pt"
        ${NSD_CB_SelectString} $LangCombo "Português - Portuguese [pt]"
      ${ElseIf} $SelectedAppLang == "pt-BR"
        ${NSD_CB_SelectString} $LangCombo "Português (Brasil) - Brazilian Portuguese [pt-BR]"
      ${ElseIf} $SelectedAppLang == "ru"
        ${NSD_CB_SelectString} $LangCombo "Русский - Russian [ru]"
      ${ElseIf} $SelectedAppLang == "ja"
        ${NSD_CB_SelectString} $LangCombo "日本語 - Japanese [ja]"
      ${ElseIf} $SelectedAppLang == "ko"
        ${NSD_CB_SelectString} $LangCombo "한국어 - Korean [ko]"
      ${ElseIf} $SelectedAppLang == "zh-CN"
        ${NSD_CB_SelectString} $LangCombo "简体中文 - Simplified Chinese [zh-CN]"
      ${ElseIf} $SelectedAppLang == "zh-TW"
        ${NSD_CB_SelectString} $LangCombo "繁體中文 - Traditional Chinese [zh-TW]"
      ${ElseIf} $SelectedAppLang == "ar"
        ${NSD_CB_SelectString} $LangCombo "العربية - Arabic [ar]"
      ${ElseIf} $SelectedAppLang == "hi"
        ${NSD_CB_SelectString} $LangCombo "हिन्दी - Hindi [hi]"
      ${ElseIf} $SelectedAppLang == "bn"
        ${NSD_CB_SelectString} $LangCombo "বাংলা - Bengali [bn]"
      ${ElseIf} $SelectedAppLang == "pa"
        ${NSD_CB_SelectString} $LangCombo "ਪੰਜਾਬੀ - Punjabi [pa]"
      ${ElseIf} $SelectedAppLang == "ur"
        ${NSD_CB_SelectString} $LangCombo "اردو - Urdu [ur]"
      ${ElseIf} $SelectedAppLang == "fa"
        ${NSD_CB_SelectString} $LangCombo "فارسی - Persian [fa]"
      ${ElseIf} $SelectedAppLang == "he"
        ${NSD_CB_SelectString} $LangCombo "עברית - Hebrew [he]"
      ${ElseIf} $SelectedAppLang == "nl"
        ${NSD_CB_SelectString} $LangCombo "Nederlands - Dutch [nl]"
      ${ElseIf} $SelectedAppLang == "pl"
        ${NSD_CB_SelectString} $LangCombo "Polski - Polish [pl]"
      ${ElseIf} $SelectedAppLang == "uk"
        ${NSD_CB_SelectString} $LangCombo "Українська - Ukrainian [uk]"
      ${ElseIf} $SelectedAppLang == "cs"
        ${NSD_CB_SelectString} $LangCombo "Čeština - Czech [cs]"
      ${ElseIf} $SelectedAppLang == "sk"
        ${NSD_CB_SelectString} $LangCombo "Slovenčina - Slovak [sk]"
      ${ElseIf} $SelectedAppLang == "hu"
        ${NSD_CB_SelectString} $LangCombo "Magyar - Hungarian [hu]"
      ${ElseIf} $SelectedAppLang == "ro"
        ${NSD_CB_SelectString} $LangCombo "Română - Romanian [ro]"
      ${ElseIf} $SelectedAppLang == "bg"
        ${NSD_CB_SelectString} $LangCombo "Български - Bulgarian [bg]"
      ${ElseIf} $SelectedAppLang == "el"
        ${NSD_CB_SelectString} $LangCombo "Ελληνικά - Greek [el]"
      ${ElseIf} $SelectedAppLang == "sv"
        ${NSD_CB_SelectString} $LangCombo "Svenska - Swedish [sv]"
      ${ElseIf} $SelectedAppLang == "da"
        ${NSD_CB_SelectString} $LangCombo "Dansk - Danish [da]"
      ${ElseIf} $SelectedAppLang == "no"
        ${NSD_CB_SelectString} $LangCombo "Norsk - Norwegian [no]"
      ${ElseIf} $SelectedAppLang == "fi"
        ${NSD_CB_SelectString} $LangCombo "Suomi - Finnish [fi]"
      ${ElseIf} $SelectedAppLang == "is"
        ${NSD_CB_SelectString} $LangCombo "Íslenska - Icelandic [is]"
      ${ElseIf} $SelectedAppLang == "et"
        ${NSD_CB_SelectString} $LangCombo "Eesti - Estonian [et]"
      ${ElseIf} $SelectedAppLang == "lv"
        ${NSD_CB_SelectString} $LangCombo "Latviešu - Latvian [lv]"
      ${ElseIf} $SelectedAppLang == "lt"
        ${NSD_CB_SelectString} $LangCombo "Lietuvių - Lithuanian [lt]"
      ${ElseIf} $SelectedAppLang == "hr"
        ${NSD_CB_SelectString} $LangCombo "Hrvatski - Croatian [hr]"
      ${ElseIf} $SelectedAppLang == "sr"
        ${NSD_CB_SelectString} $LangCombo "Српски - Serbian [sr]"
      ${ElseIf} $SelectedAppLang == "sl"
        ${NSD_CB_SelectString} $LangCombo "Slovenščina - Slovenian [sl]"
      ${ElseIf} $SelectedAppLang == "bs"
        ${NSD_CB_SelectString} $LangCombo "Bosanski - Bosnian [bs]"
      ${ElseIf} $SelectedAppLang == "mk"
        ${NSD_CB_SelectString} $LangCombo "Македонски - Macedonian [mk]"
      ${ElseIf} $SelectedAppLang == "sq"
        ${NSD_CB_SelectString} $LangCombo "Shqip - Albanian [sq]"
      ${ElseIf} $SelectedAppLang == "az"
        ${NSD_CB_SelectString} $LangCombo "Azərbaycan - Azerbaijani [az]"
      ${ElseIf} $SelectedAppLang == "kk"
        ${NSD_CB_SelectString} $LangCombo "Қазақша - Kazakh [kk]"
      ${ElseIf} $SelectedAppLang == "uz"
        ${NSD_CB_SelectString} $LangCombo "Oʻzbekcha - Uzbek [uz]"
      ${ElseIf} $SelectedAppLang == "ky"
        ${NSD_CB_SelectString} $LangCombo "Кыргызча - Kyrgyz [ky]"
      ${ElseIf} $SelectedAppLang == "tk"
        ${NSD_CB_SelectString} $LangCombo "Türkmençe - Turkmen [tk]"
      ${ElseIf} $SelectedAppLang == "ka"
        ${NSD_CB_SelectString} $LangCombo "ქართული - Georgian [ka]"
      ${ElseIf} $SelectedAppLang == "hy"
        ${NSD_CB_SelectString} $LangCombo "Հայերեն - Armenian [hy]"
      ${ElseIf} $SelectedAppLang == "id"
        ${NSD_CB_SelectString} $LangCombo "Bahasa Indonesia - Indonesian [id]"
      ${ElseIf} $SelectedAppLang == "ms"
        ${NSD_CB_SelectString} $LangCombo "Bahasa Melayu - Malay [ms]"
      ${ElseIf} $SelectedAppLang == "vi"
        ${NSD_CB_SelectString} $LangCombo "Tiếng Việt - Vietnamese [vi]"
      ${ElseIf} $SelectedAppLang == "th"
        ${NSD_CB_SelectString} $LangCombo "ไทย - Thai [th]"
      ${ElseIf} $SelectedAppLang == "tl"
        ${NSD_CB_SelectString} $LangCombo "Filipino [tl]"
      ${ElseIf} $SelectedAppLang == "km"
        ${NSD_CB_SelectString} $LangCombo "ខ្មែរ - Khmer [km]"
      ${ElseIf} $SelectedAppLang == "lo"
        ${NSD_CB_SelectString} $LangCombo "ລາວ - Lao [lo]"
      ${ElseIf} $SelectedAppLang == "my"
        ${NSD_CB_SelectString} $LangCombo "မြန်မာ - Burmese [my]"
      ${ElseIf} $SelectedAppLang == "ta"
        ${NSD_CB_SelectString} $LangCombo "தமிழ் - Tamil [ta]"
      ${ElseIf} $SelectedAppLang == "te"
        ${NSD_CB_SelectString} $LangCombo "తెలుగు - Telugu [te]"
      ${ElseIf} $SelectedAppLang == "mr"
        ${NSD_CB_SelectString} $LangCombo "मराठी - Marathi [mr]"
      ${ElseIf} $SelectedAppLang == "gu"
        ${NSD_CB_SelectString} $LangCombo "ગુજરાતી - Gujarati [gu]"
      ${ElseIf} $SelectedAppLang == "kn"
        ${NSD_CB_SelectString} $LangCombo "ಕನ್ನಡ - Kannada [kn]"
      ${ElseIf} $SelectedAppLang == "ml"
        ${NSD_CB_SelectString} $LangCombo "മലയാളം - Malayalam [ml]"
      ${ElseIf} $SelectedAppLang == "si"
        ${NSD_CB_SelectString} $LangCombo "සිංහල - Sinhala [si]"
      ${ElseIf} $SelectedAppLang == "ne"
        ${NSD_CB_SelectString} $LangCombo "नेपाली - Nepali [ne]"
      ${ElseIf} $SelectedAppLang == "sw"
        ${NSD_CB_SelectString} $LangCombo "Kiswahili - Swahili [sw]"
      ${ElseIf} $SelectedAppLang == "am"
        ${NSD_CB_SelectString} $LangCombo "አማርኛ - Amharic [am]"
      ${ElseIf} $SelectedAppLang == "af"
        ${NSD_CB_SelectString} $LangCombo "Afrikaans [af]"
      ${ElseIf} $SelectedAppLang == "ca"
        ${NSD_CB_SelectString} $LangCombo "Català - Catalan [ca]"
      ${ElseIf} $SelectedAppLang == "eu"
        ${NSD_CB_SelectString} $LangCombo "Euskara - Basque [eu]"
      ${ElseIf} $SelectedAppLang == "gl"
        ${NSD_CB_SelectString} $LangCombo "Galego - Galician [gl]"
      ${ElseIf} $SelectedAppLang == "cy"
        ${NSD_CB_SelectString} $LangCombo "Cymraeg - Welsh [cy]"
      ${Else}
        ${NSD_CB_SelectString} $LangCombo "English [en]"
      ${EndIf}

      ${If} $LANGUAGE == 1055
        ${NSD_CreateLabel} 0 68u 100% 34u "Seçtiğiniz dil kurulum tamamlandığında Agendamea içinde otomatik olarak uygulanır. Daha sonra Ayarlar menüsü üzerinden dilediğiniz zaman değiştirebilirsiniz."
      ${Else}
        ${NSD_CreateLabel} 0 68u 100% 34u "Your selected language will automatically be applied when Agendamea launches. You can change it anytime in Settings."
      ${EndIf}
      Pop $LangHintLabel

      nsDialogs::Show
    FunctionEnd

    Function LanguagePageLeave
      ${NSD_GetText} $LangCombo $0
      ${If} $0 == "English [en]"
        StrCpy $SelectedAppLang "en"
      ${ElseIf} $0 == "Türkçe - Turkish [tr]"
        StrCpy $SelectedAppLang "tr"
      ${ElseIf} $0 == "Deutsch - German [de]"
        StrCpy $SelectedAppLang "de"
      ${ElseIf} $0 == "Français - French [fr]"
        StrCpy $SelectedAppLang "fr"
      ${ElseIf} $0 == "Español - Spanish [es]"
        StrCpy $SelectedAppLang "es"
      ${ElseIf} $0 == "Italiano - Italian [it]"
        StrCpy $SelectedAppLang "it"
      ${ElseIf} $0 == "Português - Portuguese [pt]"
        StrCpy $SelectedAppLang "pt"
      ${ElseIf} $0 == "Português (Brasil) - Brazilian Portuguese [pt-BR]"
        StrCpy $SelectedAppLang "pt-BR"
      ${ElseIf} $0 == "Русский - Russian [ru]"
        StrCpy $SelectedAppLang "ru"
      ${ElseIf} $0 == "日本語 - Japanese [ja]"
        StrCpy $SelectedAppLang "ja"
      ${ElseIf} $0 == "한국어 - Korean [ko]"
        StrCpy $SelectedAppLang "ko"
      ${ElseIf} $0 == "简体中文 - Simplified Chinese [zh-CN]"
        StrCpy $SelectedAppLang "zh-CN"
      ${ElseIf} $0 == "繁體中文 - Traditional Chinese [zh-TW]"
        StrCpy $SelectedAppLang "zh-TW"
      ${ElseIf} $0 == "العربية - Arabic [ar]"
        StrCpy $SelectedAppLang "ar"
      ${ElseIf} $0 == "हिन्दी - Hindi [hi]"
        StrCpy $SelectedAppLang "hi"
      ${ElseIf} $0 == "বাংলা - Bengali [bn]"
        StrCpy $SelectedAppLang "bn"
      ${ElseIf} $0 == "ਪੰਜਾਬੀ - Punjabi [pa]"
        StrCpy $SelectedAppLang "pa"
      ${ElseIf} $0 == "اردو - Urdu [ur]"
        StrCpy $SelectedAppLang "ur"
      ${ElseIf} $0 == "فارسی - Persian [fa]"
        StrCpy $SelectedAppLang "fa"
      ${ElseIf} $0 == "עברית - Hebrew [he]"
        StrCpy $SelectedAppLang "he"
      ${ElseIf} $0 == "Nederlands - Dutch [nl]"
        StrCpy $SelectedAppLang "nl"
      ${ElseIf} $0 == "Polski - Polish [pl]"
        StrCpy $SelectedAppLang "pl"
      ${ElseIf} $0 == "Українська - Ukrainian [uk]"
        StrCpy $SelectedAppLang "uk"
      ${ElseIf} $0 == "Čeština - Czech [cs]"
        StrCpy $SelectedAppLang "cs"
      ${ElseIf} $0 == "Slovenčina - Slovak [sk]"
        StrCpy $SelectedAppLang "sk"
      ${ElseIf} $0 == "Magyar - Hungarian [hu]"
        StrCpy $SelectedAppLang "hu"
      ${ElseIf} $0 == "Română - Romanian [ro]"
        StrCpy $SelectedAppLang "ro"
      ${ElseIf} $0 == "Български - Bulgarian [bg]"
        StrCpy $SelectedAppLang "bg"
      ${ElseIf} $0 == "Ελληνικά - Greek [el]"
        StrCpy $SelectedAppLang "el"
      ${ElseIf} $0 == "Svenska - Swedish [sv]"
        StrCpy $SelectedAppLang "sv"
      ${ElseIf} $0 == "Dansk - Danish [da]"
        StrCpy $SelectedAppLang "da"
      ${ElseIf} $0 == "Norsk - Norwegian [no]"
        StrCpy $SelectedAppLang "no"
      ${ElseIf} $0 == "Suomi - Finnish [fi]"
        StrCpy $SelectedAppLang "fi"
      ${ElseIf} $0 == "Íslenska - Icelandic [is]"
        StrCpy $SelectedAppLang "is"
      ${ElseIf} $0 == "Eesti - Estonian [et]"
        StrCpy $SelectedAppLang "et"
      ${ElseIf} $0 == "Latviešu - Latvian [lv]"
        StrCpy $SelectedAppLang "lv"
      ${ElseIf} $0 == "Lietuvių - Lithuanian [lt]"
        StrCpy $SelectedAppLang "lt"
      ${ElseIf} $0 == "Hrvatski - Croatian [hr]"
        StrCpy $SelectedAppLang "hr"
      ${ElseIf} $0 == "Српски - Serbian [sr]"
        StrCpy $SelectedAppLang "sr"
      ${ElseIf} $0 == "Slovenščina - Slovenian [sl]"
        StrCpy $SelectedAppLang "sl"
      ${ElseIf} $0 == "Bosanski - Bosnian [bs]"
        StrCpy $SelectedAppLang "bs"
      ${ElseIf} $0 == "Македонски - Macedonian [mk]"
        StrCpy $SelectedAppLang "mk"
      ${ElseIf} $0 == "Shqip - Albanian [sq]"
        StrCpy $SelectedAppLang "sq"
      ${ElseIf} $0 == "Azərbaycan - Azerbaijani [az]"
        StrCpy $SelectedAppLang "az"
      ${ElseIf} $0 == "Қазақша - Kazakh [kk]"
        StrCpy $SelectedAppLang "kk"
      ${ElseIf} $0 == "Oʻzbekcha - Uzbek [uz]"
        StrCpy $SelectedAppLang "uz"
      ${ElseIf} $0 == "Кыргызча - Kyrgyz [ky]"
        StrCpy $SelectedAppLang "ky"
      ${ElseIf} $0 == "Türkmençe - Turkmen [tk]"
        StrCpy $SelectedAppLang "tk"
      ${ElseIf} $0 == "ქართული - Georgian [ka]"
        StrCpy $SelectedAppLang "ka"
      ${ElseIf} $0 == "Հայերեն - Armenian [hy]"
        StrCpy $SelectedAppLang "hy"
      ${ElseIf} $0 == "Bahasa Indonesia - Indonesian [id]"
        StrCpy $SelectedAppLang "id"
      ${ElseIf} $0 == "Bahasa Melayu - Malay [ms]"
        StrCpy $SelectedAppLang "ms"
      ${ElseIf} $0 == "Tiếng Việt - Vietnamese [vi]"
        StrCpy $SelectedAppLang "vi"
      ${ElseIf} $0 == "ไทย - Thai [th]"
        StrCpy $SelectedAppLang "th"
      ${ElseIf} $0 == "Filipino [tl]"
        StrCpy $SelectedAppLang "tl"
      ${ElseIf} $0 == "ខ្មែរ - Khmer [km]"
        StrCpy $SelectedAppLang "km"
      ${ElseIf} $0 == "ລາວ - Lao [lo]"
        StrCpy $SelectedAppLang "lo"
      ${ElseIf} $0 == "မြန်မာ - Burmese [my]"
        StrCpy $SelectedAppLang "my"
      ${ElseIf} $0 == "தமிழ் - Tamil [ta]"
        StrCpy $SelectedAppLang "ta"
      ${ElseIf} $0 == "తెలుగు - Telugu [te]"
        StrCpy $SelectedAppLang "te"
      ${ElseIf} $0 == "मराठी - Marathi [mr]"
        StrCpy $SelectedAppLang "mr"
      ${ElseIf} $0 == "ગુજરાતી - Gujarati [gu]"
        StrCpy $SelectedAppLang "gu"
      ${ElseIf} $0 == "ಕನ್ನಡ - Kannada [kn]"
        StrCpy $SelectedAppLang "kn"
      ${ElseIf} $0 == "മലയാളം - Malayalam [ml]"
        StrCpy $SelectedAppLang "ml"
      ${ElseIf} $0 == "සිංහල - Sinhala [si]"
        StrCpy $SelectedAppLang "si"
      ${ElseIf} $0 == "नेपाली - Nepali [ne]"
        StrCpy $SelectedAppLang "ne"
      ${ElseIf} $0 == "Kiswahili - Swahili [sw]"
        StrCpy $SelectedAppLang "sw"
      ${ElseIf} $0 == "አማርኛ - Amharic [am]"
        StrCpy $SelectedAppLang "am"
      ${ElseIf} $0 == "Afrikaans [af]"
        StrCpy $SelectedAppLang "af"
      ${ElseIf} $0 == "Català - Catalan [ca]"
        StrCpy $SelectedAppLang "ca"
      ${ElseIf} $0 == "Euskara - Basque [eu]"
        StrCpy $SelectedAppLang "eu"
      ${ElseIf} $0 == "Galego - Galician [gl]"
        StrCpy $SelectedAppLang "gl"
      ${ElseIf} $0 == "Cymraeg - Welsh [cy]"
        StrCpy $SelectedAppLang "cy"
      ${Else}
        StrCpy $SelectedAppLang "en"
      ${EndIf}

      ; Immediately switch remaining NSIS wizard pages to the chosen language (English fallback)
    ${If} $SelectedAppLang == "en"
      StrCpy $LANGUAGE 1033
    ${ElseIf} $SelectedAppLang == "tr"
      StrCpy $LANGUAGE 1055
    ${ElseIf} $SelectedAppLang == "de"
      StrCpy $LANGUAGE 1031
    ${ElseIf} $SelectedAppLang == "fr"
      StrCpy $LANGUAGE 1036
    ${ElseIf} $SelectedAppLang == "es"
      StrCpy $LANGUAGE 3082
    ${ElseIf} $SelectedAppLang == "it"
      StrCpy $LANGUAGE 1040
    ${ElseIf} $SelectedAppLang == "pt"
      StrCpy $LANGUAGE 2070
    ${ElseIf} $SelectedAppLang == "pt-BR"
      StrCpy $LANGUAGE 1046
    ${ElseIf} $SelectedAppLang == "ru"
      StrCpy $LANGUAGE 1049
    ${ElseIf} $SelectedAppLang == "ja"
      StrCpy $LANGUAGE 1041
    ${ElseIf} $SelectedAppLang == "ko"
      StrCpy $LANGUAGE 1042
    ${ElseIf} $SelectedAppLang == "zh-CN"
      StrCpy $LANGUAGE 2052
    ${ElseIf} $SelectedAppLang == "zh-TW"
      StrCpy $LANGUAGE 1028
    ${ElseIf} $SelectedAppLang == "ar"
      StrCpy $LANGUAGE 1025
    ${ElseIf} $SelectedAppLang == "hi"
      StrCpy $LANGUAGE 1081
    ${ElseIf} $SelectedAppLang == "he"
      StrCpy $LANGUAGE 1037
    ${ElseIf} $SelectedAppLang == "nl"
      StrCpy $LANGUAGE 1043
    ${ElseIf} $SelectedAppLang == "pl"
      StrCpy $LANGUAGE 1045
    ${ElseIf} $SelectedAppLang == "uk"
      StrCpy $LANGUAGE 1058
    ${ElseIf} $SelectedAppLang == "cs"
      StrCpy $LANGUAGE 1029
    ${ElseIf} $SelectedAppLang == "sk"
      StrCpy $LANGUAGE 1051
    ${ElseIf} $SelectedAppLang == "hu"
      StrCpy $LANGUAGE 1038
    ${ElseIf} $SelectedAppLang == "ro"
      StrCpy $LANGUAGE 1048
    ${ElseIf} $SelectedAppLang == "bg"
      StrCpy $LANGUAGE 1026
    ${ElseIf} $SelectedAppLang == "el"
      StrCpy $LANGUAGE 1032
    ${ElseIf} $SelectedAppLang == "sv"
      StrCpy $LANGUAGE 1053
    ${ElseIf} $SelectedAppLang == "da"
      StrCpy $LANGUAGE 1030
    ${ElseIf} $SelectedAppLang == "no"
      StrCpy $LANGUAGE 1044
    ${ElseIf} $SelectedAppLang == "fi"
      StrCpy $LANGUAGE 1035
    ${ElseIf} $SelectedAppLang == "is"
      StrCpy $LANGUAGE 1039
    ${ElseIf} $SelectedAppLang == "et"
      StrCpy $LANGUAGE 1061
    ${ElseIf} $SelectedAppLang == "lv"
      StrCpy $LANGUAGE 1062
    ${ElseIf} $SelectedAppLang == "lt"
      StrCpy $LANGUAGE 1063
    ${ElseIf} $SelectedAppLang == "hr"
      StrCpy $LANGUAGE 1050
    ${ElseIf} $SelectedAppLang == "bs"
      StrCpy $LANGUAGE 8218
    ${ElseIf} $SelectedAppLang == "mk"
      StrCpy $LANGUAGE 1071
    ${ElseIf} $SelectedAppLang == "sq"
      StrCpy $LANGUAGE 1052
    ${ElseIf} $SelectedAppLang == "uz"
      StrCpy $LANGUAGE 2115
    ${ElseIf} $SelectedAppLang == "ka"
      StrCpy $LANGUAGE 1079
    ${ElseIf} $SelectedAppLang == "hy"
      StrCpy $LANGUAGE 1067
    ${ElseIf} $SelectedAppLang == "id"
      StrCpy $LANGUAGE 1057
    ${ElseIf} $SelectedAppLang == "ms"
      StrCpy $LANGUAGE 1086
    ${ElseIf} $SelectedAppLang == "vi"
      StrCpy $LANGUAGE 1066
    ${ElseIf} $SelectedAppLang == "th"
      StrCpy $LANGUAGE 1054
    ${ElseIf} $SelectedAppLang == "sw"
      StrCpy $LANGUAGE 1089
    ${ElseIf} $SelectedAppLang == "af"
      StrCpy $LANGUAGE 1078
    ${ElseIf} $SelectedAppLang == "ca"
      StrCpy $LANGUAGE 1027
    ${ElseIf} $SelectedAppLang == "eu"
      StrCpy $LANGUAGE 1069
    ${ElseIf} $SelectedAppLang == "gl"
      StrCpy $LANGUAGE 1110
    ${ElseIf} $SelectedAppLang == "cy"
      StrCpy $LANGUAGE 1106
      ${Else}
        StrCpy $LANGUAGE 1033
      ${EndIf}
    FunctionEnd
  !macroend
!endif

!ifdef BUILD_UNINSTALLER
  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME
    UninstPage custom un.UserDataPageCreate un.UserDataPageLeave

    Function un.UserDataPageCreate
      ${If} $LANGUAGE == 1055
        !insertmacro MUI_HEADER_TEXT "Kaldırma Seçenekleri" "Kayıtlı görev ve tema verilerinizin nasıl işleneceğini seçin."
      ${Else}
        !insertmacro MUI_HEADER_TEXT "Uninstall Options" "Choose how to handle your local tasks and settings."
      ${EndIf}

      nsDialogs::Create 1018
      Pop $UnDataDialog
      ${If} $UnDataDialog == error
        Abort
      ${EndIf}

      ${If} $LANGUAGE == 1055
        ${NSD_CreateLabel} 0 8u 100% 30u "Agendamea uygulama dosyaları kaldırılacaktır. Aşağıdaki seçeneği işaretleyerek yerel veritabanınızı ve ayarlarınızı da kalıcı olarak silebilirsiniz."
      ${Else}
        ${NSD_CreateLabel} 0 8u 100% 30u "Agendamea application files will be removed. Check the option below if you also want to permanently delete your local database and settings."
      ${EndIf}
      Pop $UnDataInfoLabel

      ${If} $LANGUAGE == 1055
        ${NSD_CreateCheckbox} 0 48u 100% 16u "Kullanıcı verilerini de sil (tüm görevler, kategoriler ve ayarlar)"
      ${Else}
        ${NSD_CreateCheckbox} 0 48u 100% 16u "Also delete user data (all tasks, categories, and settings)"
      ${EndIf}
      Pop $UnDataCheckbox
      ${If} $DeleteUserDataFlag == ${BST_CHECKED}
        ${NSD_Check} $UnDataCheckbox
      ${EndIf}

      ${If} $LANGUAGE == 1055
        ${NSD_CreateLabel} 14u 68u 92% 34u "İşaretlenmezse verileriniz (%APPDATA%\Agendamea) korunur ve yeniden kurduğunuzda kaldığınız yerden devam edebilirsiniz."
      ${Else}
        ${NSD_CreateLabel} 14u 68u 92% 34u "If unchecked, your data (%APPDATA%\Agendamea) is kept safely so you can resume after reinstalling."
      ${EndIf}
      Pop $UnDataHintLabel

      nsDialogs::Show
    FunctionEnd

    Function un.UserDataPageLeave
      ${NSD_GetState} $UnDataCheckbox $DeleteUserDataFlag
    FunctionEnd
  !macroend
!endif

!macro customInstall
  ; Save installer-selected language (out of 73 languages) for Agendamea first launch
  !ifndef BUILD_UNINSTALLER
    ${If} $SelectedAppLang == ""
      StrCpy $SelectedAppLang "en"
    ${EndIf}
    WriteRegStr HKCU "Software\Vellium\Agendamea" "Language" "$SelectedAppLang"
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}
    CreateDirectory "$APPDATA\Agendamea"
    FileOpen $4 "$APPDATA\Agendamea\installer-language.txt" w
    FileWrite $4 "$SelectedAppLang"
    FileClose $4
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  !endif

  ; Windows 11 Installed Apps & Control Panel publisher, icon & support metadata
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "Publisher" "Vellium"
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "URLInfoAbout" "https://vellium.dev"
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "HelpLink" "https://vellium.dev"
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "Contact" "support@vellium.dev"
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "Comments" "Fast, offline-first daily task manager for Windows. Published by Vellium (https://vellium.dev)."
  WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" "NoModify" 1
  WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" "NoRepair" 1
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ${If} $DeleteUserDataFlag == ${BST_CHECKED}
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}

    RMDir /r "$APPDATA\Agendamea"
    RMDir /r "$APPDATA\agendamea"
    RMDir /r "$LOCALAPPDATA\Agendamea"
    RMDir /r "$LOCALAPPDATA\agendamea-updater"

    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend
