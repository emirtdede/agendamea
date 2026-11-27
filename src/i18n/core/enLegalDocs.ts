import { EN_DICTIONARY } from './enDictionary';
import type { LegalDocId, LegalDocumentContent } from './types';

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
          'Electron 45.4.1 (MIT) · Electron Updater 6.8.11 (MIT) · React & React DOM 19.3.1 (MIT) · Tailwind CSS & @tailwindcss/vite 4.3.5 (MIT) · Lucide React 0.546.0 (ISC) · Vite 8.3.8 & @vitejs/plugin-react 6.3.0 & Vite Plugin PWA 2.0.0 (MIT) · .NET 10 WPF (MIT) · Better-SQLite3 13.2.0 (MIT) · SQLite (Public Domain) · Express 4.22.3 (MIT) · Zod 4.6.7 (MIT) · Pino 10.4.0 (MIT) · esbuild 0.28.2 (MIT) · node-llama-cpp 3.22.3 (MIT) · @fugood/whisper.node 1.2.0-rc.2 (MIT) · ONNX Runtime Web 1.31.1 (MIT) · @ricky0123/vad-web / Silero VAD v5 0.0.31 (ISC/MIT) · @sapphi-red/web-noise-suppressor / RNNoise 0.4.2 (MIT/BSD-3-Clause) · @diffusionstudio/piper-wasm 1.0.0 (MIT) · Optional On-Device Models & Voices: Whisper.cpp (MIT), Qwen3 & Qwen3-Embedding (Apache-2.0), Multilingual-E5 (MIT), Piper Neural Voices: Ilkiz (MIT), Fahrettin / Fettah / Joe (CC0-1.0), Kristin (Public Domain).',
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
          'Technical support & help: support@vellium.dev · General inquiries & partnerships: contact@vellium.dev · Privacy, GDPR & data requests: privacy@vellium.dev · Legal & licensing inquiries: legal@vellium.dev · Security vulnerability reports: security@vellium.dev · Billing & enterprise inquiries: billing@vellium.dev',
        ],
      },
    ],
  },
};
