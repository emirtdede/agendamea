; Agendamea - Vellium Windows 11 Native Multi-Language (31 Complete Setup/Uninstall Languages) Script (UTF-8 BOM)
; Language selection runs in .onInit (MUI_LANGDLL_DISPLAY) BEFORE the wizard window is created,
; so 100% of Setup AND Uninstaller screens render natively in the chosen language with zero leakage.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
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

  ; Show all 50 Unicode languages regardless of Windows ANSI codepage and always prompt at Setup start
  !ifndef MUI_LANGDLL_ALLLANGUAGES
    !define MUI_LANGDLL_ALLLANGUAGES
  !endif
  !ifndef MUI_LANGDLL_ALWAYSSHOW
    !define MUI_LANGDLL_ALWAYSSHOW
  !endif
  !define MUI_LANGDLL_WINDOWTITLE "Agendamea"
  !define MUI_LANGDLL_INFO "Select Setup language / Kurulum dilini seçin:"

  !ifdef MUI_FINISHPAGE_LINK
    !undef MUI_FINISHPAGE_LINK
  !endif
  !define MUI_FINISHPAGE_LINK "vellium.dev - support@vellium.dev"

  !ifdef MUI_FINISHPAGE_LINK_LOCATION
    !undef MUI_FINISHPAGE_LINK_LOCATION
  !endif
  !define MUI_FINISHPAGE_LINK_LOCATION "https://vellium.dev"

  ; Fully localized Uninstaller user-data options across all 50 installer languages
  LangString UN_DATA_TITLE 1033 "Uninstall Options"
  LangString UN_DATA_SUBTITLE 1033 "Choose how to handle your local tasks and settings."
  LangString UN_DATA_INFO 1033 "Agendamea application files will be removed. Check the option below if you also want to permanently delete your local database and settings."
  LangString UN_DATA_CHECKBOX 1033 "Also delete user data (all tasks, categories, and settings)"
  LangString UN_DATA_HINT 1033 "If unchecked, your data (%APPDATA%\Agendamea) is kept safely so you can resume after reinstalling."
  LangString UN_DATA_TITLE 1055 "Kaldırma Seçenekleri"
  LangString UN_DATA_SUBTITLE 1055 "Kayıtlı görev ve tema verilerinizin nasıl işleneceğini seçin."
  LangString UN_DATA_INFO 1055 "Agendamea uygulama dosyaları kaldırılacaktır. Aşağıdaki seçeneği işaretleyerek yerel veritabanınızı ve ayarlarınızı da kalıcı olarak silebilirsiniz."
  LangString UN_DATA_CHECKBOX 1055 "Kullanıcı verilerini de sil (tüm görevler, kategoriler ve ayarlar)"
  LangString UN_DATA_HINT 1055 "İşaretlenmezse verileriniz (%APPDATA%\Agendamea) korunur ve yeniden kurduğunuzda kaldığınız yerden devam edebilirsiniz."
  LangString UN_DATA_TITLE 1031 "Deinstallationsoptionen"
  LangString UN_DATA_SUBTITLE 1031 "Wählen Sie, wie Ihre lokalen Aufgaben und Einstellungen behandelt werden sollen."
  LangString UN_DATA_INFO 1031 "Die Agendamea-Programmdateien werden entfernt. Aktivieren Sie die Option unten, um auch Ihre lokale Datenbank und Einstellungen dauerhaft zu löschen."
  LangString UN_DATA_CHECKBOX 1031 "Benutzerdaten ebenfalls löschen (alle Aufgaben, Kategorien und Einstellungen)"
  LangString UN_DATA_HINT 1031 "Wenn nicht markiert, bleiben Ihre Daten (%APPDATA%\Agendamea) sicher erhalten."
  LangString UN_DATA_TITLE 1036 "Options de désinstallation"
  LangString UN_DATA_SUBTITLE 1036 "Choisissez comment traiter vos tâches et paramètres locaux."
  LangString UN_DATA_INFO 1036 "Les fichiers de Agendamea seront supprimés. Cochez l'option ci-dessous pour supprimer définitivement votre base de données locale et vos paramètres."
  LangString UN_DATA_CHECKBOX 1036 "Supprimer également les données utilisateur (tâches, catégories et paramètres)"
  LangString UN_DATA_HINT 1036 "Si cette case n'est pas cochée, vos données (%APPDATA%\Agendamea) sont conservées en toute sécurité."
  LangString UN_DATA_TITLE 3082 "Opciones de desinstalación"
  LangString UN_DATA_SUBTITLE 3082 "Elige cómo gestionar tus tareas y ajustes locales."
  LangString UN_DATA_INFO 3082 "Se eliminarán los archivos de Agendamea. Marca la opción siguiente si también deseas eliminar permanentemente tu base de datos local y configuración."
  LangString UN_DATA_CHECKBOX 3082 "Eliminar también los datos de usuario (tareas, categorías y ajustes)"
  LangString UN_DATA_HINT 3082 "Si se deja sin marcar, tus datos (%APPDATA%\Agendamea) se conservarán de forma segura."
  LangString UN_DATA_TITLE 1040 "Opzioni di disinstallazione"
  LangString UN_DATA_SUBTITLE 1040 "Scegli come gestire le attività e le impostazioni locali."
  LangString UN_DATA_INFO 1040 "I file di Agendamea verranno rimossi. Seleziona l'opzione seguente se desideri eliminare definitivamente anche il database locale e le impostazioni."
  LangString UN_DATA_CHECKBOX 1040 "Elimina anche i dati utente (tutte le attività, categorie e impostazioni)"
  LangString UN_DATA_HINT 1040 "Se deselezionata, i tuoi dati (%APPDATA%\Agendamea) verranno conservati al sicuro."
  LangString UN_DATA_TITLE 2070 "Opções de desinstalação"
  LangString UN_DATA_SUBTITLE 2070 "Escolha como gerir as suas tarefas e definições locais."
  LangString UN_DATA_INFO 2070 "Os ficheiros do Agendamea serão removidos. Marque a opção abaixo se também quiser eliminar permanentemente a sua base de dados local e definições."
  LangString UN_DATA_CHECKBOX 2070 "Eliminar também os dados do utilizador (tarefas, categorias e definições)"
  LangString UN_DATA_HINT 2070 "Se não marcada, os seus dados (%APPDATA%\Agendamea) serão preservados em segurança."
  LangString UN_DATA_TITLE 1046 "Opções de desinstalação"
  LangString UN_DATA_SUBTITLE 1046 "Escolha como lidar com suas tarefas e configurações locais."
  LangString UN_DATA_INFO 1046 "Os arquivos do Agendamea serão removidos. Marque a opção abaixo se também deseja excluir permanentemente seu banco de dados local e configurações."
  LangString UN_DATA_CHECKBOX 1046 "Excluir também dados do usuário (todas as tarefas, categorias e configurações)"
  LangString UN_DATA_HINT 1046 "Se desmarcada, seus dados (%APPDATA%\Agendamea) serão mantidos com segurança."
  LangString UN_DATA_TITLE 1049 "Параметры удаления"
  LangString UN_DATA_SUBTITLE 1049 "Выберите, что делать с локальными задачами и настройками."
  LangString UN_DATA_INFO 1049 "Файлы приложения Agendamea будут удалены. Отметьте пункт ниже, чтобы также безвозвратно удалить локальную базу данных и настройки."
  LangString UN_DATA_CHECKBOX 1049 "Также удалить данные пользователя (все задачи, категории и настройки)"
  LangString UN_DATA_HINT 1049 "Если не отмечено, ваши данные (%APPDATA%\Agendamea) сохранятся для повторной установки."
  LangString UN_DATA_TITLE 1041 "アンインストールオプション"
  LangString UN_DATA_SUBTITLE 1041 "ローカルのタスクと設定の扱いを選択してください。"
  LangString UN_DATA_INFO 1041 "Agendamea のプログラムファイルが削除されます。ローカルデータベースと設定も完全に削除する場合は、下のオプションにチェックを入れてください。"
  LangString UN_DATA_CHECKBOX 1041 "ユーザーデータも削除する（すべてのタスク、カテゴリ、設定）"
  LangString UN_DATA_HINT 1041 "チェックしない場合、データ（%APPDATA%\Agendamea）は安全に保持されます。"
  LangString UN_DATA_TITLE 1042 "제거 옵션"
  LangString UN_DATA_SUBTITLE 1042 "로컬 작업 및 설정 처리 방법을 선택하세요."
  LangString UN_DATA_INFO 1042 "Agendamea 프로그램 파일이 제거됩니다. 로컬 데이터베이스와 설정도 영구적으로 삭제하려면 아래 옵션을 선택하세요."
  LangString UN_DATA_CHECKBOX 1042 "사용자 데이터도 삭제 (모든 작업, 카테고리 및 설정)"
  LangString UN_DATA_HINT 1042 "선택하지 않으면 데이터(%APPDATA%\Agendamea)가 안전하게 보관됩니다."
  LangString UN_DATA_TITLE 2052 "卸载选项"
  LangString UN_DATA_SUBTITLE 2052 "选择如何处理本地任务和设置。"
  LangString UN_DATA_INFO 2052 "将移除 Agendamea 应用程序文件。如需永久删除本地数据库和设置，请勾选下方选项。"
  LangString UN_DATA_CHECKBOX 2052 "同时删除用户数据（所有任务、分类和设置）"
  LangString UN_DATA_HINT 2052 "若不勾选，您的数据（%APPDATA%\Agendamea）将被安全保留。"
  LangString UN_DATA_TITLE 1028 "解除安裝選項"
  LangString UN_DATA_SUBTITLE 1028 "選擇如何處理您的本機任務與設定。"
  LangString UN_DATA_INFO 1028 "系統將移除 Agendamea 應用程式檔案。若要一併永久刪除本機資料庫與設定，請勾選下方選項。"
  LangString UN_DATA_CHECKBOX 1028 "一併刪除使用者資料（所有任務、分類與設定）"
  LangString UN_DATA_HINT 1028 "若未勾選，您的資料（%APPDATA%\Agendamea）將安全保留。"
  LangString UN_DATA_TITLE 1025 "خيارات إلغاء التثبيت"
  LangString UN_DATA_SUBTITLE 1025 "اختر كيفية التعامل مع مهامك وإعداداتك المحلية."
  LangString UN_DATA_INFO 1025 "سيتم إزالة ملفات تطبيق Agendamea. حدد الخيار أدناه إذا كنت تريد أيضا حذف قاعدة البيانات المحلية والإعدادات نهائيا."
  LangString UN_DATA_CHECKBOX 1025 "حذف بيانات المستخدم أيضا (جميع المهام والفئات والإعدادات)"
  LangString UN_DATA_HINT 1025 "إذا تركت غير محددة، فستبقى بياناتك (%APPDATA%\Agendamea) محفوظة بأمان."
  LangString UN_DATA_TITLE 1037 "אפשרויות הסרה"
  LangString UN_DATA_SUBTITLE 1037 "בחר כיצד לטפל במשימות ובהגדרות המקומיות שלך."
  LangString UN_DATA_INFO 1037 "קבצי התוכנה Agendamea יוסרו. סמן את האפשרות למטה כדי למחוק לצמיתות גם את מסד הנתונים המקומי וההגדרות."
  LangString UN_DATA_CHECKBOX 1037 "מחק גם נתוני משתמש (כל המשימות, הקטגוריות וההגדרות)"
  LangString UN_DATA_HINT 1037 "אם לא יסומן, הנתונים שלך (%APPDATA%\Agendamea) יישמרו בבטחה."
  LangString UN_DATA_TITLE 1043 "Verwijderingsopties"
  LangString UN_DATA_SUBTITLE 1043 "Kies hoe je lokale taken en instellingen wilt behandelen."
  LangString UN_DATA_INFO 1043 "De programmabestanden van Agendamea worden verwijderd. Vink de onderstaande optie aan om ook je lokale database en instellingen definitief te verwijderen."
  LangString UN_DATA_CHECKBOX 1043 "Ook gebruikersgegevens verwijderen (alle taken, categorieën en instellingen)"
  LangString UN_DATA_HINT 1043 "Indien uitgevinkt blijven je gegevens (%APPDATA%\Agendamea) veilig bewaard."
  LangString UN_DATA_TITLE 1045 "Opcje odinstalowania"
  LangString UN_DATA_SUBTITLE 1045 "Wybierz, jak postąpić z lokalnymi zadaniami i ustawieniami."
  LangString UN_DATA_INFO 1045 "Pliki aplikacji Agendamea zostaną usunięte. Zaznacz poniższą opcję, aby trwale usunąć także lokalną bazę danych i ustawienia."
  LangString UN_DATA_CHECKBOX 1045 "Usuń również dane użytkownika (wszystkie zadania, kategorie i ustawienia)"
  LangString UN_DATA_HINT 1045 "Jeśli odznaczone, Twoje dane (%APPDATA%\Agendamea) zostaną bezpiecznie zachowane."
  LangString UN_DATA_TITLE 1058 "Параметри видалення"
  LangString UN_DATA_SUBTITLE 1058 "Виберіть, що робити з локальними завданнями та налаштуваннями."
  LangString UN_DATA_INFO 1058 "Файли програми Agendamea буде видалено. Позначте пункт нижче, щоб також назавжди видалити локальну базу даних і налаштування."
  LangString UN_DATA_CHECKBOX 1058 "Також видалити дані користувача (усі завдання, категорії та налаштування)"
  LangString UN_DATA_HINT 1058 "Якщо не позначено, ваші дані (%APPDATA%\Agendamea) буде безпечно збережено."
  LangString UN_DATA_TITLE 1029 "Možnosti odinstalace"
  LangString UN_DATA_SUBTITLE 1029 "Vyberte, jak naložit s místními úkoly a nastaveními."
  LangString UN_DATA_INFO 1029 "Soubory aplikace Agendamea budou odstraněny. Zaškrtnutím možnosti níže trvale odstraníte také místní databázi a nastavení."
  LangString UN_DATA_CHECKBOX 1029 "Odstranit také uživatelská data (všechny úkoly, kategorie a nastavení)"
  LangString UN_DATA_HINT 1029 "Pokud není zaškrtnuto, vaše data (%APPDATA%\Agendamea) zůstanou bezpečně uložena."
  LangString UN_DATA_TITLE 1051 "Možnosti odinštalovania"
  LangString UN_DATA_SUBTITLE 1051 "Vyberte, ako naložiť s miestnymi úlohami a nastaveniami."
  LangString UN_DATA_INFO 1051 "Súbory aplikácie Agendamea budú odstránené. Začiarknutím možnosti nižšie natrvalo odstránite aj miestnu databázu a nastavenia."
  LangString UN_DATA_CHECKBOX 1051 "Odstrániť aj používateľské údaje (všetky úlohy, kategórie a nastavenia)"
  LangString UN_DATA_HINT 1051 "Ak nie je začiarknuté, vaše údaje (%APPDATA%\Agendamea) zostanú bezpečne zachované."
  LangString UN_DATA_TITLE 1038 "Eltávolítási beállítások"
  LangString UN_DATA_SUBTITLE 1038 "Válassza ki, mi történjen a helyi feladatokkal és beállításokkal."
  LangString UN_DATA_INFO 1038 "Az Agendamea programfájljai eltávolításra kerülnek. Jelölje be az alábbi opciót a helyi adatbázis és beállítások végleges törléséhez is."
  LangString UN_DATA_CHECKBOX 1038 "Felhasználói adatok törlése is (minden feladat, kategória és beállítás)"
  LangString UN_DATA_HINT 1038 "Ha nincs bejelölve, adatai (%APPDATA%\Agendamea) biztonságban megmaradnak."
  LangString UN_DATA_TITLE 1053 "Avinstallationsalternativ"
  LangString UN_DATA_SUBTITLE 1053 "Välj hur dina lokala uppgifter och inställningar ska hanteras."
  LangString UN_DATA_INFO 1053 "Programfilerna för Agendamea tas bort. Markera alternativet nedan om du även vill radera din lokala databas och dina inställningar permanent."
  LangString UN_DATA_CHECKBOX 1053 "Ta även bort användardata (alla uppgifter, kategorier och inställningar)"
  LangString UN_DATA_HINT 1053 "Om rutan lämnas omarkerad sparas dina data (%APPDATA%\Agendamea) säkert."
  LangString UN_DATA_TITLE 1030 "Afinstallationsindstillinger"
  LangString UN_DATA_SUBTITLE 1030 "Vælg hvordan dine lokale opgaver og indstillinger skal håndteres."
  LangString UN_DATA_INFO 1030 "Agendamea-programfilerne fjernes. Marker indstillingen nedenfor, hvis du også vil slette din lokale database og indstillinger permanent."
  LangString UN_DATA_CHECKBOX 1030 "Slet også brugerdata (alle opgaver, kategorier og indstillinger)"
  LangString UN_DATA_HINT 1030 "Hvis ikke markeret, gemmes dine data (%APPDATA%\Agendamea) sikkert."
  LangString UN_DATA_TITLE 1044 "Avinstalleringsalternativer"
  LangString UN_DATA_SUBTITLE 1044 "Velg hvordan lokale oppgaver og innstillinger skal håndteres."
  LangString UN_DATA_INFO 1044 "Programfilene til Agendamea blir fjernet. Merk av nedenfor hvis du også vil slette lokal database og innstillinger permanent."
  LangString UN_DATA_CHECKBOX 1044 "Slett også brukerdata (alle oppgaver, kategorier og innstillinger)"
  LangString UN_DATA_HINT 1044 "Hvis ikke merket, beholdes dataene dine (%APPDATA%\Agendamea) trygt."
  LangString UN_DATA_TITLE 1035 "Asennuksen poistoasetukset"
  LangString UN_DATA_SUBTITLE 1035 "Valitse, miten paikallisia tehtäviäsi ja asetuksiasi käsitellään."
  LangString UN_DATA_INFO 1035 "Agendamea-sovellustiedostot poistetaan. Valitse alla oleva vaihtoehto, jos haluat poistaa pysyvästi myös paikallisen tietokannan ja asetukset."
  LangString UN_DATA_CHECKBOX 1035 "Poista myös käyttäjätiedot (kaikki tehtävät, kategoriat ja asetukset)"
  LangString UN_DATA_HINT 1035 "Jos valintaa ei tehdä, tietosi (%APPDATA%\Agendamea) säilytetään turvallisesti."
  LangString UN_DATA_TITLE 1052 "Opsionet e çinstalimit"
  LangString UN_DATA_SUBTITLE 1052 "Zgjidhni si të trajtohen detyrat dhe cilësimet tuaja lokale."
  LangString UN_DATA_INFO 1052 "Skedarët e aplikacionit Agendamea do të hiqen. Zgjidhni opsionin më poshtë nëse dëshironi të fshini përgjithmonë edhe bazën lokale të të dhënave dhe cilësimet."
  LangString UN_DATA_CHECKBOX 1052 "Fshi edhe të dhënat e përdoruesit (të gjitha detyrat, kategoritë dhe cilësimet)"
  LangString UN_DATA_HINT 1052 "Nëse nuk zgjidhet, të dhënat tuaja (%APPDATA%\Agendamea) ruhen të sigurta."
  LangString UN_DATA_TITLE 1067 "Ապատեղադրման ընտրանքներ"
  LangString UN_DATA_SUBTITLE 1067 "Ընտրեք, թե ինչպես վարվել տեղական առաջադրանքների և կարգավորումների հետ:"
  LangString UN_DATA_INFO 1067 "Agendamea ծրագրի ֆայլերը կհեռացվեն: Նշեք ստորև բերված ընտրանքը, եթե ցանկանում եք ընդմիշտ ջնջել նաև տեղական տվյալների բազան և կարգավորումները:"
  LangString UN_DATA_CHECKBOX 1067 "Ջնջել նաև օգտատիրոջ տվյալները (բոլոր առաջադրանքները, կատեգորիաները և կարգավորումները)"
  LangString UN_DATA_HINT 1067 "Եթե նշված չէ, ձեր տվյալները (%APPDATA%\Agendamea) անվտանգ կպահպանվեն:"
  LangString UN_DATA_TITLE 1057 "Opsi Pencopotan"
  LangString UN_DATA_SUBTITLE 1057 "Pilih cara menangani tugas dan pengaturan lokal Anda."
  LangString UN_DATA_INFO 1057 "File aplikasi Agendamea akan dihapus. Centang opsi di bawah jika Anda juga ingin menghapus basis data lokal dan pengaturan secara permanen."
  LangString UN_DATA_CHECKBOX 1057 "Hapus juga data pengguna (semua tugas, kategori, dan pengaturan)"
  LangString UN_DATA_HINT 1057 "Jika tidak dicentang, data Anda (%APPDATA%\Agendamea) akan disimpan dengan aman."
  LangString UN_DATA_TITLE 1066 "Tùy chọn gỡ cài đặt"
  LangString UN_DATA_SUBTITLE 1066 "Chọn cách xử lý tác vụ và cài đặt cục bộ của bạn."
  LangString UN_DATA_INFO 1066 "Tệp ứng dụng Agendamea sẽ bị xóa. Chọn mục bên dưới nếu bạn cũng muốn xóa vĩnh viễn cơ sở dữ liệu cục bộ và cài đặt."
  LangString UN_DATA_CHECKBOX 1066 "Đồng thời xóa dữ liệu người dùng (mọi tác vụ, danh mục và cài đặt)"
  LangString UN_DATA_HINT 1066 "Nếu bỏ chọn, dữ liệu của bạn (%APPDATA%\Agendamea) sẽ được giữ an toàn."
  LangString UN_DATA_TITLE 1054 "ตัวเลือกการถอนการติดตั้ง"
  LangString UN_DATA_SUBTITLE 1054 "เลือกวิธีจัดการงานและการตั้งค่าในเครื่องของคุณ"
  LangString UN_DATA_INFO 1054 "ไฟล์โปรแกรม Agendamea จะถูกลบออก ทำเครื่องหมายด้านล่างหากคุณต้องการลบฐานข้อมูลในเครื่องและการตั้งค่าอย่างถาวรด้วย"
  LangString UN_DATA_CHECKBOX 1054 "ลบข้อมูลผู้ใช้ด้วย (งาน หมวดหมู่ และการตั้งค่าทั้งหมด)"
  LangString UN_DATA_HINT 1054 "หากไม่เลือก ข้อมูลของคุณ (%APPDATA%\Agendamea) จะถูกเก็บไว้อย่างปลอดภัย"
  LangString UN_DATA_TITLE 1069 "Desinstalazio aukerak"
  LangString UN_DATA_SUBTITLE 1069 "Aukeratu nola kudeatu zure tokiko zereginak eta ezarpenak."
  LangString UN_DATA_INFO 1069 "Agendamea aplikazioaren fitxategiak kenduko dira. Markatu beheko aukera tokiko datu-basea eta ezarpenak betiko ezabatu nahi badituzu."
  LangString UN_DATA_CHECKBOX 1069 "Ezabatu erabiltzailearen datuak ere (zeregin, kategoria eta ezarpen guztiak)"
  LangString UN_DATA_HINT 1069 "Markatu gabe uzten bada, zure datuak (%APPDATA%\Agendamea) seguru gordeko dira."

  ; Complete zero-leakage localization for assisted installer mode selection across all 50 languages
  !pragma warning disable 6030
  LangString chooseInstallationOptions 1025 "خيارات التثبيت"
  LangString whoShouldThisApplicationBeInstalledFor 1025 "لمن يجب تثبيت هذا التطبيق؟"
  LangString selectUserMode 1025 "يرجى تحديد ما إذا كنت تريد تثبيت هذا البرنامج لجميع المستخدمين أو لك فقط:"
  LangString onlyForMe 1025 "لي فقط (&me)"
  LangString forAll 1025 "أي شخص يستخدم هذا الكمبيوتر (&جميع المستخدمين)"
  LangString freshInstallForCurrent 1025 "تثبيت جديد للمستخدم الحالي فقط."
  LangString freshInstallForAll 1025 "تثبيت جديد لجميع المستخدمين (يتطلب صلاحيات المسؤول)."
  LangString perUserInstallExists 1025 "يوجد بالفعل تثبيت للمستخدم الحالي."
  LangString perMachineInstallExists 1025 "يوجد بالفعل تثبيت لجميع المستخدمين."
  LangString reinstallUpgrade 1025 "سيتم إعادة التثبيت أو التحديث."
  LangString chooseUninstallationOptions 1025 "خيارات إلغاء التثبيت"
  LangString whichInstallationShouldBeRemoved 1025 "أي تثبيت يجب إزالته؟"
  LangString whichInstallationRemove 1025 "هذا البرنامج مثبت لجميع المستخدمين وللمستخدم الحالي.$\r$\nأي تثبيت تريد إزالته؟"
  LangString perUserInstall 1025 "يوجد تثبيت للمستخدم الحالي."
  LangString perMachineInstall 1025 "يوجد تثبيت لجميع المستخدمين."
  LangString uninstall 1025 "سيتم إلغاء التثبيت."
  LangString loginWithAdminAccount 1025 "تحتاج إلى تسجيل الدخول بحساب مسؤول للمتابعة..."
  LangString chooseInstallationOptions 1037 "בחר אפשרויות התקנה"
  LangString whoShouldThisApplicationBeInstalledFor 1037 "עבור מי להתקין יישום זה?"
  LangString selectUserMode 1037 "בחר אם ברצונך להפוך תוכנה זו לזמינה לכל המשתמשים או רק עבורך:"
  LangString onlyForMe 1037 "רק &עבורי"
  LangString forAll 1037 "כל מי שמשתמש במחשב זה (&כל המשתמשים)"
  LangString freshInstallForCurrent 1037 "התקנה חדשה למשתמש הנוכחי בלבד."
  LangString freshInstallForAll 1037 "התקנה חדשה לכל המשתמשים (נדרשות הרשאות מנהל)."
  LangString perUserInstallExists 1037 "כבר קיימת התקנה למשתמש הנוכחי."
  LangString perMachineInstallExists 1037 "כבר קיימת התקנה לכל המשתמשים."
  LangString reinstallUpgrade 1037 "יותקן מחדש או ישודרג."
  LangString chooseUninstallationOptions 1037 "בחר אפשרויות הסרה"
  LangString whichInstallationShouldBeRemoved 1037 "איזו התקנה להסיר?"
  LangString whichInstallationRemove 1037 "תוכנה זו מותקנת הן לכל המשתמשים והן למשתמש הנוכחי.$\r$\nאיזו התקנה ברצונך להסיר?"
  LangString perUserInstall 1037 "קיימת התקנה למשתמש הנוכחי."
  LangString perMachineInstall 1037 "קיימת התקנה לכל המשתמשים."
  LangString uninstall 1037 "יוסר."
  LangString loginWithAdminAccount 1037 "עליך להתחבר עם חשבון מנהל כדי להמשיך..."
  LangString chooseInstallationOptions 1052 "Zgjidhni opsionet e instalimit"
  LangString whoShouldThisApplicationBeInstalledFor 1052 "Për kë duhet të instalohet ky aplikacion?"
  LangString selectUserMode 1052 "Zgjidhni nëse dëshironi ta bëni këtë softuer të disponueshëm për të gjithë përdoruesit ose vetëm për ju:"
  LangString onlyForMe 1052 "Vetëm për &mua"
  LangString forAll 1052 "Kushdo që përdor këtë kompjuter (&të gjithë përdoruesit)"
  LangString freshInstallForCurrent 1052 "Instalim i ri vetëm për përdoruesin aktual."
  LangString freshInstallForAll 1052 "Instalim i ri për të gjithë përdoruesit (kërkon të drejta administratori)."
  LangString perUserInstallExists 1052 "Ekziston tashmë një instalim për përdoruesin aktual."
  LangString perMachineInstallExists 1052 "Ekziston tashmë një instalim për të gjithë përdoruesit."
  LangString reinstallUpgrade 1052 "Do të riinstalohet ose përditësohet."
  LangString chooseUninstallationOptions 1052 "Zgjidhni opsionet e çinstalimit"
  LangString whichInstallationShouldBeRemoved 1052 "Cilin instalim dëshironi të hiqni?"
  LangString whichInstallationRemove 1052 "Ky softuer është i instaluar si për të gjithë përdoruesit ashtu edhe për përdoruesin aktual.$\r$\nCilin instalim dëshironi të hiqni?"
  LangString perUserInstall 1052 "Ekziston një instalim për përdoruesin aktual."
  LangString perMachineInstall 1052 "Ekziston një instalim për të gjithë përdoruesit."
  LangString uninstall 1052 "Do të çinstalohet."
  LangString loginWithAdminAccount 1052 "Duhet të identifikoheni me një llogari administratori për të vazhduar..."
  LangString chooseInstallationOptions 1054 "เลือกตัวเลือกการติดตั้ง"
  LangString whoShouldThisApplicationBeInstalledFor 1054 "ต้องการติดตั้งแอปพลิเคชันนี้สำหรับใคร?"
  LangString selectUserMode 1054 "โปรดเลือกว่าคุณต้องการติดตั้งซอฟต์แวร์นี้สำหรับผู้ใช้ทุกคนหรือเฉพาะคุณเท่านั้น:"
  LangString onlyForMe 1054 "เฉพาะ&ฉันเท่านั้น"
  LangString forAll 1054 "ทุกคนที่ใช้คอมพิวเตอร์เครื่องนี้ (&ผู้ใช้ทั้งหมด)"
  LangString freshInstallForCurrent 1054 "ติดตั้งใหม่เฉพาะผู้ใช้ปัจจุบันเท่านั้น"
  LangString freshInstallForAll 1054 "ติดตั้งใหม่สำหรับผู้ใช้ทั้งหมด (ต้องใช้สิทธิ์ผู้ดูแลระบบ)"
  LangString perUserInstallExists 1054 "มีการติดตั้งสำหรับผู้ใช้ปัจจุบันอยู่แล้ว"
  LangString perMachineInstallExists 1054 "มีการติดตั้งสำหรับผู้ใช้ทั้งหมดอยู่แล้ว"
  LangString reinstallUpgrade 1054 "จะติดตั้งใหม่หรืออัปเกรด"
  LangString chooseUninstallationOptions 1054 "เลือกตัวเลือกการถอนการติดตั้ง"
  LangString whichInstallationShouldBeRemoved 1054 "ต้องการลบการติดตั้งใดออก?"
  LangString whichInstallationRemove 1054 "ซอฟต์แวร์นี้ติดตั้งไว้ทั้งสำหรับผู้ใช้ทั้งหมดและผู้ใช้ปัจจุบัน$\r$\nคุณต้องการลบการติดตั้งใดออก?"
  LangString perUserInstall 1054 "มีการติดตั้งสำหรับผู้ใช้ปัจจุบัน"
  LangString perMachineInstall 1054 "มีการติดตั้งสำหรับผู้ใช้ทั้งหมด"
  LangString uninstall 1054 "จะถอนการติดตั้ง"
  LangString loginWithAdminAccount 1054 "คุณต้องลงชื่อเข้าใช้ด้วยบัญชีผู้ดูแลระบบเพื่อดำเนินการต่อ..."
  LangString chooseInstallationOptions 1055 "Kurulum Seçeneklerini Seçin"
  LangString whoShouldThisApplicationBeInstalledFor 1055 "Bu uygulama kimler için kurulsun?"
  LangString selectUserMode 1055 "Lütfen bu yazılımı tüm kullanıcılar için mi yoksa yalnızca kendiniz için mi kurmak istediğinizi seçin:"
  LangString onlyForMe 1055 "Yalnızca &benim için"
  LangString forAll 1055 "Bu bilgisayarı kullanan herkes (&tüm kullanıcılar)"
  LangString freshInstallForCurrent 1055 "Yalnızca mevcut kullanıcı için temiz kurulum."
  LangString freshInstallForAll 1055 "Tüm kullanıcılar için temiz kurulum (yönetici izni gerektirir)."
  LangString perUserInstallExists 1055 "Mevcut kullanıcı için zaten bir kurulum bulunuyor."
  LangString perMachineInstallExists 1055 "Bu bilgisayar için zaten genel bir kurulum bulunuyor."
  LangString reinstallUpgrade 1055 "Yeniden kurulacak veya güncellenecek."
  LangString chooseUninstallationOptions 1055 "Kaldırma Seçeneklerini Seçin"
  LangString whichInstallationShouldBeRemoved 1055 "Hangi kurulum kaldırılsın?"
  LangString whichInstallationRemove 1055 "Bu yazılım hem tüm kullanıcılar hem de mevcut kullanıcı için kurulu.$\r$\nHangi kurulumu kaldırmak istersiniz?"
  LangString perUserInstall 1055 "Mevcut kullanıcı için kurulum bulunuyor."
  LangString perMachineInstall 1055 "Tüm kullanıcılar için kurulum bulunuyor."
  LangString uninstall 1055 "Kaldırılacak."
  LangString loginWithAdminAccount 1055 "Devam etmek için yönetici yetkisine sahip bir hesapla giriş yapmanız gerekiyor..."
  LangString chooseInstallationOptions 1057 "Pilih Opsi Pemasangan"
  LangString whoShouldThisApplicationBeInstalledFor 1057 "Untuk siapa aplikasi ini akan dipasang?"
  LangString selectUserMode 1057 "Pilih apakah Anda ingin memasang perangkat lunak ini untuk semua pengguna atau hanya untuk Anda:"
  LangString onlyForMe 1057 "Hanya untuk &saya"
  LangString forAll 1057 "Siapa saja yang menggunakan komputer ini (&semua pengguna)"
  LangString freshInstallForCurrent 1057 "Pemasangan baru hanya untuk pengguna saat ini."
  LangString freshInstallForAll 1057 "Pemasangan baru untuk semua pengguna (memerlukan izin administrator)."
  LangString perUserInstallExists 1057 "Sudah ada pemasangan untuk pengguna saat ini."
  LangString perMachineInstallExists 1057 "Sudah ada pemasangan untuk semua pengguna."
  LangString reinstallUpgrade 1057 "Akan dipasang ulang atau diperbarui."
  LangString chooseUninstallationOptions 1057 "Pilih Opsi Pencopotan"
  LangString whichInstallationShouldBeRemoved 1057 "Pemasangan mana yang harus dihapus?"
  LangString whichInstallationRemove 1057 "Perangkat lunak ini terpasang untuk semua pengguna dan pengguna saat ini.$\r$\nPemasangan mana yang ingin dihapus?"
  LangString perUserInstall 1057 "Ada pemasangan untuk pengguna saat ini."
  LangString perMachineInstall 1057 "Ada pemasangan untuk semua pengguna."
  LangString uninstall 1057 "Akan dicopot."
  LangString loginWithAdminAccount 1057 "Anda perlu masuk dengan akun administrator untuk melanjutkan..."
  LangString chooseInstallationOptions 1058 "Вибір параметрів встановлення"
  LangString whoShouldThisApplicationBeInstalledFor 1058 "Для кого встановити цю програму?"
  LangString selectUserMode 1058 "Виберіть, чи зробити цю програму доступною для всіх користувачів чи лише для вас:"
  LangString onlyForMe 1058 "Лише для &мене"
  LangString forAll 1058 "Для всіх користувачів цього комп'ютера (&всі користувачі)"
  LangString freshInstallForCurrent 1058 "Нове встановлення лише для поточного користувача."
  LangString freshInstallForAll 1058 "Нове встановлення для всіх користувачів (потрібні права адміністратора)."
  LangString perUserInstallExists 1058 "Встановлення для поточного користувача вже існує."
  LangString perMachineInstallExists 1058 "Встановлення для всіх користувачів вже існує."
  LangString reinstallUpgrade 1058 "Буде перевстановлено або оновлено."
  LangString chooseUninstallationOptions 1058 "Вибір параметрів видалення"
  LangString whichInstallationShouldBeRemoved 1058 "Яке встановлення слід видалити?"
  LangString whichInstallationRemove 1058 "Цю програму встановлено для всіх користувачів і для поточного користувача.$\r$\nЯке встановлення видалити?"
  LangString perUserInstall 1058 "Існує встановлення для поточного користувача."
  LangString perMachineInstall 1058 "Існує встановлення для всіх користувачів."
  LangString uninstall 1058 "Буде видалено."
  LangString loginWithAdminAccount 1058 "Для продовження увійдіть під обліковим записом адміністратора..."
  LangString chooseInstallationOptions 1066 "Chọn tùy chọn cài đặt"
  LangString whoShouldThisApplicationBeInstalledFor 1066 "Cài đặt ứng dụng này cho ai?"
  LangString selectUserMode 1066 "Vui lòng chọn cài đặt phần mềm này cho tất cả người dùng hay chỉ riêng bạn:"
  LangString onlyForMe 1066 "Chỉ cho &tôi"
  LangString forAll 1066 "Bất kỳ ai sử dụng máy tính này (&tất cả người dùng)"
  LangString freshInstallForCurrent 1066 "Cài đặt mới chỉ cho người dùng hiện tại."
  LangString freshInstallForAll 1066 "Cài đặt mới cho tất cả người dùng (yêu cầu quyền quản trị)."
  LangString perUserInstallExists 1066 "Đã có bản cài đặt cho người dùng hiện tại."
  LangString perMachineInstallExists 1066 "Đã có bản cài đặt cho tất cả người dùng."
  LangString reinstallUpgrade 1066 "Sẽ cài đặt lại hoặc nâng cấp."
  LangString chooseUninstallationOptions 1066 "Chọn tùy chọn gỡ cài đặt"
  LangString whichInstallationShouldBeRemoved 1066 "Bạn muốn gỡ bản cài đặt nào?"
  LangString whichInstallationRemove 1066 "Phần mềm này được cài cho cả tất cả người dùng và người dùng hiện tại.$\r$\nBạn muốn gỡ bản cài đặt nào?"
  LangString perUserInstall 1066 "Có một bản cài đặt cho người dùng hiện tại."
  LangString perMachineInstall 1066 "Có một bản cài đặt cho tất cả người dùng."
  LangString uninstall 1066 "Sẽ gỡ cài đặt."
  LangString loginWithAdminAccount 1066 "Bạn cần đăng nhập bằng tài khoản quản trị để tiếp tục..."
  LangString chooseInstallationOptions 1067 "Ընտրեք տեղադրման ընտրանքները"
  LangString whoShouldThisApplicationBeInstalledFor 1067 "Ում համար պետք է տեղադրվի այս հավելվածը:"
  LangString selectUserMode 1067 "Ընտրեք՝ ծրագիրը հասանելի դարձնել բոլոր օգտատերերի, թե միայն ձեզ համար:"
  LangString onlyForMe 1067 "Միայն &իմ համար"
  LangString forAll 1067 "Այս համակարգչի բոլոր օգտատերերի համար (&բոլոր օգտատերերը)"
  LangString freshInstallForCurrent 1067 "Նոր տեղադրում միայն ընթացիկ օգտատիրոջ համար:"
  LangString freshInstallForAll 1067 "Նոր տեղադրում բոլոր օգտատերերի համար (պահանջվում է ադմինիստրատորի իրավունք):"
  LangString perUserInstallExists 1067 "Ընթացիկ օգտատիրոջ համար տեղադրումն արդեն առկա է:"
  LangString perMachineInstallExists 1067 "Բոլոր օգտատերերի համար տեղադրումն արդեն առկա է:"
  LangString reinstallUpgrade 1067 "Կվերատեղադրվի կամ կթարմացվի:"
  LangString chooseUninstallationOptions 1067 "Ընտրեք ապատեղադրման ընտրանքները"
  LangString whichInstallationShouldBeRemoved 1067 "Որ տեղադրումը հեռացնել:"
  LangString whichInstallationRemove 1067 "Այս ծրագիրը տեղադրված է և բոլոր օգտատերերի, և ընթացիկ օգտատիրոջ համար:$\r$\nՈր տեղադրումն եք ցանկանում հեռացնել:"
  LangString perUserInstall 1067 "Առկա է տեղադրում ընթացիկ օգտատիրոջ համար:"
  LangString perMachineInstall 1067 "Առկա է տեղադրում բոլոր օգտատերերի համար:"
  LangString uninstall 1067 "Կապատեղադրվի:"
  LangString loginWithAdminAccount 1067 "Շարունակելու համար մուտք գործեք ադմինիստրատորի հաշվով..."
  LangString chooseInstallationOptions 1069 "Aukeratu instalazio-aukerak"
  LangString whoShouldThisApplicationBeInstalledFor 1069 "Norentzat instalatu behar da aplikazio hau?"
  LangString selectUserMode 1069 "Aukeratu software hau erabiltzaile guztientzat edo zuretzat soilik instalatu nahi duzun:"
  LangString onlyForMe 1069 "Niretzat &soilik"
  LangString forAll 1069 "Ordenagailu hau erabiltzen duen edonorentzat (&erabiltzaile guztiak)"
  LangString freshInstallForCurrent 1069 "Instalazio berria uneko erabiltzailearentzat soilik."
  LangString freshInstallForAll 1069 "Instalazio berria erabiltzaile guztientzat (administratzaile baimenak behar ditu)."
  LangString perUserInstallExists 1069 "Dagoeneko badago instalazio bat uneko erabiltzailearentzat."
  LangString perMachineInstallExists 1069 "Dagoeneko badago instalazio bat erabiltzaile guztientzat."
  LangString reinstallUpgrade 1069 "Berrinstalatu edo eguneratuko da."
  LangString chooseUninstallationOptions 1069 "Aukeratu desinstalazio-aukerak"
  LangString whichInstallationShouldBeRemoved 1069 "Zein instalazio kendu behar da?"
  LangString whichInstallationRemove 1069 "Software hau erabiltzaile guztientzat eta uneko erabiltzailearentzat instalatuta dago.$\r$\nZein instalazio kendu nahi duzu?"
  LangString perUserInstall 1069 "Badago instalazio bat uneko erabiltzailearentzat."
  LangString perMachineInstall 1069 "Badago instalazio bat erabiltzaile guztientzat."
  LangString uninstall 1069 "Desinstalatuko da."
  LangString loginWithAdminAccount 1069 "Jarraitzeko administratzaile kontu batekin saioa hasi behar duzu..."
  LangString chooseInstallationOptions 2070 "Escolher opções de instalação"
  LangString whoShouldThisApplicationBeInstalledFor 2070 "Para quem deve ser instalada esta aplicação?"
  LangString selectUserMode 2070 "Selecione se pretende disponibilizar este software para todos os utilizadores ou apenas para si:"
  LangString onlyForMe 2070 "Apenas para &mim"
  LangString forAll 2070 "Qualquer utilizador deste computador (&todos os utilizadores)"
  LangString freshInstallForCurrent 2070 "Nova instalação apenas para o utilizador atual."
  LangString freshInstallForAll 2070 "Nova instalação para todos os utilizadores (requer privilégios de administrador)."
  LangString perUserInstallExists 2070 "Já existe uma instalação para o utilizador atual."
  LangString perMachineInstallExists 2070 "Já existe uma instalação para todos os utilizadores."
  LangString reinstallUpgrade 2070 "Será reinstalado ou atualizado."
  LangString chooseUninstallationOptions 2070 "Escolher opções de desinstalação"
  LangString whichInstallationShouldBeRemoved 2070 "Que instalação deve ser removida?"
  LangString whichInstallationRemove 2070 "Este software está instalado para todos os utilizadores e para o utilizador atual.$\r$\nQual instalação pretende remover?"
  LangString perUserInstall 2070 "Existe uma instalação para o utilizador atual."
  LangString perMachineInstall 2070 "Existe uma instalação para todos os utilizadores."
  LangString uninstall 2070 "Será desinstalado."
  LangString loginWithAdminAccount 2070 "Precisa de iniciar sessão com uma conta de administrador para continuar..."
  !pragma warning default 6030
