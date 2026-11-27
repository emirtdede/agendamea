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
          'Electron 45.4.1 (MIT) · Electron Updater 6.8.11 (MIT) · React & React DOM 19.3.1 (MIT) · Tailwind CSS & @tailwindcss/vite 4.3.5 (MIT) · Lucide React 0.546.0 (ISC) · Vite 8.3.8 & @vitejs/plugin-react 6.3.0 & Vite Plugin PWA 2.0.0 (MIT) · .NET 10 WPF (MIT) · Better-SQLite3 13.2.0 (MIT) · SQLite (Kamu Malı) · Express 4.22.3 (MIT) · Zod 4.6.7 (MIT) · Pino 10.4.0 (MIT) · esbuild 0.28.2 (MIT) · node-llama-cpp 3.22.3 (MIT) · @fugood/whisper.node 1.2.0-rc.2 (MIT) · ONNX Runtime Web 1.31.1 (MIT) · @ricky0123/vad-web / Silero VAD v5 0.0.31 (ISC/MIT) · @sapphi-red/web-noise-suppressor / RNNoise 0.4.2 (MIT/BSD-3-Clause) · @diffusionstudio/piper-wasm 1.0.0 (MIT) · İsteğe Bağlı Yerel Modeller ve Sesler: Whisper.cpp (MIT), Qwen3 & Qwen3-Embedding (Apache-2.0), Multilingual-E5 (MIT), Piper Ses Paketleri: İlkiz (MIT), Fahrettin / Fettah / Joe (CC0-1.0), Kristin (Kamu Malı).',
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
          'Teknik destek ve yardım: support@vellium.dev · Genel iletişim ve iş birliği: contact@vellium.dev · Gizlilik ve KVKK talepleri: privacy@vellium.dev · Hukuki ve lisans konuları: legal@vellium.dev · Güvenlik açığı bildirimi: security@vellium.dev · Faturalandırma ve kurumsal talepler: billing@vellium.dev',
        ],
      },
    ],
  },
};
