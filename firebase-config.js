// Konfiguracja Firebase (Ustawienia projektu → Twoje aplikacje → aplikacja Web).
// Te wartości nie są tajne – dostęp chronią hasło i reguły bazy (database.rules.json).
// Ważne: musi to być window.FIREBASE_CONFIG, inaczej strona działa w trybie lokalnym.
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCLLs6G5q5G_nWOLBkgfPI-H9W9cSS5q1k',
  authDomain: 'kletno-pokoje.firebaseapp.com',
  databaseURL: 'https://kletno-pokoje-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'kletno-pokoje',
  storageBucket: 'kletno-pokoje.firebasestorage.app',
  messagingSenderId: '789699166365',
  appId: '1:789699166365:web:11e92c7e67c3a0f5e4d474',
};

// Wspólne konto, na które logują się wszyscy (podają tylko hasło).
// Ten sam adres musi być w database.rules.json i w Firebase → Authentication → Users.
// Adres nie musi istnieć – służy tylko jako login.
window.SHARED_LOGIN_EMAIL = 'kletno@example.com';
