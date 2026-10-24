import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

const savedLng = typeof localStorage !== 'undefined' ? localStorage.getItem('i18nextLng') || 'en' : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      hi: { translation: hi },
      ta: { translation: ta },
      fr: { translation: fr },
      ar: { translation: ar }
    },
    lng: savedLng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;