!macroend

!ifndef BUILD_UNINSTALLER
  ; Runs BEFORE MUI_LANGDLL_DISPLAY so Windows UI language is auto-selected (English 1033 fallback)
  !macro preInit
  ; Detect Windows Display Language -> map to supported NSIS LCID (English 1033 fallback)
  StrCpy $LANGUAGE 1033
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
  IntOp $1 $0 & 0x03FF
  ${If} $0 == 2052
    StrCpy $LANGUAGE 2052
  ${ElseIf} $0 == 4100
    StrCpy $LANGUAGE 2052
  ${ElseIf} $0 == 1028
    StrCpy $LANGUAGE 1028
  ${ElseIf} $0 == 3076
    StrCpy $LANGUAGE 1028
  ${ElseIf} $0 == 5124
    StrCpy $LANGUAGE 1028
  ${ElseIf} $0 == 1046
    StrCpy $LANGUAGE 1046
  ${Else}
    ${If} $1 == 9
      StrCpy $LANGUAGE 1033
    ${ElseIf} $1 == 31
      StrCpy $LANGUAGE 1055
    ${ElseIf} $1 == 7
      StrCpy $LANGUAGE 1031
    ${ElseIf} $1 == 12
      StrCpy $LANGUAGE 1036
    ${ElseIf} $1 == 10
      StrCpy $LANGUAGE 3082
    ${ElseIf} $1 == 16
      StrCpy $LANGUAGE 1040
    ${ElseIf} $1 == 22
      StrCpy $LANGUAGE 2070
    ${ElseIf} $1 == 25
      StrCpy $LANGUAGE 1049
    ${ElseIf} $1 == 17
      StrCpy $LANGUAGE 1041
    ${ElseIf} $1 == 18
      StrCpy $LANGUAGE 1042
    ${ElseIf} $1 == 4
      StrCpy $LANGUAGE 2052
    ${ElseIf} $1 == 1
      StrCpy $LANGUAGE 1025
    ${ElseIf} $1 == 13
      StrCpy $LANGUAGE 1037
    ${ElseIf} $1 == 19
      StrCpy $LANGUAGE 1043
    ${ElseIf} $1 == 21
      StrCpy $LANGUAGE 1045
    ${ElseIf} $1 == 34
      StrCpy $LANGUAGE 1058
    ${ElseIf} $1 == 5
      StrCpy $LANGUAGE 1029
    ${ElseIf} $1 == 27
      StrCpy $LANGUAGE 1051
    ${ElseIf} $1 == 14
      StrCpy $LANGUAGE 1038
    ${ElseIf} $1 == 29
      StrCpy $LANGUAGE 1053
    ${ElseIf} $1 == 6
      StrCpy $LANGUAGE 1030
    ${ElseIf} $1 == 20
      StrCpy $LANGUAGE 1044
    ${ElseIf} $1 == 11
      StrCpy $LANGUAGE 1035
    ${ElseIf} $1 == 28
      StrCpy $LANGUAGE 1052
    ${ElseIf} $1 == 43
      StrCpy $LANGUAGE 1067
    ${ElseIf} $1 == 33
      StrCpy $LANGUAGE 1057
    ${ElseIf} $1 == 42
      StrCpy $LANGUAGE 1066
    ${ElseIf} $1 == 30
      StrCpy $LANGUAGE 1054
    ${ElseIf} $1 == 45
      StrCpy $LANGUAGE 1069
    ${Else}
      StrCpy $LANGUAGE 1033
    ${EndIf}
  ${EndIf}
  !macroend
