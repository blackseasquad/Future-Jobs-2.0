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
    // 'v3' – ключ от reCAPTCHA v3 (Secret key е въведен във Firebase → App Check → reCAPTCHA)
    // 'enterprise' – ключ от Google Cloud Fraud Defense / reCAPTCHA Enterprise
    provider: 'v3',
    siteKey: '6Le4TAcuAAAAAFBcd5J6HjEXBPvc-CZtccvGVrg_',
  },
  // Бърз и евтин модел от безплатния план (Gemini Developer API)
  model: 'gemini-3.5-flash-lite',
};
