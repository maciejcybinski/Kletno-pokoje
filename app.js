(function () {
  'use strict';

  // ---------- konfiguracja i indeks łóżek ----------
  const HOUSE = window.HOUSE;
  const cleanId = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const TRIP_KEY = 'kletno-pokoje:trip';
  const urlPlan = cleanId(new URLSearchParams(location.search).get('plan'));
  let storedPlan = '';
  try { storedPlan = cleanId(localStorage.getItem(TRIP_KEY)); } catch (e) { /* brak dostępu */ }
  // bieżący wyjazd: z linku, z ostatniego wyboru na tym urządzeniu, albo „default”
  let planId = urlPlan || storedPlan || 'default';
  const explicitChoice = !!(urlPlan || storedPlan);
  let trips = {}; // { id: { name, from, to } }

  const BEDS = [];
  HOUSE.floors.forEach((f) =>
    f.rooms.sort((a, b) => a.no - b.no).forEach((r) => {
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

  // Wspólny interfejs obu magazynów:
  //  subscribe(onPlan, onTrips) – dane bieżącego wyjazdu i lista wyjazdów
  //  setPlan(id)                – przełączenie wyjazdu
  //  update(paths)              – zapis względem plans/<bieżący>
  //  updateRoot(paths)          – zapis względem korzenia (trips/…, plans/…)
  function localStore() {
    const pkey = (id) => 'kletno-pokoje:' + id;
    const tkey = 'kletno-pokoje:trips';
    const load = (k) => {
      try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; }
    };
    const save = (k, v) => {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify(v));
      } catch (e) { /* brak miejsca / tryb prywatny */ }
    };
    let id = null;
    let data = {};
    let tripsData = load(tkey);
    let planCb = null;
    let tripsCb = null;
    window.addEventListener('storage', (e) => {
      if (e.key === pkey(id)) { data = load(pkey(id)); planCb && planCb(data); }
      if (e.key === tkey) { tripsData = load(tkey); tripsCb && tripsCb(tripsData); }
    });
    return {
      mode: 'local',
      subscribe(pf, tf) {
        planCb = pf;
        tripsCb = tf;
        setStatus('local');
        tf(tripsData);
        if (id) pf(data);
      },
      setPlan(nid) {
        id = nid;
        data = load(pkey(id));
        planCb && planCb(data);
      },
      update(paths) {
        applyPaths(data, paths);
        save(pkey(id), data);
        planCb && planCb(data);
        return Promise.resolve();
      },
      updateRoot(paths) {
        for (const [p, v] of Object.entries(paths)) {
          const parts = p.split('/');
          if (parts[0] === 'trips') {
            applyPaths(tripsData, { [parts.slice(1).join('/')]: v });
            save(tkey, tripsData);
          } else if (parts[0] === 'plans') {
            const pid = parts[1];
            const rest = parts.slice(2).join('/');
            if (!rest) save(pkey(pid), v);
            else {
              const d = load(pkey(pid));
              applyPaths(d, { [rest]: v });
              save(pkey(pid), d);
            }
            if (pid === id) { data = load(pkey(id)); planCb && planCb(data); }
          }
        }
        tripsCb && tripsCb(tripsData);
        return Promise.resolve();
      },
    };
  }

  const AUTH_ERRORS = {
    'auth/invalid-credential': 'Nieprawidłowe hasło.',
    'auth/wrong-password': 'Nieprawidłowe hasło.',
    'auth/invalid-login-credentials': 'Nieprawidłowe hasło.',
    'auth/user-not-found': 'Konto logowania nie istnieje – sprawdź konfigurację (README).',
    'auth/too-many-requests': 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.',
    'auth/network-request-failed': 'Brak połączenia z internetem.',
    'auth/operation-not-allowed': 'Logowanie hasłem nie jest włączone w Firebase (README).',
  };

  function firebaseStore(cfg) {
    firebase.initializeApp(cfg);
    const auth = firebase.auth();
    const db = firebase.database();
    const tripsRef = db.ref('trips');
    let planRef = null;
    let currentId = null;
    let user = null;
    let planCb = null;
    let tripsCb = null;
    const email = window.SHARED_LOGIN_EMAIL;

    const onDbError = (err) => {
      console.error(err);
      setStatus('error', err.code === 'PERMISSION_DENIED'
        ? 'Brak dostępu – sprawdź, czy w Firebase opublikowane są aktualne reguły z database.rules.json.'
        : err.message);
    };
    function attachPlan() {
      if (planRef) planRef.off();
      planRef = null;
      if (!user || !currentId) return;
      planRef = db.ref('plans/' + currentId);
      planRef.on('value', (s) => planCb && planCb(s.val()), onDbError);
    }
    const saveError = (e) => alert('Nie udało się zapisać zmian: ' + e.message);
    $('login-user').value = email;

    $('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('login-btn');
      const err = $('login-error');
      btn.disabled = true;
      err.hidden = true;
      try {
        await auth.signInWithEmailAndPassword(email, $('login-pass').value);
        $('login-pass').value = '';
      } catch (ex) {
        err.textContent = AUTH_ERRORS[ex.code] || 'Błąd logowania: ' + ex.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
    $('btn-logout').addEventListener('click', () => {
      if (confirm('Wylogować się na tym urządzeniu?')) auth.signOut();
    });

    return {
      mode: 'online',
      subscribe(pf, tf) {
        planCb = pf;
        tripsCb = tf;
        // logowanie zapamiętywane jest na urządzeniu, więc hasło podaje się raz
        auth.onAuthStateChanged((u) => {
          user = u;
          tripsRef.off();
          $('btn-logout').hidden = !u;
          $('login').hidden = !!u;
          if (!u) {
            attachPlan();
            pf(null);
            tf({});
            setTimeout(() => $('login-pass').focus(), 0);
            return;
          }
          tripsRef.on('value', (s) => tf(s.val() || {}), onDbError);
          attachPlan();
        });
        db.ref('.info/connected').on('value', (s) => setStatus(s.val() ? 'online' : 'offline'));
      },
      setPlan(id) {
        currentId = id;
        attachPlan();
      },
      update(paths) {
        return db.ref('plans/' + currentId).update(paths).catch(saveError);
      },
      updateRoot(paths) {
        // zapis wielościeżkowy – reguły sprawdzane są osobno dla każdej ścieżki
        return db.ref().update(paths).catch(saveError);
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
      grid.style.gridTemplateColumns = typeof f.cols === 'number' ? `repeat(${f.cols}, minmax(0, 1fr))` : f.cols;
      if (f.rows) grid.style.gridTemplateRows = f.rows;
      (f.areas || []).forEach((a) => {
        const el = h('div', 'area area-' + a.type + (a.join ? ' join-' + a.join : ''));
        if (a.label) el.append(h('span', null, a.label));
        el.style.gridColumn = `${a.x} / span ${a.w || 1}`;
        el.style.gridRow = `${a.y} / span ${a.h || 1}`;
        grid.append(el);
      });
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
    if (trips[planId]) frag.append(h('p', null, tripTitle(planId)));
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
    if ($('bed-dlg').open) {
      // ktoś inny zajął to łóżko w międzyczasie
      if (state.beds[pickerBed]) $('bed-dlg').close();
      else renderBedPicker();
    }
  }

  // ---------- okienko „kto śpi na tym łóżku?” ----------
  let pickerBed = null;
  function openBedPicker(bid) {
    pickerBed = bid;
    const b = BED_BY_ID.get(bid);
    $('bed-dlg-title').textContent = `${b.room.name || 'Pokój ' + b.room.no} · łóżko ${b.room.bedIds.indexOf(bid) + 1}`;
    $('bed-search').value = '';
    renderBedPicker();
    $('bed-dlg').showModal();
    $('bed-search').focus();
  }

  function pickerOptions() {
    const q = $('bed-search').value.trim().slice(0, 60);
    const fq = fold(q);
    const where = {};
    for (const [bid, pid] of Object.entries(state.beds)) where[pid] = BED_BY_ID.get(bid).room.no;
    const matches = Object.entries(state.people)
      .filter(([, p]) => !fq || fold(p.name).includes(fq))
      .sort((a, b) => (a[0] in where) - (b[0] in where) || byName(a, b)) // najpierw osoby bez pokoju
      .slice(0, 50)
      .map(([pid, p]) => ({ kind: 'person', pid, name: p.name, room: where[pid] }));
    const exact = Object.values(state.people).some((p) => fold(p.name) === fq);
    if (q && !exact) matches.push({ kind: 'new', name: q });
    return matches;
  }

  function renderBedPicker() {
    const opts = pickerOptions();
    const frag = document.createDocumentFragment();
    opts.forEach((o, i) => {
      const btn = h('button', 'picker-opt' + (i === 0 ? ' first' : ''));
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      if (o.kind === 'new') {
        btn.classList.add('new');
        btn.append(h('span', 'av plus', '+'), h('span', 'nm', `Dodaj „${o.name}”`));
      } else {
        const av = h('span', 'av', initials(o.name));
        av.style.background = `hsl(${hue(o.name)} 50% 45%)`;
        btn.append(av, h('span', 'nm', o.name));
        if (o.room) btn.append(h('span', 'tag', `pok. ${o.room}`));
      }
      btn.addEventListener('click', () => choosePickerOption(o));
      frag.append(btn);
    });
    if (!opts.length) {
      frag.append(h('p', 'muted small', Object.keys(state.people).length
        ? 'Brak pasujących osób.'
        : 'Lista osób jest pusta – wpisz imię, aby dodać pierwszą osobę.'));
    }
    $('bed-options').replaceChildren(frag);
  }

  function choosePickerOption(o) {
    const bid = pickerBed;
    $('bed-dlg').close();
    if (!bid || state.beds[bid]) return;
    if (o.kind === 'new') {
      const pid = newId();
      store.update({ ['people/' + pid]: { name: o.name }, ['beds/' + bid]: pid });
    } else {
      move(o.pid, bid);
    }
  }

  $('bed-search').addEventListener('input', renderBedPicker);
  $('bed-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = pickerOptions()[0];
    if (first) choosePickerOption(first);
  });
  // kliknięcie w tło zamyka okienko
  $('bed-dlg').addEventListener('click', (e) => { if (e.target === $('bed-dlg')) $('bed-dlg').close(); });

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
    if (e.target.closest('dialog, #selbar, #login, header, input, button, label')) return;
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
    if (bed && !state.beds[bed.dataset.bed]) return openBedPicker(bed.dataset.bed);
    if (pool && selected) { move(selected, null); return select(null); }
    if (selected && !bed && !pool) select(null);
  }, true);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) select(null); });

  $('selbar-pool').addEventListener('click', () => { if (selected) move(selected, null); select(null); });
  $('selbar-cancel').addEventListener('click', () => select(null));
  $('selbar-delete').addEventListener('click', () => {
    const p = selected && state.people[selected];
    if (p && confirm(`Usunąć „${p.name}” z listy osób?`)) removePerson(selected);
  });
  $('pool-toggle').addEventListener('click', () => $('pool').classList.toggle('collapsed'));

  // ---------- menu „Dane” w górnym pasku ----------
  const dataMenu = $('data-menu');
  const dataBtn = $('btn-data');
  function setDataMenu(open) {
    dataMenu.hidden = !open;
    dataBtn.setAttribute('aria-expanded', String(open));
  }
  dataBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setDataMenu(dataMenu.hidden);
  });
  dataMenu.addEventListener('click', (e) => { if (e.target.closest('[role="menuitem"]')) setDataMenu(false); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) setDataMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDataMenu(false); });
  $('btn-import').addEventListener('click', () => $('file-import').click());

  // ---------- telefon: przełącznik „Rzut / Lista” ----------
  const VIEW_KEY = 'kletno-pokoje:view';
  let planView = false;
  try { planView = localStorage.getItem(VIEW_KEY) === 'plan'; } catch (e) { /* brak dostępu */ }

  function fitPlan() {
    const floors = $('floors');
    if (planView && isMobile()) {
      const planWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--plan-width')) || 760;
      const avail = $('floors').parentElement.clientWidth - 20; // padding .layout
      floors.style.zoom = String(Math.min(1, avail / planWidth));
    } else {
      floors.style.zoom = '';
    }
  }

  function applyView() {
    document.body.classList.toggle('plan-view', planView);
    const btn = $('btn-view');
    btn.textContent = planView ? 'Lista' : 'Rzut';
    btn.setAttribute('aria-pressed', String(planView));
    fitPlan();
  }

  $('btn-view').addEventListener('click', () => {
    planView = !planView;
    try { localStorage.setItem(VIEW_KEY, planView ? 'plan' : 'list'); } catch (e) { /* brak dostępu */ }
    applyView();
  });
  window.addEventListener('resize', fitPlan);
  applyView();
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
  function download(content, type, ext) {
    const blob = new Blob([content], { type });
    const a = h('a');
    a.href = URL.createObjectURL(blob);
    const t = trips[planId];
    const slug = t ? `${t.from}-${fold(t.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : planId;
    a.download = `kletno-pokoje-${slug}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('btn-export').addEventListener('click', () => {
    download(JSON.stringify({ trip: trips[planId] || null, people: state.people, beds: state.beds }, null, 2), 'application/json', 'json');
  });

  // CSV: separator „;” i BOM, żeby polski Excel poprawnie otwierał plik z polskimi znakami
  function toCsv(rows) {
    const cell = (v) => {
      v = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // ochrona przed formułami w arkuszu
      return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  $('btn-export-csv').addEventListener('click', () => {
    const rows = [['Piętro', 'Pokój', 'Łóżko', 'Osoba']];
    HOUSE.floors.forEach((f) =>
      f.rooms.forEach((r) =>
        r.bedIds.forEach((bid, i) => {
          const pid = state.beds[bid];
          rows.push([f.name, r.name || `Pokój ${r.no}`, i + 1, pid ? state.people[pid].name : '']);
        })
      )
    );
    const assigned = assignedSet();
    Object.entries(state.people)
      .filter(([pid]) => !assigned.has(pid))
      .sort(byName)
      .forEach(([, p]) => rows.push(['', 'Bez pokoju', '', p.name]));
    download(toCsv(rows), 'text/csv;charset=utf-8', 'csv');
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
      const target = trips[planId] ? `wyjazdu „${trips[planId].name}”` : 'bieżącego spisu';
      if (!confirm(`Zastąpić dane ${target}? (${Object.keys(people).length} osób, ${Object.keys(beds).length} przydziałów)`)) return;
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
  // ---------- wyjazdy (terminy) ----------
  const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  function fmtRange(from, to) {
    const [y1, m1, d1] = from.split('-').map(Number);
    const [y2, m2, d2] = to.split('-').map(Number);
    if (from === to) return `${d1} ${MONTHS[m1 - 1]} ${y1}`;
    if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS[m1 - 1]} ${y1}`;
    if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y1}`;
    return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  }
  function tripTitle(id) {
    const t = trips[id];
    return t ? `${t.name} · ${fmtRange(t.from, t.to)}` : '';
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // trwający wyjazd, potem najbliższy nadchodzący, potem ostatni miniony
  function bestTrip() {
    const list = Object.entries(trips);
    if (!list.length) return null;
    const today = todayStr();
    const now = list.find(([, t]) => t.from <= today && t.to >= today);
    if (now) return now[0];
    const next = list.filter(([, t]) => t.from > today).sort((a, b) => a[1].from.localeCompare(b[1].from));
    if (next.length) return next[0][0];
    return list.sort((a, b) => b[1].from.localeCompare(a[1].from))[0][0];
  }
  const sortedTrips = () => Object.entries(trips).sort((a, b) => b[1].from.localeCompare(a[1].from));

  function switchTrip(id) {
    planId = id;
    try { localStorage.setItem(TRIP_KEY, id); } catch (e) { /* brak dostępu */ }
    const url = new URL(location.href);
    if (id === 'default') url.searchParams.delete('plan');
    else url.searchParams.set('plan', id);
    history.replaceState(null, '', url);
    select(null);
    state = { people: {}, beds: {} };
    render();
    store.setPlan(id);
    updateTripUI();
  }

  function updateTripUI() {
    const label = $('trip-label');
    if (trips[planId]) label.textContent = tripTitle(planId);
    else if (planId === 'default') label.textContent = Object.keys(trips).length ? 'Spis bez terminu' : 'Ustaw termin wyjazdu';
    else label.textContent = 'Nieznany wyjazd';
    $('btn-trip').classList.toggle('unset', !trips[planId]);
    document.title = trips[planId] ? `${trips[planId].name} – Kletno` : 'Kletno – przydział pokoi';
    renderTripsDialog();
  }

  let editingId = null; // null = tworzenie nowego wyjazdu
  function renderTripsDialog() {
    if (!$('trips-dlg').open) return;
    const frag = document.createDocumentFragment();
    const list = sortedTrips();
    // dotychczasowy spis bez terminu – żeby dało się mu go nadać
    if (planId === 'default' && !trips.default) list.unshift(['default', null]);
    const today = todayStr();
    list.forEach(([id, t]) => {
      const row = h('div', 'trip-row' + (id === planId ? ' current' : ''));
      const pick = h('button', 'trip-pick');
      pick.append(h('strong', null, t ? t.name : 'Spis bez terminu'), h('span', 'muted small', t ? fmtRange(t.from, t.to) : 'ustaw nazwę i daty ✎'));
      if (t && t.to < today) pick.append(h('span', 'tag', 'miniony'));
      else if (t && t.from <= today) pick.append(h('span', 'tag now', 'trwa'));
      if (id === planId) pick.append(h('span', 'tag cur', 'wybrany'));
      pick.addEventListener('click', () => { if (id !== planId) switchTrip(id); $('trips-dlg').close(); });
      const edit = h('button', 'icon', '✎');
      edit.title = 'Edytuj';
      edit.addEventListener('click', () => startEdit(id));
      row.append(pick, edit);
      frag.append(row);
    });
    if (!list.length) frag.append(h('p', 'muted small', 'Nie ma jeszcze żadnych wyjazdów.'));
    $('trips-list').replaceChildren(frag);
  }

  function startEdit(id) {
    editingId = id;
    const t = trips[id] || { name: '', from: '', to: '' };
    $('trip-form-title').textContent = id ? 'Edytuj wyjazd' : 'Nowy wyjazd';
    $('trip-name').value = t.name;
    $('trip-from').value = t.from;
    $('trip-to').value = t.to;
    $('trip-save').textContent = id ? 'Zapisz' : 'Utwórz';
    $('trip-cancel-edit').hidden = !id;
    $('trip-delete').hidden = !id || !trips[id];
    // kopiowanie osób ma sens tylko przy nowym wyjeździe, gdy jest z czego kopiować
    const canCopy = !id && Object.keys(state.people).length > 0 && !isFirstTrip();
    $('trip-copy-wrap').hidden = !canCopy;
    $('trip-copy').checked = false;
    $('trip-error').hidden = true;
    if (id) $('trip-name').focus();
  }
  // pierwszy wyjazd przejmuje dotychczasowy spis („default”), żeby dane nie przepadły
  const isFirstTrip = () => !Object.keys(trips).length && planId === 'default';

  $('trip-from').addEventListener('change', () => {
    if (!$('trip-to').value || $('trip-to').value < $('trip-from').value) $('trip-to').value = $('trip-from').value;
  });
  $('trip-to').addEventListener('focus', () => { if ($('trip-from').value) $('trip-to').min = $('trip-from').value; });

  $('trip-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('trip-name').value.trim().slice(0, 60);
    const from = $('trip-from').value;
    const to = $('trip-to').value;
    const err = $('trip-error');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    if (!name) return fail('Podaj nazwę wyjazdu.');
    if (!from || !to) return fail('Wybierz datę początku i końca.');
    if (to < from) return fail('Data końca nie może być wcześniejsza niż data początku.');
    const meta = { name, from, to };
    if (editingId) {
      store.updateRoot({ ['trips/' + editingId]: meta });
      startEdit(null);
      return;
    }
    const id = isFirstTrip() ? 'default' : 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const paths = { ['trips/' + id]: meta };
    if (id !== 'default' && $('trip-copy').checked) paths['plans/' + id + '/people'] = state.people;
    store.updateRoot(paths);
    trips = Object.assign({}, trips, { [id]: meta }); // od razu, nie czekając na bazę
    if (id !== planId) switchTrip(id);
    else updateTripUI();
    $('trips-dlg').close();
  });

  $('trip-cancel-edit').addEventListener('click', () => startEdit(null));
  $('trip-delete').addEventListener('click', () => {
    const id = editingId;
    const t = trips[id];
    if (!t) return;
    if (!confirm(`Usunąć wyjazd „${t.name}” (${fmtRange(t.from, t.to)}) razem z listą osób i przydziałami?\nTego nie da się cofnąć – możesz najpierw zrobić Dane → Eksport JSON.`)) return;
    store.updateRoot({ ['trips/' + id]: null, ['plans/' + id]: null });
    const rest = Object.assign({}, trips);
    delete rest[id];
    trips = rest;
    startEdit(null);
    if (id === planId) switchTrip(bestTrip() || 'default');
    else updateTripUI();
  });

  $('btn-trip').addEventListener('click', () => {
    $('trips-dlg').showModal();
    // bez żadnego wyjazdu od razu formularz nowego; przy spisie bez terminu – jego edycja
    startEdit(planId === 'default' && !trips.default && Object.keys(trips).length ? 'default' : null);
    renderTripsDialog();
  });

  // ---------- start ----------
  let tripsLoaded = false;
  store.setPlan(planId);
  store.subscribe(
    (v) => {
      state = normalize(v);
      render();
    },
    (t) => {
      trips = t || {};
      if (!tripsLoaded && Object.keys(trips).length) {
        tripsLoaded = true;
        // bez wcześniejszego wyboru (albo gdy zapamiętany wyjazd zniknął) – wybierz najlepszy pasujący
        const missing = !trips[planId] && planId !== 'default';
        if (!explicitChoice || missing) {
          const best = bestTrip();
          if (best && best !== planId) switchTrip(best);
        }
      }
      updateTripUI();
    }
  );
  updateTripUI();
})();
