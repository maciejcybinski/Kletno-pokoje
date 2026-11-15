(function () {
  'use strict';

  // ---------- konfiguracja i indeks łóżek ----------
  const HOUSE = window.HOUSE;
  const params = new URLSearchParams(location.search);
  const planId = (params.get('plan') || 'default').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'default';

  const BEDS = [];
  HOUSE.floors.forEach((f) =>
    f.rooms.forEach((r) => {
      r.bedIds = [];
      for (let i = 1; i <= r.beds; i++) {
        const id = `r${r.no}-${i}`;
        r.bedIds.push(id);
        BEDS.push({ id, room: r, floor: f });
      }
    })
  );
  const BED_BY_ID = new Map(BEDS.map((b) => [b.id, b]));

  let state = { people: {}, beds: {} };
  let selected = null; // id osoby
  let drag = null;
  let pendingRender = false;
  let suppressClick = false;

  const $ = (id) => document.getElementById(id);
  const isMobile = () => window.matchMedia('(max-width: 800px)').matches;

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const fold = (s) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const byName = (a, b) => a[1].name.localeCompare(b[1].name, 'pl');

  function normalize(v) {
    v = v || {};
    const people = v.people && typeof v.people === 'object' ? v.people : {};
    const beds = {};
    // pomijamy łóżka, których nie ma w konfiguracji, i osoby, które nie istnieją
    for (const [bid, pid] of Object.entries(v.beds || {})) {
      if (BED_BY_ID.has(bid) && people[pid]) beds[bid] = pid;
    }
    return { people, beds };
  }

  // ---------- magazyn danych: Firebase albo localStorage ----------
  function applyPaths(obj, paths) {
    for (const [p, v] of Object.entries(paths)) {
      const parts = p.split('/');
      let o = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {};
        o = o[parts[i]];
      }
      const k = parts[parts.length - 1];
      if (v === null) delete o[k];
      else o[k] = JSON.parse(JSON.stringify(v));
    }
  }

  function localStore() {
    const key = 'kletno-pokoje:' + planId;
    const load = () => {
      try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
    };
    let data = load();
    let cb = null;
    window.addEventListener('storage', (e) => {
      if (e.key === key) { data = load(); cb && cb(data); }
    });
    return {
      mode: 'local',
      subscribe(f) { cb = f; f(data); setStatus('local'); },
      update(paths) {
        applyPaths(data, paths);
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* brak miejsca / tryb prywatny */ }
        cb && cb(data);
        return Promise.resolve();
      },
    };
  }

  function firebaseStore(cfg) {
    firebase.initializeApp(cfg);
    const db = firebase.database();
    const ref = db.ref('plans/' + planId);
    return {
      mode: 'online',
      subscribe(f) {
        ref.on('value', (s) => f(s.val()), (err) => {
          console.error(err);
          setStatus('error', err.message);
        });
        db.ref('.info/connected').on('value', (s) => setStatus(s.val() ? 'online' : 'offline'));
      },
      update(paths) {
        return ref.update(paths).catch((e) => alert('Nie udało się zapisać zmian: ' + e.message));
      },
    };
  }

  function createStore() {
    const cfg = window.FIREBASE_CONFIG;
    const configured = cfg && cfg.databaseURL && !/TWOJ|YOUR/i.test(cfg.databaseURL);
    if (configured && window.firebase) {
      try { return firebaseStore(cfg); } catch (e) { console.error(e); }
    }
    return localStore();
  }

  function setStatus(kind, msg) {
    const el = $('status');
    el.className = 'status ' + kind;
    el.textContent = {
      local: 'Tryb lokalny',
      online: '● Online',
      offline: 'Brak połączenia',
      error: 'Błąd bazy',
    }[kind];
    el.title = {
      local: 'Dane zapisują się tylko w tej przeglądarce. Aby edytować wspólnie, skonfiguruj Firebase (README).',
      online: 'Zmiany są widoczne na żywo dla wszystkich.',
      offline: 'Zmiany zostaną wysłane po odzyskaniu połączenia.',
      error: msg || '',
    }[kind];
  }

  // ---------- operacje ----------
  const store = createStore();

  function bedOf(pid) {
    for (const [bid, p] of Object.entries(state.beds)) if (p === pid) return bid;
    return null;
  }

  function move(pid, toBed) {
    if (!state.people[pid]) return;
    const fromBed = bedOf(pid);
    if (fromBed === toBed) return;
    const paths = {};
    if (toBed) {
      const occupant = state.beds[toBed];
      paths['beds/' + toBed] = pid;
      // zamiana miejsc; osoba z łóżka docelowego trafia na zwolnione łóżko (albo do puli)
      if (fromBed) paths['beds/' + fromBed] = occupant || null;
    } else {
      if (!fromBed) return;
      paths['beds/' + fromBed] = null;
    }
    store.update(paths);
  }

  function addPeople(text) {
    const names = text.split(/\r?\n/).map((s) => s.trim().slice(0, 60)).filter(Boolean);
    if (!names.length) return 0;
    const paths = {};
    names.forEach((name, i) => { paths['people/' + newId() + i] = { name }; });
    store.update(paths);
    return names.length;
  }

  function removePerson(pid) {
    const paths = { ['people/' + pid]: null };
    for (const [bid, p] of Object.entries(state.beds)) if (p === pid) paths['beds/' + bid] = null;
    if (selected === pid) select(null);
    store.update(paths);
  }

  function renamePerson(pid, name) {
    name = name.trim().slice(0, 60);
    if (!name || !state.people[pid] || state.people[pid].name === name) return;
    store.update({ ['people/' + pid + '/name']: name });
  }

  // ---------- renderowanie ----------
  function hue(s) {
    let x = 0;
    for (const ch of s) x = (x * 31 + ch.codePointAt(0)) >>> 0;
    return x % 360;
  }
  function initials(name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0] || '')[0] || '').toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
  }

  function chip(pid, p, bid) {
    const c = h('div', 'chip');
    c.dataset.person = pid;
    if (bid) c.dataset.bed = bid;
    if (pid === selected) c.classList.add('selected');
    const av = h('span', 'av', initials(p.name));
    av.style.background = `hsl(${hue(p.name)} 50% 45%)`;
    c.append(av, h('span', 'nm', p.name));
    c.title = p.name;
    return c;
  }

  const BED_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/></svg>';

  function occupiedCount(r) {
    return r.bedIds.filter((b) => state.beds[b]).length;
  }

  function renderFloors() {
    const frag = document.createDocumentFragment();
    HOUSE.floors.forEach((f) => {
      const sec = h('section', 'floor');
      const used = f.rooms.reduce((n, r) => n + occupiedCount(r), 0);
      const cap = f.rooms.reduce((n, r) => n + r.beds, 0);
      const head = h('div', 'floor-head');
      head.append(h('h2', null, f.name), h('span', 'muted', `${used}/${cap} miejsc`));

      const grid = h('div', 'floor-grid');
      grid.style.setProperty('--cols', f.cols);
      if (f.corridorRow) {
        const c = h('div', 'corridor', f.corridorLabel || 'korytarz');
        c.style.gridRow = String(f.corridorRow);
        grid.append(c);
      }
      f.rooms.forEach((r) => {
        const room = h('div', 'room');
        room.style.gridColumn = `${r.x} / span ${r.w || 1}`;
        room.style.gridRow = `${r.y} / span ${r.h || 1}`;
        const n = occupiedCount(r);
        if (n === r.beds) room.classList.add('full');
        const rh = h('div', 'room-head');
        rh.append(h('span', 'room-no', String(r.no)), h('span', 'room-name', r.name || `Pokój ${r.no}`), h('span', 'room-occ', `${n}/${r.beds}`));
        const beds = h('div', 'beds');
        r.bedIds.forEach((bid) => {
          const bed = h('div', 'bed');
          bed.dataset.bed = bid;
          const ico = h('span', 'bed-ico');
          ico.innerHTML = BED_SVG;
          bed.append(ico);
          const pid = state.beds[bid];
          if (pid) bed.append(chip(pid, state.people[pid], bid));
          else bed.append(h('span', 'bed-empty', 'wolne'));
          beds.append(bed);
        });
        room.append(rh, beds);
        grid.append(room);
      });
      sec.append(head, grid);
      frag.append(sec);
    });
    $('floors').replaceChildren(frag);
  }

  function assignedSet() {
    return new Set(Object.values(state.beds));
  }

  function renderPool() {
    const assigned = assignedSet();
    const q = fold($('search').value.trim());
    const list = Object.entries(state.people).filter(([pid]) => !assigned.has(pid)).sort(byName);
    $('pool-count').textContent = String(list.length);
    const frag = document.createDocumentFragment();
    list.filter(([, p]) => !q || fold(p.name).includes(q)).forEach(([pid, p]) => frag.append(chip(pid, p, null)));
    if (!list.length) {
      frag.append(h('p', 'muted small', Object.keys(state.people).length ? 'Wszyscy mają przydział 🎉' : 'Brak osób. Dodaj je przyciskiem „Osoby”.'));
    }
    $('pool-list').replaceChildren(frag);
  }

  function renderStats() {
    const total = Object.keys(state.people).length;
    const assigned = Object.keys(state.beds).length;
    const free = BEDS.length - assigned;
    const s = $('stats');
    s.textContent = `${assigned}/${total} osób z pokojem · ${free} wolnych łóżek`;
    s.classList.toggle('warn', total > BEDS.length);
    if (total > BEDS.length) s.textContent += ` · za dużo osób o ${total - BEDS.length}!`;
  }

  function renderPeopleDialog(force) {
    const dlg = $('dlg');
    if (!dlg.open) return;
    const list = $('people-list');
    if (!force && list.contains(document.activeElement)) return; // nie przeszkadzaj w edycji
    const entries = Object.entries(state.people).sort(byName);
    $('people-count').textContent = String(entries.length);
    const frag = document.createDocumentFragment();
    entries.forEach(([pid, p]) => {
      const row = h('div', 'person-row');
      const inp = h('input');
      inp.value = p.name;
      inp.maxLength = 60;
      inp.addEventListener('change', () => renamePerson(pid, inp.value));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      const bid = bedOf(pid);
      const where = h('span', 'where', bid ? `pok. ${BED_BY_ID.get(bid).room.no}` : '—');
      const del = h('button', 'icon danger', '✕');
      del.title = 'Usuń osobę';
      del.addEventListener('click', () => {
        if (confirm(`Usunąć „${p.name}”?`)) removePerson(pid);
      });
      row.append(inp, where, del);
      frag.append(row);
    });
    if (!entries.length) frag.append(h('p', 'muted small', 'Lista jest pusta.'));
    list.replaceChildren(frag);
  }

  function renderPrint() {
    const frag = document.createDocumentFragment();
    frag.append(h('h1', null, 'Kletno – przydział pokoi'));
    HOUSE.floors.forEach((f) => {
      frag.append(h('h2', null, f.name));
      const t = h('table');
      f.rooms.forEach((r) => {
        const tr = h('tr');
        const names = r.bedIds.map((b) => state.beds[b]).filter(Boolean).map((pid) => state.people[pid].name);
        tr.append(h('th', null, `${r.name || 'Pokój ' + r.no} (${names.length}/${r.beds})`), h('td', null, names.join(', ') || '—'));
        t.append(tr);
      });
      frag.append(t);
    });
    const assigned = assignedSet();
    const rest = Object.entries(state.people).filter(([pid]) => !assigned.has(pid)).sort(byName);
    if (rest.length) {
      frag.append(h('h2', null, 'Bez pokoju'), h('p', null, rest.map(([, p]) => p.name).join(', ')));
    }
    $('print-list').replaceChildren(frag);
  }

  function render() {
    if (drag && drag.active) { pendingRender = true; return; }
    pendingRender = false;
    if (selected && !state.people[selected]) selected = null;
    renderFloors();
    renderPool();
    renderStats();
    renderPeopleDialog(false);
    updateSelbar();
  }

  // ---------- zaznaczanie (tryb „dotknij i dotknij”) ----------
  function select(pid) {
    selected = pid;
    document.querySelectorAll('.chip.selected').forEach((c) => c.classList.remove('selected'));
    if (pid) document.querySelectorAll(`.chip[data-person="${pid}"]`).forEach((c) => c.classList.add('selected'));
    if (pid && isMobile() && !bedOf(pid)) $('pool').classList.add('collapsed');
    updateSelbar();
  }

  function updateSelbar() {
    const bar = $('selbar');
    document.body.classList.toggle('selecting', !!selected);
    if (!selected) { bar.hidden = true; return; }
    bar.hidden = false;
    $('selbar-name').textContent = state.people[selected].name;
    $('selbar-pool').hidden = !bedOf(selected);
  }

  // ---------- przeciąganie (mysz + dotyk) ----------
  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('.bed, #pool') : null;
  }

  function startDrag() {
    clearTimeout(drag.timer);
    drag.active = true;
    const g = drag.chip.cloneNode(true);
    g.classList.add('ghost');
    g.classList.remove('selected');
    document.body.append(g);
    drag.ghost = g;
    drag.chip.classList.add('dragging');
    document.body.classList.add('is-dragging');
    if (navigator.vibrate) navigator.vibrate(15);
    updateDrag();
    requestAnimationFrame(autoScroll);
  }

  function updateDrag() {
    const g = drag.ghost;
    const offY = drag.touch ? g.offsetHeight + 16 : g.offsetHeight / 2; // na telefonie nad palcem
    g.style.transform = `translate(${drag.x - g.offsetWidth / 2}px, ${drag.y - offY}px)`;
    const t = dropTargetAt(drag.x, drag.y);
    if (t !== drag.over) {
      if (drag.over) drag.over.classList.remove('over');
      if (t) t.classList.add('over');
      drag.over = t;
    }
  }

  function autoScroll() {
    if (!drag || !drag.active) return;
    const header = document.querySelector('header.top').getBoundingClientRect().bottom;
    const bottom = isMobile() ? $('pool').getBoundingClientRect().top : window.innerHeight;
    const edge = 60;
    let dy = 0;
    if (drag.y < header + edge) dy = -Math.min(18, (header + edge - drag.y) / 3);
    else if (drag.y > bottom - edge && drag.y < bottom) dy = Math.min(18, (drag.y - (bottom - edge)) / 3);
    if (dy) { window.scrollBy(0, dy); updateDrag(); }
    requestAnimationFrame(autoScroll);
  }

  function endDrag(drop) {
    if (!drag) return;
    clearTimeout(drag.timer);
    const d = drag;
    drag = null;
    if (!d.active) return;
    d.ghost.remove();
    d.chip.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    if (d.over) d.over.classList.remove('over');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 60);
    if (drop && d.over) {
      move(d.pid, d.over.id === 'pool' ? null : d.over.dataset.bed);
      select(null);
    }
    if (pendingRender) render();
  }

  document.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.chip[data-person]');
    if (!c || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = {
      pid: c.dataset.person, chip: c, id: e.pointerId, touch: e.pointerType !== 'mouse',
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, over: null,
    };
    // na dotyku przeciąganie po przytrzymaniu – zwykły ruch palcem przewija stronę
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.active) startDrag(); }, 300);
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      const dist = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
      if (drag.touch) { if (dist > 10) endDrag(false); }
      else if (dist > 4) startDrag();
      return;
    }
    updateDrag();
  });
  window.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) endDrag(true); });
  window.addEventListener('pointercancel', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.active && drag.touch) return; // dalej obsługują zdarzenia touch
    endDrag(false);
  });
  window.addEventListener('touchmove', (e) => {
    if (!drag || !drag.active) return;
    e.preventDefault(); // blokuje przewijanie podczas przeciągania
    const t = e.touches[0];
    drag.x = t.clientX;
    drag.y = t.clientY;
    updateDrag();
  }, { passive: false });
  window.addEventListener('touchend', () => { if (drag && drag.active) endDrag(true); });
  window.addEventListener('touchcancel', () => endDrag(false));
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.chip')) e.preventDefault(); });

  // ---------- kliknięcia / dotknięcia ----------
  document.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.closest('dialog, #selbar, header, input, button, label')) return;
    const c = e.target.closest('.chip[data-person]');
    const bed = e.target.closest('.bed');
    const pool = e.target.closest('#pool');
    if (c) {
      const pid = c.dataset.person;
      if (selected === pid) return select(null);
      if (selected && bed) { move(selected, bed.dataset.bed); return select(null); }
      return select(pid);
    }
    if (bed && selected) { move(selected, bed.dataset.bed); return select(null); }
    if (pool && selected) { move(selected, null); return select(null); }
    if (selected && !bed && !pool) select(null);
  }, true);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) select(null); });

  $('selbar-pool').addEventListener('click', () => { if (selected) move(selected, null); select(null); });
  $('selbar-cancel').addEventListener('click', () => select(null));
  $('pool-toggle').addEventListener('click', () => $('pool').classList.toggle('collapsed'));
  $('search').addEventListener('input', renderPool);
  $('btn-print').addEventListener('click', () => { renderPrint(); window.print(); });
  window.addEventListener('beforeprint', renderPrint);

  // ---------- okno „Osoby i dane” ----------
  $('btn-people').addEventListener('click', () => {
    $('dlg').showModal();
    renderPeopleDialog(true);
  });
  $('btn-add').addEventListener('click', () => {
    const n = addPeople($('add-names').value);
    if (n) $('add-names').value = '';
  });
  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ people: state.people, beds: state.beds }, null, 2)], { type: 'application/json' });
    const a = h('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kletno-pokoje-${planId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const people = {};
      for (const [pid, p] of Object.entries(raw.people || {})) {
        const id = String(pid).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
        if (id && p && typeof p.name === 'string' && p.name.trim()) people[id] = { name: p.name.trim().slice(0, 60) };
      }
      const beds = {};
      for (const [bid, pid] of Object.entries(raw.beds || {})) {
        const id = String(pid).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
        if (BED_BY_ID.has(bid) && people[id]) beds[bid] = id;
      }
      if (!confirm(`Zastąpić obecne dane? (${Object.keys(people).length} osób, ${Object.keys(beds).length} przydziałów)`)) return;
      store.update({ people, beds });
    } catch (err) {
      alert('Nieprawidłowy plik: ' + err.message);
    }
  });
  $('btn-reset').addEventListener('click', () => {
    if (confirm('Usunąć wszystkie przydziały? Osoby wrócą do puli.')) store.update({ beds: null });
  });
  $('btn-clear-all').addEventListener('click', () => {
    if (confirm('Usunąć WSZYSTKIE osoby i przydziały?')) store.update({ beds: null, people: null });
  });
  $('plan-info').textContent =
    `Plan: „${planId}”. Osobny plan (np. na inny wyjazd) otworzysz, dodając do adresu ?plan=nazwa.`;

  // ---------- start ----------
  store.subscribe((v) => {
    state = normalize(v);
    render();
  });
})();
