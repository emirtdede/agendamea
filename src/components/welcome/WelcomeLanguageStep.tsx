import { Check, Globe, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { type LanguageCode, SUPPORTED_LANGUAGES } from '../../i18n/languages';
import { matchesLocaleQuery } from '../../utils/todoLogic';

interface WelcomeLanguageStepProps {
  title: string;
  desc: string;
}

export function WelcomeLanguageStep({ title, desc }: WelcomeLanguageStepProps) {
  const { lang, onChangeLanguage, t, meta } = useI18n();
  const [langSearch, setLangSearch] = useState('');

  const filteredLanguages = useMemo(() => {
    const q = langSearch.trim();
    if (!q) return SUPPORTED_LANGUAGES;
    return SUPPORTED_LANGUAGES.filter(
      (item) =>
        matchesLocaleQuery(item.nativeName, q) ||
        matchesLocaleQuery(item.englishName, q) ||
        matchesLocaleQuery(item.code, q),
    );
  }, [langSearch]);

  return (
    <div className="flex flex-1 flex-col min-h-0" data-testid="welcome-language-dropdown">
      <div className="flex flex-col items-center text-center shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--canvas)] text-[var(--text-primary)]">
          <Globe className="h-5 w-5" />
        </div>
        <h2
          id="welcome-modal-title"
          className="mt-2.5 font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]"
        >
          {title}
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{desc}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 items-center gap-2 pe-2 shrink-0">
        <div className="relative col-span-2 flex items-center">
          <Search className="pointer-events-none absolute start-3 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={langSearch}
            onChange={(e) => setLangSearch(e.target.value)}
            placeholder={t.languageSearchPlaceholder}
            aria-label={t.languageSearchPlaceholder}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-9 pe-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        <div
          data-testid="welcome-selected-language"
          aria-live="polite"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-3 select-none"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
              {meta.nativeName}
            </span>
            <span
              lang="en"
              dir="ltr"
              className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[9px] font-semibold uppercase text-[var(--text-muted)] shrink-0"
            >
              {meta.code}
            </span>
          </span>
          <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        </div>
      </div>

      <div
        role="listbox"
        aria-label={t.languageSectionTitle}
        data-testid="welcome-language-listbox"
        className="mt-3 grid flex-1 min-h-0 grid-cols-2 sm:grid-cols-3 content-start gap-2 overflow-y-auto pe-0.5"
      >
        {filteredLanguages.map((item) => {
          const selected = item.code === lang;
          return (
            <button
              key={item.code}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChangeLanguage(item.code as LanguageCode)}
              className={`flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-start transition-colors ${
                selected
                  ? 'border-[var(--text-primary)] bg-[var(--surface-hover)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                  {item.nativeName}
                </span>
                <span
                  lang="en"
                  dir="ltr"
                  className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[9px] font-semibold uppercase text-[var(--text-muted)] shrink-0"
                >
                  {item.code}
                </span>
              </span>
              {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
