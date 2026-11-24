declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.length > 0 ? __APP_VERSION__ : '1.1.0';

export const GITHUB_REPO_URL = 'https://github.com/emirtdede/agendamea';
