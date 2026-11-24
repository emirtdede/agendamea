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
          'Agendamea, Vellium Teknoloji Anonim Şirketi (vellium.dev) tarafından gizlilik öncelikli olarak geliştirilmiştir. Oluşturduğunuz tüm görevler, tarihler, alt görevler, notlar, kategoriler ve tercihler yalnızca cihazınızda (%APPDATA%\\Agendamea\\agendamea.db SQLite WAL veritabanı) saklanır.',
          'Hiçbir görev verisi Vellium sunucularına aktarılmaz, üçüncü taraflarla paylaşılmaz veya reklam/profilleme amacıyla işlenmez. Yerel tanılama günlükleri (%APPDATA%\\Agendamea\\logs) gizli anahtar ve kimlik bilgilerini maskeler.',
          'İsteğe bağlı Sesli Dikte ve Yerel Yapay Zeka (v1.1.0) kullanıldığında mikrofon sesi cihaz içi RNNoise + Silero VAD v5 filtresinden geçerek yalnızca RAM bellekte yerel Whisper.cpp ile yazıya çevrilir; ses kaydı diske veya harici sunucuya gönderilmez. Sesli okuma (TTS) Windows OneCore veya isteğe bağlı çevrimdışı Piper VITS ONNX sesleriyle yerel çalışır; Ollama / LM Studio yalnızca 127.0.0.1 üzerinden bağlanır.',
          'Hatırlatmalar, Windows masaüstü bildirimleri, Odak Modu ve klavye kısayolları %100 cihaz içinde işlenir. Yalnızca kullanıcının açık işlemiyle oluşan isteğe bağlı bağlantılar: Hugging Face üzerinden SHA-256 doğrulamalı model/Piper ses indirmeleri, kullanıcının tanımladığı Giden Webhook hedefleri (SSRF korumalı, isteğe bağlı HMAC-SHA256) ve yerel MCP/REST API (127.0.0.1) üzerinden bağlanan AI istemcileridir (Claude, Cursor, VS Code, Windsurf, Antigravity, ChatGPT Codex, OpenCode, Bionic - kendi sağlayıcı politikalarına tabidir).',
        ],
      },
      {
        heading: '2. Telemetri, İzleme ve Analitik Yokluğu',
        paragraphs: [
          'Agendamea içinde hiçbir kullanıcı izleme kodu, analitik izleyicisi, reklam kimliği veya davranışsal telemetri bulunmaz; uygulama internet bağlantısı olmadan tam kapasiteyle çalışır.',
        ],
      },
      {
        heading: '3. Güncellemeler, Bulut Klasörleri ve Veri Taşınabilirliği',
        paragraphs: [
          'Microsoft Store sürümlerinde güncellemeler yalnızca Microsoft Store tarafından yönetilir ve harici güncelleme uç noktası sorgulanmaz (Microsoft Store Politikası 10.2.7). Doğrudan GitHub kurulumları kişisel veri içermeyen HTTPS isteğiyle GitHub Releases üzerinden SHA-512 doğrulamalı sürüm kontrolü yapar.',
          'İsteğe bağlı Bulut Klasör Eşitleme (OneDrive, Google Drive, iCloud Drive, Dropbox) hiçbir hesap şifresi veya OAuth belirteci toplamaz; yalnızca seçtiğiniz yerel klasöre yedek yazar. Verilerinizi JSON, CSV, Markdown, iCalendar (.ics) veya AES-256-GCM şifreli (.agenc) olarak dışa aktarabilir ya da tek tıkla kalıcı silebilirsiniz.',
          'Resmi Gizlilik Politikası: https://vellium.dev/tr/yasal/gizlilik-politikasi · Gizlilik İletişim: privacy@vellium.dev',
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
          'Agendamea, Vellium Teknoloji Anonim Şirketi (Microsoft Store ID: 9MT5X1NGZJXZ) tarafından MIT Açık Kaynak Lisansı ve Microsoft Store Standart Uygulama Lisans Koşulları kapsamında kişisel ve ticari kullanım için ücretsiz sunulmaktadır.',
        ],
      },
      {
        heading: '2. Yedekleme, Yerel Yapay Zeka ve Üçüncü Taraf Entegrasyonları',
        paragraphs: [
          'Veriler cihazınızda tutulduğundan düzenli JSON/CSV/Markdown/.ics veya AES-256-GCM şifreli (.agenc) yedek almak ya da yerel bulut klasörü eşitlemesi kullanmak kullanıcının sorumluluğundadır. İsteğe bağlı sesli dikte (Whisper) ve yerel dil modelleri (Qwen3 / Ollama / LM Studio) konuşmaları eksik yorumlayabilir; yıkıcı işlemler açık onay gerektirir ve görev doğruluğu kullanıcının kontrolündedir. Harici MCP istemcileri ve Webhook hedefleri ilgili üçüncü taraf koşullarına tabidir.',
        ],
      },
      {
        heading: '3. Garanti Reddi ve Fikri Mülkiyet',
        paragraphs: [
          'Yazılım, yasaların izin verdiği azami ölçüde herhangi bir garanti olmaksızın "olduğu gibi" (AS-IS) sunulur. Agendamea adı, amblemi ve Vellium markası Vellium Teknoloji Anonim Şirketi (vellium.dev) mülkiyetindedir.',
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
        heading: '1. Veri Sorumlusu, Hukuki Sebep ve İşleme Kapsamı',
        paragraphs: [
          '6698 sayılı KVKK, AB GDPR ve Birleşik Krallık GDPR kapsamında Vellium Teknoloji Anonim Şirketi cihazınızda tutulan görev verilerine erişmez, merkezi sunucuda kişisel veri toplamaz ve yurt dışına veri aktarmaz. Yalnızca destek veya gizlilik başvurusu için e-posta göndermeniz halinde iletişim verileriniz talebinizi yanıtlamak amacıyla (KVKK m.5 / GDPR m.6(1)(b)-(f)) işlenir.',
        ],
      },
      {
        heading: '2. Yerel Güvenlik, Saklama Süresi ve İmha',
        paragraphs: [
          'Tüm kayıtlar işletim sistemi kullanıcı profilinizde saklanır ve yerel API yalnızca 127.0.0.1 geri döngü arayüzünde çalışır. Çöp Kutusu otomatik temizleme süresi, Verileri Sıfırla ve kaldırıcı veri temizleme seçenekleriyle saklama ve imha kontrolü tamamen sizdedir.',
        ],
      },
      {
        heading: '3. İlgili Kişi Hakları (KVKK m.11 / GDPR m.15-22)',
        paragraphs: [
          'Verilerinize erişme, düzeltme, kalıcı silme, dışa aktarma, itiraz etme ve yetkili veri koruma otoritesine (KVKK Kurulu / ilgili AB denetim makamı) başvurma haklarına sahipsiniz; yerel veriler üzerindeki işlemlerinizi doğrudan uygulama içinden anında gerçekleştirebilirsiniz.',
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
        heading: '1. Agendamea Lisansı (MIT) ve Ticari Uyumluluk',
        paragraphs: [
          '© 2026 Vellium Teknoloji Anonim Şirketi (https://vellium.dev). Bu yazılım MIT Lisansı ile lisanslanmıştır. Tüm çalışma zamanı bağımlılıkları ve isteğe bağlı model/ses paketleri yalnızca izinli açık kaynak lisanslarından (MIT, Apache 2.0, BSD, ISC, CC0, Kamu Malı; sıfır GPL/LGPL çalışma zamanı bağımlılığı) seçilmiştir.',
        ],
      },
      {
        heading: '2. Üçüncü Taraf Açık Kaynak Bileşenleri ve Modeller',
        paragraphs: [
          '• Electron (MIT) · Electron Updater (MIT) · React & React DOM (MIT) · Better-SQLite3 (MIT) & SQLite (Kamu Malı) · Express (MIT) · Tailwind CSS & @tailwindcss/vite (MIT) · Lucide React (ISC) · Vite & Vite Plugin PWA (MIT) · esbuild (MIT) · Zod (MIT) · Pino (MIT) · ONNX Runtime Web (MIT) · Silero VAD v5 / @ricky0123/vad-web (MIT/ISC) · Mozilla RNNoise WASM / @sapphi-red/web-noise-suppressor (BSD-3-Clause/MIT) · Piper VITS ONNX / @diffusionstudio/piper-wasm (MIT) · .NET 10 WPF (MIT) · node-llama-cpp (MIT) · @fugood/whisper.node (MIT) · İsteğe Bağlı Yerel Modeller ve Sesler: Qwen3 & Qwen3-Embedding (Apache 2.0), Whisper.cpp (MIT), Multilingual-E5 (MIT), Piper Ses Paketleri: İlkiz (MIT), Fahrettin / Fettah / Joe (CC0-1.0), Kristin (Kamu Malı).',
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
        heading: '1. Klavye, Yakınlaştırma, Ses ve Ekran Okuyucu Erişilebilirliği',
        paragraphs: [
          'Agendamea, WCAG 2.1 AA kontrast hedefleri, Yüksek Kontrast Modu, Azaltılmış Hareket, Güçlü Odak Halkası, Renk Körlüğü Öncelik Şekilleri, %80-%150 Yakınlaştırma (Ctrl + / - / 0), ARIA semantik kontrolleri, tamamen özelleştirilebilir global ve uygulama içi klavye kısayolları ile eller serbest Sesli Dikte ve çevrimdışı sesli okuma (TTS) desteğiyle tasarlanmıştır.',
        ],
      },
      {
        heading: '2. 73 Dil ve Sağdan Sola (RTL) Yazım Desteği',
        paragraphs: [
          'Arayüz 73 dünya dilini ve Arapça, Farsça, İbranice, Urduca gibi sağdan sola (RTL) diller için otomatik belge yönlendirmesini destekler.',
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
          'Agendamea is built by Vellium Teknoloji Anonim Şirketi (vellium.dev) with a strict local-first privacy architecture. All tasks, dates, subtasks, notes, categories, and preferences are stored exclusively on your device (%APPDATA%\\Agendamea\\agendamea.db SQLite WAL database).',
          'Zero task data is sent to Vellium servers, shared with third parties, or used for advertising or profiling. Local diagnostic logs (%APPDATA%\\Agendamea\\logs) redact secrets and credentials.',
          'When optional Local AI & Voice Dictation (v1.1.0) is used, microphone audio passes through local RNNoise + Silero VAD v5 filtering and is transcribed strictly in device RAM via Whisper.cpp; zero audio is written to disk or uploaded. Read-Aloud (TTS) runs locally via Windows OneCore or optional offline Piper VITS ONNX voices; Ollama / LM Studio connect strictly over 127.0.0.1.',
          'Reminders, Windows desktop notifications, Focus Mode profiles, and shortcuts run 100% locally. Optional outbound traffic occurs strictly on explicit user action: SHA-256 verified model or Piper voice downloads from Hugging Face, user-configured Outgoing Webhooks (cloud-metadata SSRF blocked, optional HMAC-SHA256), and local AI clients connected over stdio or 127.0.0.1 MCP/REST (Claude, Cursor, VS Code, Windsurf, Antigravity, ChatGPT Codex, OpenCode, Bionic - governed by their respective third-party policies).',
        ],
      },
      {
        heading: '2. Zero Telemetry, Tracking, or Analytics',
        paragraphs: [
          'Agendamea contains no analytics trackers, advertising identifiers, or behavioral telemetry and works at full capability completely offline.',
        ],
      },
      {
        heading: '3. Updates, Cloud Folders & Data Portability',
        paragraphs: [
          'Microsoft Store installations receive updates exclusively through Microsoft Store without querying external update endpoints (Microsoft Store Policy 10.2.7). Direct GitHub desktop builds perform privacy-safe HTTPS checks against GitHub Releases with SHA-512 verification.',
          'Optional Cloud Folder Sync (OneDrive, Google Drive, iCloud Drive, Dropbox) collects zero credentials or OAuth tokens and only writes backups to your chosen local folder. You can export JSON, CSV, Markdown, iCalendar (.ics), or AES-256-GCM encrypted (.agenc) backups or erase all data at any time.',
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
          'Agendamea is provided free for personal and commercial task management by Vellium Teknoloji Anonim Şirketi (Microsoft Store ID: 9MT5X1NGZJXZ) under the MIT License and Microsoft Store Standard Application License Terms.',
        ],
      },
      {
        heading: '2. Backups, Local AI Accuracy & Third-Party Integrations',
        paragraphs: [
          'Because records reside locally on your device, you are responsible for periodic backups via JSON, CSV, Markdown, iCalendar (.ics), AES-256-GCM encrypted (.agenc) export, or optional cloud folder sync in Settings > Data & Backup. Optional on-device voice dictation (Whisper) and local LLMs (Qwen3 / Ollama / LM Studio) may occasionally misinterpret speech; destructive commands require explicit confirmation, and you remain responsible for verifying scheduled tasks. External MCP clients and Webhook targets are subject to their respective third-party terms.',
        ],
      },
      {
        heading: '3. Disclaimer of Warranties & Intellectual Property',
        paragraphs: [
          'The software is provided "AS IS" without warranty of any kind to the fullest extent permitted by law. The Agendamea name, emblem, and Vellium brand are property of Vellium Teknoloji Anonim Şirketi (vellium.dev).',
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
        heading: '1. Data Controller, Legal Basis & Local Processing',
        paragraphs: [
          'Under GDPR, UK GDPR, and Turkish KVKK (Law No. 6698), Vellium Teknoloji Anonim Şirketi does not access on-device task records, host personal user data on central servers, or perform cross-border transfers. If you voluntarily email privacy@vellium.dev or support@vellium.dev, correspondence is processed solely to handle your request (GDPR Art. 6(1)(b)-(f) / KVKK Art. 5).',
        ],
      },
      {
        heading: '2. Loopback Security, Retention & Erasure',
        paragraphs: [
          'All settings and task records stay within your OS user profile and local API access is bound exclusively to 127.0.0.1 loopback. Retention and deletion are fully under your control via Trash Auto-Purge, Clean Start reset, and the uninstaller full-wipe option.',
        ],
      },
      {
        heading: '3. Data Subject Rights (GDPR Arts. 15-22 / KVKK Art. 11)',
        paragraphs: [
          'You hold rights of access, rectification, erasure, portability, objection, and complaint to a supervisory authority; for all on-device data, you exercise these controls directly and immediately inside Agendamea.',
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
        heading: '1. Agendamea License (MIT) & Commercial-Safe Audit',
        paragraphs: [
          '© 2026 Vellium Teknoloji Anonim Şirketi (https://vellium.dev). Released under the MIT License. All runtime dependencies and optional model/voice packs are audited for permissive commercial-safe licenses (MIT, Apache 2.0, BSD, ISC, CC0, Public Domain; zero GPL/LGPL runtime dependencies).',
        ],
      },
      {
        heading: '2. Third-Party Open Source Attributions & Models',
        paragraphs: [
          '• Electron (MIT) · Electron Updater (MIT) · React & React DOM (MIT) · Better-SQLite3 (MIT) & SQLite (Public Domain) · Express (MIT) · Tailwind CSS & @tailwindcss/vite (MIT) · Lucide React (ISC) · Vite & Vite Plugin PWA (MIT) · esbuild (MIT) · Zod (MIT) · Pino (MIT) · ONNX Runtime Web (MIT) · Silero VAD v5 / @ricky0123/vad-web (MIT/ISC) · Mozilla RNNoise WASM / @sapphi-red/web-noise-suppressor (BSD-3-Clause/MIT) · Piper VITS ONNX / @diffusionstudio/piper-wasm (MIT) · .NET 10 WPF (MIT) · node-llama-cpp (MIT) · @fugood/whisper.node (MIT) · Optional On-Device Models & Voices: Qwen3 & Qwen3-Embedding (Apache 2.0), Whisper.cpp (MIT), Multilingual-E5 (MIT), Piper Neural Voices: Ilkiz (MIT), Fahrettin / Fettah / Joe (CC0-1.0), Kristin (Public Domain).',
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
        heading: '1. Keyboard, Zoom, Voice & Screen Reader Accessibility',
        paragraphs: [
          'Agendamea is engineered for WCAG 2.1 AA contrast compliance, High Contrast Mode, Reduced Motion, Strong Focus Ring, Colorblind Priority Shapes, 80%-150% Zoom (Ctrl + / - / 0), ARIA semantic controls, customizable global and in-app keyboard shortcuts, plus hands-free Voice Dictation and offline Read-Aloud (TTS).',
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
