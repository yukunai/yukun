import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import zhCN from "./locales/zh-CN.json"
import en from "./locales/en.json"
import ja from "./locales/ja.json"
import ko from "./locales/ko.json"
import de from "./locales/de.json"
import fr from "./locales/fr.json"

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    en: { translation: en },
    ja: { translation: ja },
    ko: { translation: ko },
    de: { translation: de },
    fr: { translation: fr },
  },
  lng: "zh-CN",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
