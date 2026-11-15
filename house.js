// Konfiguracja domu. Rzut jest schematyczny – możesz dowolnie zmieniać układ.
//  x, y  – kolumna i wiersz w siatce piętra (od 1)
//  w, h  – ile kolumn / wierszy zajmuje pokój (domyślnie 1)
//  beds  – liczba łóżek
//  name  – opcjonalna nazwa (domyślnie „Pokój N”)
// UWAGA: identyfikatory łóżek to r<nr pokoju>-<nr łóżka>. Zmniejszenie liczby
// łóżek w pokoju zwolni osoby przypisane do usuniętych łóżek.
window.HOUSE = {
  floors: [
    {
      name: 'I piętro',
      cols: 4,
      corridorRow: 2,
      rooms: [
        { no: 1, beds: 4, x: 1, y: 1 },
        { no: 2, beds: 3, x: 2, y: 1 },
        { no: 3, beds: 3, x: 3, y: 1 },
        { no: 4, beds: 3, x: 4, y: 1 },
        { no: 5, beds: 2, x: 1, y: 3 },
        { no: 6, beds: 3, x: 2, y: 3 },
        { no: 7, beds: 5, x: 3, y: 3, w: 2 },
      ],
    },
    {
      name: 'II piętro',
      cols: 3,
      corridorRow: 2,
      rooms: [
        { no: 8, beds: 2, x: 1, y: 1 },
        { no: 9, beds: 3, x: 2, y: 1 },
        { no: 10, beds: 4, x: 3, y: 1 },
        { no: 11, beds: 4, x: 1, y: 3 },
        { no: 12, beds: 4, x: 2, y: 3 },
        { no: 13, beds: 4, x: 3, y: 3 },
      ],
    },
  ],
};
