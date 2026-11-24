import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/ui/setup.ts'],
    include: ['tests/ui/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/store/**/*.ts',
        'src/hooks/useMediaQuery.ts',
        'src/voice/voiceVadController.ts',
        'src/components/QuickAddBar.tsx',
        'src/components/VirtualizedTodoList.tsx',
        'src/components/SettingsModal.tsx',
        'src/components/Sidebar.tsx',
        'src/components/sidebar/**/*.tsx',
        'src/components/settings/data/**/*.tsx',
        'src/components/settings/docs/**/*.tsx',
      ],
      exclude: ['**/*.d.ts', 'src/i18n/locales/**'],
      thresholds: {
        lines: 60,
        functions: 55,
      },
    },
  },
});
