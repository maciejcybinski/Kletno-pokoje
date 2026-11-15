// Konfiguracja domu – układ odwzorowuje odręczny szkic rozkładu pokoi.
//
// Każde piętro to siatka:
//  cols  – szerokości kolumn (proporcje jak na szkicu), np. '17fr 28fr 28fr 20fr'
//  rows  – wysokości wierszy (opcjonalnie)
// Pokoje i inne obszary mają pozycję w siatce:
//  x, y  – kolumna i wiersz (od 1)
//  w, h  – ile kolumn / wierszy zajmuje (domyślnie 1)
// Pokój:  no – numer, beds – liczba łóżek, name – opcjonalna nazwa (domyślnie „Pokój N”)
// Obszar: type – 'corridor' (korytarz), 'stairs' (schody), 'blocked' (zakreskowany), label – opis,
//         join – 'top' / 'bottom' / 'left' / 'right': zlewa obszar z sąsiednim tego samego typu
//
// UWAGA: identyfikatory łóżek to r<nr pokoju>-<nr łóżka>. Zmniejszenie liczby
// łóżek w pokoju zwolni osoby przypisane do usuniętych łóżek.
window.HOUSE = {
  floors: [
    {
      name: 'I piętro',
      //     3/2   4 / 1   5 nad: schody w dół | przejście | schody w górę   6/7
      cols: '17fr 28fr 11fr 6fr 11fr 20fr',
      rows: 'auto minmax(24px, auto) minmax(24px, auto) auto',
      rooms: [
        { no: 3, beds: 3, x: 1, y: 1, h: 2 },
        { no: 2, beds: 3, x: 1, y: 3, h: 2 },
        { no: 4, beds: 3, x: 2, y: 1 },
        { no: 5, beds: 2, x: 3, y: 1, w: 3 },
        { no: 6, beds: 3, x: 6, y: 1, h: 2 },
        { no: 1, beds: 4, x: 2, y: 4 },
        { no: 7, beds: 5, x: 6, y: 3, h: 2 },
      ],
      areas: [
        { type: 'corridor', x: 2, y: 2, w: 4, h: 2, label: 'korytarz' },
        { type: 'stairs', x: 3, y: 4, label: 'schody ↓' },
        // przejście między schodami – część korytarza (join: 'top' łączy z obszarem powyżej)
        { type: 'corridor', x: 4, y: 4, join: 'top' },
        { type: 'stairs', x: 5, y: 4, label: 'schody ↑' },
      ],
    },
    {
      name: 'II piętro',
      //     11/10   9    8   schody  12/13
      cols: '22fr 23fr 19fr 9fr 21fr',
      rows: 'minmax(28px, auto) auto minmax(24px, auto) auto',
      rooms: [
        { no: 11, beds: 4, x: 1, y: 1, h: 2 },
        { no: 10, beds: 4, x: 1, y: 3, h: 2 },
        { no: 12, beds: 4, x: 5, y: 1, h: 2 },
        { no: 13, beds: 4, x: 5, y: 3, h: 2 },
        { no: 9, beds: 3, x: 2, y: 4 },
        { no: 8, beds: 2, x: 3, y: 4 },
      ],
      areas: [
        { type: 'blocked', x: 2, y: 1, w: 3 },
        { type: 'corridor', x: 2, y: 2, w: 3, h: 2, label: 'korytarz' },
        { type: 'stairs', x: 4, y: 4, label: 'schody' },
      ],
    },
  ],
};
