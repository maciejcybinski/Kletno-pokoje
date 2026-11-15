# Kletno – przydział pokoi

Interaktywny rzut domu: przeciągasz osoby z puli na łóżka w pokojach. Działa na komputerze i telefonie, a po podłączeniu Firebase może go edytować wiele osób jednocześnie, ze zmianami widocznymi na żywo.

- **13 pokoi, 44 łóżka**: I piętro to pokoje 1–7, II piętro to pokoje 8–13 (konfiguracja w [house.js](house.js)).
- **Przeciąganie**: myszą albo na telefonie po przytrzymaniu palca na osobie.
- **Dotknij i dotknij**: dotknij osobę, a potem łóżko. Upuszczenie na zajęte łóżko zamienia osoby miejscami.
- **Odpięcie z łóżka**: przeciągnij osobę do puli „Bez pokoju” albo użyj przycisku „Do puli”.
- **Wyjazdy**: przycisk z datą w górnym pasku. Każdy wyjazd ma nazwę, termin (od–do, wybierany w kalendarzu) i własny spis osób i przydziałów. Nowy wyjazd może skopiować listę osób z bieżącego.
- **Osoby**: dodawanie wielu naraz (jedna w linii), zmiana nazwisk, usuwanie.
- **Dane**: eksport CSV i JSON oraz import JSON dla bieżącego wyjazdu.
- **Drukuj**: lista pokoi z przypisanymi osobami.

Przy otwarciu strona pokazuje wyjazd ostatnio wybrany na tym urządzeniu. Jeśli takiego nie ma, wybiera wyjazd, który właśnie trwa, a gdy żaden nie trwa – najbliższy nadchodzący. Link do konkretnego wyjazdu ma postać `…/?plan=<id>`, a adres w przeglądarce zmienia się po wyborze wyjazdu, więc można go skopiować i wysłać.

## Uruchomienie lokalne

Wystarczy otworzyć `index.html` w przeglądarce. Bez konfiguracji Firebase strona działa w **trybie lokalnym**, czyli dane zostają tylko w tej przeglądarce.

## Wspólna edycja: konfiguracja Firebase (jednorazowo, ok. 15 min)

1. Wejdź na <https://console.firebase.google.com> → **Dodaj projekt** (Google Analytics możesz wyłączyć).
2. W menu **Kompilacja → Realtime Database** kliknij **Utwórz bazę danych**, wybierz lokalizację **europe-west1 (Belgia)** i start w **trybie zablokowanym**.
3. W zakładce **Reguły** wklej zawartość pliku [database.rules.json](database.rules.json) i kliknij **Opublikuj**. Rób to ponownie po każdej zmianie tego pliku.
4. Otwórz **Ustawienia projektu** (koło zębate) → **Twoje aplikacje** → ikona **`</>`** (Web), nadaj nazwę i zarejestruj (bez Hostingu).
5. Skopiuj obiekt `firebaseConfig` i wklej jego wartości do [firebase-config.js](firebase-config.js). Upewnij się, że jest tam `databaseURL`; jeśli go brakuje, skopiuj adres z ekranu Realtime Database.
6. Ustaw wspólne hasło (patrz niżej).
7. Wypchnij zmiany na GitHub.

Wartości z `firebase-config.js` nie są tajne, to normalne, że są publiczne w repozytorium. Dostęp kontrolują reguły bazy i hasło.

### Wspólne hasło

Strona jest chroniona jednym hasłem: bez niego nie da się ani oglądać, ani edytować przydziałów. Technicznie to jedno wspólne konto Firebase (e-mail i hasło), a użytkownicy wpisują tylko hasło. Logowanie jest zapamiętywane na urządzeniu.

1. **Authentication → Rozpocznij → Metoda logowania → E-mail/hasło → Włącz → Zapisz**.
2. **Authentication → Users → Dodaj użytkownika**:
   - e-mail: `kletno@example.com` (adres nie musi istnieć),
   - hasło: wymyśl dość długie, np. trzy losowe słowa.
3. *(Zalecane)* **Authentication → Settings → User actions**: odznacz **Enable create (sign-up)**, żeby nikt nie mógł zakładać nowych kont. Reguły i tak wpuszczają tylko powyższy adres, ale tak jest czyściej.

Jeśli chcesz użyć innego adresu niż `kletno@example.com`, zmień go w **dwóch miejscach**:
- `SHARED_LOGIN_EMAIL` w [firebase-config.js](firebase-config.js),
- oba wystąpienia w [database.rules.json](database.rules.json); po zmianie wklej i opublikuj reguły ponownie.

**Zmiana hasła:** Authentication → Users → menu (⋮) przy koncie → **Usuń konto**, a potem dodaj je ponownie z tym samym adresem i nowym hasłem. Konsola nie pozwala edytować hasła wprost, a „Resetuj hasło” wysyła maila, który przy nieistniejącym adresie nie dotrze. Urządzenia zalogowane starym hasłem zostaną wylogowane w ciągu ok. godziny.

W trybie lokalnym (bez Firebase) hasła nie ma, bo dane i tak są tylko w Twojej przeglądarce.

## Publikacja na GitHub Pages

Repozytorium na GitHubie → **Settings → Pages → Build and deployment**: *Deploy from a branch*, gałąź `main`, folder `/ (root)`. Po minucie strona będzie dostępna pod `https://<użytkownik>.github.io/<repozytorium>/`.

## Prywatność i kopie zapasowe

- Każdy, kto zna hasło, może oglądać i edytować przydziały. Nie widać, kto wprowadził zmianę.
- Hasło przekazuj tylko osobom, które mają edytować przydziały.
- Rób od czasu do czasu kopię zapasową: **Dane → Eksport JSON** w górnym pasku.

## Zmiana układu domu

Edytuj [house.js](house.js). Układ odwzorowuje odręczny szkic rozkładu pokoi:
- `cols` to proporcje szerokości kolumn siatki piętra,
- pozycje pokoi (`x`, `y`, `w`, `h`) odpowiadają kolumnom i wierszom tej siatki,
- `areas` opisuje korytarze, schody i obszary zakreskowane.

Na telefonie pokoje układają się automatycznie w 2 kolumny, w kolejności numerów.