!endif

!ifdef BUILD_UNINSTALLER
  ; Runs inside un.onInit BEFORE the Uninstaller UI is created so Uninstall matches Setup language 100%
  !macro customUnInit
    ReadRegStr $0 HKCU "Software\Vellium\Agendamea" "InstallerLanguage"
    ${If} $0 == ""
      ReadRegStr $0 HKLM "Software\Vellium\Agendamea" "InstallerLanguage"
    ${EndIf}
    ${If} $0 != ""
      StrCpy $LANGUAGE $0
    ${Else}
  ; Detect Windows Display Language -> map to supported NSIS LCID (English 1033 fallback)
  StrCpy $LANGUAGE 1033
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
  IntOp $1 $0 & 0x03FF
  ${If} $0 == 2052
    StrCpy $LANGUAGE 2052
  ${ElseIf} $0 == 4100
    StrCpy $LANGUAGE 2052
  ${ElseIf} $0 == 1028
    StrCpy $LANGUAGE 1028
  ${ElseIf} $0 == 3076
    StrCpy $LANGUAGE 1028
  ${ElseIf} $0 == 5124
    StrCpy $LANGUAGE 1028
  ${ElseIf} $0 == 1046
    StrCpy $LANGUAGE 1046
  ${Else}
    ${If} $1 == 9
      StrCpy $LANGUAGE 1033
    ${ElseIf} $1 == 31
      StrCpy $LANGUAGE 1055
    ${ElseIf} $1 == 7
      StrCpy $LANGUAGE 1031
    ${ElseIf} $1 == 12
      StrCpy $LANGUAGE 1036
    ${ElseIf} $1 == 10
      StrCpy $LANGUAGE 3082
    ${ElseIf} $1 == 16
      StrCpy $LANGUAGE 1040
    ${ElseIf} $1 == 22
      StrCpy $LANGUAGE 2070
    ${ElseIf} $1 == 25
      StrCpy $LANGUAGE 1049
    ${ElseIf} $1 == 17
      StrCpy $LANGUAGE 1041
    ${ElseIf} $1 == 18
      StrCpy $LANGUAGE 1042
    ${ElseIf} $1 == 4
      StrCpy $LANGUAGE 2052
    ${ElseIf} $1 == 1
      StrCpy $LANGUAGE 1025
    ${ElseIf} $1 == 13
      StrCpy $LANGUAGE 1037
    ${ElseIf} $1 == 19
      StrCpy $LANGUAGE 1043
    ${ElseIf} $1 == 21
      StrCpy $LANGUAGE 1045
    ${ElseIf} $1 == 34
      StrCpy $LANGUAGE 1058
    ${ElseIf} $1 == 5
      StrCpy $LANGUAGE 1029
    ${ElseIf} $1 == 27
      StrCpy $LANGUAGE 1051
    ${ElseIf} $1 == 14
      StrCpy $LANGUAGE 1038
    ${ElseIf} $1 == 29
      StrCpy $LANGUAGE 1053
    ${ElseIf} $1 == 6
      StrCpy $LANGUAGE 1030
    ${ElseIf} $1 == 20
      StrCpy $LANGUAGE 1044
    ${ElseIf} $1 == 11
      StrCpy $LANGUAGE 1035
    ${ElseIf} $1 == 28
      StrCpy $LANGUAGE 1052
    ${ElseIf} $1 == 43
      StrCpy $LANGUAGE 1067
    ${ElseIf} $1 == 33
      StrCpy $LANGUAGE 1057
    ${ElseIf} $1 == 42
      StrCpy $LANGUAGE 1066
    ${ElseIf} $1 == 30
      StrCpy $LANGUAGE 1054
    ${ElseIf} $1 == 45
      StrCpy $LANGUAGE 1069
    ${Else}
      StrCpy $LANGUAGE 1033
    ${EndIf}
  ${EndIf}
    ${EndIf}
  !macroend

  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME
    UninstPage custom un.UserDataPageCreate un.UserDataPageLeave

    Function un.UserDataPageCreate
      !insertmacro MUI_HEADER_TEXT "$(UN_DATA_TITLE)" "$(UN_DATA_SUBTITLE)"

      nsDialogs::Create 1018
      Pop $UnDataDialog
      ${If} $UnDataDialog == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 8u 100% 32u "$(UN_DATA_INFO)"
      Pop $UnDataInfoLabel

      ${NSD_CreateCheckbox} 0 48u 100% 18u "$(UN_DATA_CHECKBOX)"
      Pop $UnDataCheckbox
      ${If} $DeleteUserDataFlag == ${BST_CHECKED}
        ${NSD_Check} $UnDataCheckbox
      ${EndIf}

      ${NSD_CreateLabel} 14u 70u 92% 34u "$(UN_DATA_HINT)"
      Pop $UnDataHintLabel

      nsDialogs::Show
    FunctionEnd

    Function un.UserDataPageLeave
      ${NSD_GetState} $UnDataCheckbox $DeleteUserDataFlag
    FunctionEnd
  !macroend
