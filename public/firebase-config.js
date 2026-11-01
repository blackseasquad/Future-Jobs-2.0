// Публични настройки на Firebase проекта (Firebase AI Logic + App Check).
// Това НЕ са тайни: Firebase изрично ги предвижда за кода в браузъра. Ключът за Gemini
// стои във Firebase, а достъпът е ограничен от App Check (reCAPTCHA) до домейна на сайта.
// Secret key на reCAPTCHA никога не се слага тук – той е само във Firebase конзолата.
export const FIREBASE = {
  sdkVersion: '13.1.0',
  config: {
    apiKey: 'AIzaSyDAxT2s2cV6hk3gZYtTDtlPw5Pi9sr5g2Y',
    authDomain: 'futurejobs-ba9df.firebaseapp.com',
    projectId: 'futurejobs-ba9df',
    storageBucket: 'futurejobs-ba9df.firebasestorage.app',
    messagingSenderId: '289559513054',
    appId: '1:289559513054:web:bc5e7a030c93a931887f4f',
  },
  appCheck: {
    // reCAPTCHA Enterprise (Google Cloud Fraud Defense, безплатно ниво Essentials – без карта).
    // reCAPTCHA v3 (Classic) вече не се поддържа за нови ключове.
    // Докато siteKey е празен, Firebase пътят се пропуска и личният план идва от сървъра (/api/plan).
    provider: 'enterprise',
    siteKey: '',
  },
  // Бърз и евтин модел от безплатния план (Gemini Developer API)
  model: 'gemini-3.5-flash-lite',
};
