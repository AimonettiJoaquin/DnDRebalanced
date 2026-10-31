import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { translate, type Locale } from "./i18n";

const storageKey = "dnd-rebalanced:language";
const LanguageContext = createContext({
  locale: "en" as Locale,
  setLocale: (_: Locale) => {},
  t: (text: string) => text,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      return localStorage.getItem(storageKey) === "es" ? "es" : "en";
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "es"
        ? "DnD Rebalanced · Conversor de enemigos"
        : "DnD Rebalanced · Enemy Converter";
    try {
      localStorage.setItem(storageKey, locale);
    } catch {
      /* Language remains usable when storage is unavailable. */
    }
  }, [locale]);
  const t = useCallback((text: string) => translate(text, locale), [locale]);
  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
export const useLanguage = () => useContext(LanguageContext);