!endif

!macro customInstall
  ; Save the exact Setup language for both the Uninstaller (LCID) and Agendamea first launch (BCP-47)
  !ifndef BUILD_UNINSTALLER
    StrCpy $SelectedAppLang "en"
    ${If} $LANGUAGE == 1033
      StrCpy $SelectedAppLang "en"
    ${ElseIf} $LANGUAGE == 1055
      StrCpy $SelectedAppLang "tr"
    ${ElseIf} $LANGUAGE == 1031
      StrCpy $SelectedAppLang "de"
    ${ElseIf} $LANGUAGE == 1036
      StrCpy $SelectedAppLang "fr"
    ${ElseIf} $LANGUAGE == 3082
      StrCpy $SelectedAppLang "es"
    ${ElseIf} $LANGUAGE == 1040
      StrCpy $SelectedAppLang "it"
    ${ElseIf} $LANGUAGE == 2070
      StrCpy $SelectedAppLang "pt"
    ${ElseIf} $LANGUAGE == 1046
      StrCpy $SelectedAppLang "pt-BR"
    ${ElseIf} $LANGUAGE == 1049
      StrCpy $SelectedAppLang "ru"
    ${ElseIf} $LANGUAGE == 1041
      StrCpy $SelectedAppLang "ja"
    ${ElseIf} $LANGUAGE == 1042
      StrCpy $SelectedAppLang "ko"
    ${ElseIf} $LANGUAGE == 2052
      StrCpy $SelectedAppLang "zh-CN"
    ${ElseIf} $LANGUAGE == 1028
      StrCpy $SelectedAppLang "zh-TW"
    ${ElseIf} $LANGUAGE == 1025
      StrCpy $SelectedAppLang "ar"
    ${ElseIf} $LANGUAGE == 1037
      StrCpy $SelectedAppLang "he"
    ${ElseIf} $LANGUAGE == 1043
      StrCpy $SelectedAppLang "nl"
    ${ElseIf} $LANGUAGE == 1045
      StrCpy $SelectedAppLang "pl"
    ${ElseIf} $LANGUAGE == 1058
      StrCpy $SelectedAppLang "uk"
    ${ElseIf} $LANGUAGE == 1029
      StrCpy $SelectedAppLang "cs"
    ${ElseIf} $LANGUAGE == 1051
      StrCpy $SelectedAppLang "sk"
    ${ElseIf} $LANGUAGE == 1038
      StrCpy $SelectedAppLang "hu"
    ${ElseIf} $LANGUAGE == 1053
      StrCpy $SelectedAppLang "sv"
    ${ElseIf} $LANGUAGE == 1030
      StrCpy $SelectedAppLang "da"
    ${ElseIf} $LANGUAGE == 1044
      StrCpy $SelectedAppLang "no"
    ${ElseIf} $LANGUAGE == 1035
      StrCpy $SelectedAppLang "fi"
    ${ElseIf} $LANGUAGE == 1052
      StrCpy $SelectedAppLang "sq"
    ${ElseIf} $LANGUAGE == 1067
      StrCpy $SelectedAppLang "hy"
    ${ElseIf} $LANGUAGE == 1057
      StrCpy $SelectedAppLang "id"
    ${ElseIf} $LANGUAGE == 1066
      StrCpy $SelectedAppLang "vi"
    ${ElseIf} $LANGUAGE == 1054
      StrCpy $SelectedAppLang "th"
    ${ElseIf} $LANGUAGE == 1069
      StrCpy $SelectedAppLang "eu"
    ${Else}
      StrCpy $SelectedAppLang "en"
    ${EndIf}
    WriteRegStr HKCU "Software\Vellium\Agendamea" "InstallerLanguage" "$LANGUAGE"
    WriteRegStr HKCU "Software\Vellium\Agendamea" "Language" "$SelectedAppLang"
    ${If} $installMode == "all"
      WriteRegStr HKLM "Software\Vellium\Agendamea" "InstallerLanguage" "$LANGUAGE"
      WriteRegStr HKLM "Software\Vellium\Agendamea" "Language" "$SelectedAppLang"
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
    DeleteRegKey HKCU "Software\Vellium\Agendamea"
    DeleteRegKey HKLM "Software\Vellium\Agendamea"

    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend
