import { EN_DICTIONARY } from './enDictionary';
import { TR_DICTIONARY } from './trDictionary';
import type { LegalDocId, LegalDocumentContent } from './types';

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
          'İsteğe bağlı Sesli Dikte ve Yerel Yapay Zeka (v1.1.0) etkinleştirildiğinde seçtiğiniz mikrofonun sesi, cihaz içi gürültü filtresi ve uyarlanabilir sessizlik algılaması (VAD) üzerinden yalnızca cihaz belleğinde (RAM) yerel Whisper.cpp motoruyla yazıya çevrilir; hiçbir ses kaydı diske veya harici sunucuya gönderilmez. Harici yerel sunucu (Ollama / LM Studio) yalnızca yerel geri döngü adresinde (127.0.0.1) iletişim kurar. İndirilen Apache 2.0 / MIT modeller yalnızca yerel uygulama veri klasöründe saklanır ve tek tıkla silinebilir.',
          'Görev hatırlatmaları, Windows masaüstü bildirimleri, Odak Modu profilleri ve özelleştirilebilir klavye kısayolları tamamen cihaz içinde işlenir; bildirim verileri hiçbir bulut bildirim sunucusuna iletilmez.',
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
          '• Electron (MIT) · Electron Updater (MIT) · React & React DOM (MIT) · Better-SQLite3 & SQLite (MIT) · Express (MIT) · Tailwind CSS (MIT) · Lucide React (ISC) · Vite & Vite Plugin PWA (MIT) · esbuild (MIT) · Zod (MIT) · Pino (MIT) · ONNX Runtime Web (MIT) · Silero VAD v5 / @ricky0123/vad-web (MIT/ISC) · Mozilla RNNoise WASM / @sapphi-red/web-noise-suppressor (BSD-3-Clause) · Piper VITS ONNX / @diffusionstudio/piper-wasm (MIT) · .NET 10 WPF (MIT) · node-llama-cpp (MIT) · @fugood/whisper.node (MIT) · İsteğe Bağlı Yerel Modeller: Qwen3 (Apache 2.0), Whisper.cpp (MIT), Multilingual-E5 (MIT)',
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
          'Agendamea, WCAG 2.1 AA kontrast hedefleri, Yüksek Kontrast Modu, Azaltılmış Hareket, Güçlü Odak Halkası, Renk Körlüğü Öncelik Şekilleri, %80-%150 Yakınlaştırma (Ctrl + / - / 0), sağ tık bağlam menüleri ve Ayarlar > Klavye Kısayolları bölümünden tamamen özelleştirilebilir global ve uygulama içi klavye kısayollarıyla (yeni görev, arama, görünümler, sıralama, ayarlar ve sesli dikte) tasarlanmıştır.',
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
    subtitle: EN_DICTIONARY.legalLastUpdated,
    sections: [
      {
        heading: '1. Local-First (Offline-First) Data Architecture',
        paragraphs: [
          'Agendamea is built by Vellium Teknoloji Anonim Şirketi (vellium.dev) with a strict local-first privacy architecture. All tasks, optional start and due dates, subtasks, notes, categories, and theme settings you create are stored exclusively on your own device (%APPDATA%\\Agendamea).',
          'None of your task data is ever transmitted to Vellium servers, sold to third parties, or used for advertising or profiling.',
          'When optional Local AI & Voice Dictation (v1.1.0) is used, audio from your chosen microphone passes through local noise filtering and adaptive Voice Activity Detection (VAD) and is transcribed strictly in device RAM using on-device Whisper.cpp; zero audio is written to disk or uploaded. Optional external engines (Ollama / LM Studio) connect exclusively over local loopback (127.0.0.1). Optional Apache 2.0 / MIT model weights reside exclusively in your local app data folder and can be deleted in one click.',
          'Task reminders, Windows desktop notifications, Focus Mode profiles, and custom keyboard shortcuts operate 100% locally on your device without any push notification relay server.',
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
    subtitle: EN_DICTIONARY.legalLastUpdated,
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
    subtitle: EN_DICTIONARY.legalLastUpdated,
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
    subtitle: EN_DICTIONARY.legalLastUpdated,
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
          '• Electron (MIT) · Electron Updater (MIT) · React & React DOM (MIT) · Better-SQLite3 & SQLite (MIT) · Express (MIT) · Tailwind CSS (MIT) · Lucide React (ISC) · Vite & Vite Plugin PWA (MIT) · esbuild (MIT) · Zod (MIT) · Pino (MIT) · ONNX Runtime Web (MIT) · Silero VAD v5 / @ricky0123/vad-web (MIT/ISC) · Mozilla RNNoise WASM / @sapphi-red/web-noise-suppressor (BSD-3-Clause) · Piper VITS ONNX / @diffusionstudio/piper-wasm (MIT) · .NET 10 WPF (MIT) · node-llama-cpp (MIT) · @fugood/whisper.node (MIT) · Optional On-Device Models: Qwen3 (Apache 2.0), Whisper.cpp (MIT), Multilingual-E5 (MIT)',
        ],
      },
    ],
  },
  accessibility: {
    id: 'accessibility',
    title: EN_DICTIONARY.legalAccessibilityTitle,
    subtitle: EN_DICTIONARY.legalLastUpdated,
    sections: [
      {
        heading: '1. Keyboard, Zoom & Screen Reader Accessibility',
        paragraphs: [
          'Agendamea is engineered for WCAG 2.1 AA contrast compliance, High Contrast Mode, Reduced Motion, Strong Focus Ring, Colorblind Priority Shapes, 80%-150% Zoom (Ctrl + / - / 0), right-click context menus, and fully customizable global and in-app keyboard shortcuts (new task, search, view switching, reordering, settings, and voice dictation) configurable in Settings > Keyboard Shortcuts.',
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
