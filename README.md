# Kletno – przydział pokoi

Interaktywny rzut domu: przeciągasz osoby z puli na łóżka w pokojach. Działa na komputerze i telefonie, a po podłączeniu Firebase może go edytować wiele osób jednocześnie, ze zmianami widocznymi na żywo.

- **13 pokoi, 44 łóżka**: I piętro to pokoje 1–7, II piętro to pokoje 8–13 (konfiguracja w [house.js](house.js)).
- **Przeciąganie**: myszą albo na telefonie po przytrzymaniu palca na osobie.
- **Dotknij i dotknij**: dotknij osobę, a potem łóżko. Upuszczenie na zajęte łóżko zamienia osoby miejscami.
- **Odpięcie z łóżka**: przeciągnij osobę do puli „Bez pokoju” albo użyj przycisku „Do puli”.
- **Osoby**: dodawanie wielu naraz (jedna w linii), zmiana nazwisk, usuwanie, eksport i import JSON.
- **Drukuj**: lista pokoi z przypisanymi osobami.
- **Osobne plany**: np. na różne wyjazdy, przez dopisanie do adresu `?plan=lato2027`.

## Uruchomienie lokalne

Wystarczy otworzyć `index.html` w przeglądarce. Bez konfiguracji Firebase strona działa w **trybie lokalnym**, czyli dane zostają tylko w tej przeglądarce.

## Wspólna edycja: konfiguracja Firebase (jednorazowo, ok. 10 min)

1. Wejdź na <https://console.firebase.google.com> → **Dodaj projekt** (Google Analytics możesz wyłączyć).
2. W menu **Kompilacja → Realtime Database** kliknij **Utwórz bazę danych**, wybierz lokalizację **europe-west1 (Belgia)** i start w **trybie zablokowanym**.
3. W zakładce **Reguły** wklej zawartość pliku [database.rules.json](database.rules.json) i kliknij **Opublikuj**.
4. Otwórz **Ustawienia projektu** (koło zębate) → **Twoje aplikacje** → ikona **`</>`** (Web), nadaj nazwę i zarejestruj (bez Hostingu).
5. Skopiuj obiekt `firebaseConfig` i wklej jego wartości do [firebase-config.js](firebase-config.js). Upewnij się, że jest tam `databaseURL`; jeśli go brakuje, skopiuj adres z ekranu Realtime Database.
6. Wypchnij zmiany na GitHub.

Wartości z `firebase-config.js` nie są tajne, to normalne, że są publiczne w repozytorium. Dostęp kontrolują reguły bazy.

## Publikacja na GitHub Pages

Repozytorium na GitHubie → **Settings → Pages → Build and deployment**: *Deploy from a branch*, gałąź `main`, folder `/ (root)`. Po minucie strona będzie dostępna pod `https://<użytkownik>.github.io/<repozytorium>/`.

## ⚠️ Prywatność

W obecnej, prostej wersji **każdy, kto zna adres strony, może oglądać i edytować przydziały**. Nie ma logowania. Dlatego:

- wpisuj tylko imiona albo imię i inicjał nazwiska, bez danych wrażliwych,
- rób od czasu do czasu **Eksport JSON** jako kopię zapasową.

Jeśli potrzebna będzie kontrola dostępu, można dodać logowanie Firebase (np. linkiem e-mail) i ograniczyć zapis w regułach do wybranych osób.

## Zmiana układu domu

Edytuj [house.js](house.js). Pozycje pokoi (`x`, `y`, `w`, `h`) odpowiadają siatce piętra, liczba kolumn to `cols`, a `corridorRow` wskazuje wiersz korytarza. Na telefonie pokoje układają się automatycznie w 2 kolumny.
