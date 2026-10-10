// ═══════════════════════════════════════════════════════════════
// LOCAL DEV ONLY — login + sync bypass
// On localhost the Firebase login can't be used, so this drops straight
// into the app with a fake user and demo data, skipping the SharePoint
// boot sync. It is hard-guarded by hostname: on the real deploy
// (GitHub Pages) it returns immediately and does nothing.
// Open  localhost:8191/?login  to preview the real login/splash instead.
// ═══════════════════════════════════════════════════════════════
(function () {
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.local');
  if (!isLocal) return;                                   // production → no-op
  if (/[?&]login\b/.test(location.search)) return;        // ?login → show real login

  function seedIfEmpty() {
    try {
      if (!localStorage.getItem('cap_masterpoints')) {
        var mp = [], counts = { '1945': 30, '1935': 20, '1931E': 15, '1931W': 15 };
        Object.keys(counts).forEach(function (pl) {
          for (var s = 1; s <= counts[pl]; s++)
            mp.push({ plant: pl, sample: s, area: 'Area ' + ((s % 4) + 1), location: 'Point ' + s, zone: (s % 3) + 1, active: true });
        });
        localStorage.setItem('cap_masterpoints', JSON.stringify(mp));
      }
      if (!localStorage.getItem('cap_h')) {
        var recs = [], id = 1, plants = ['1945', '1935', '1931E', '1931W'];
        plants.forEach(function (pl, p) {
          for (var s = 1; s <= 7; s++) {
            recs.push({
              id: id++, fecha: '2026-10-08', planta: pl, by: 'Andres Zavaleta', sample: s,
              zone: (s % 3) + 1, area: 'Area ' + ((s % 4) + 1), line: '', location: 'Point ' + s,
              ecoli: 0, listeria: (p === 0 && s === 2) ? 1 : 0, salmonella: 0, saureus: 0,
              resultado: (p === 0 && s === 2) ? 'Positive' : (p < 2 ? 'Negative' : 'Pending'),
              retestNum: '', isRetest: false, originalId: 0
            });
          }
        });
        // Demo retests for the 1945 / sample 2 positive (originalId 2) so the
        // Retests page has content: #1 & #2 still pending, #3 already passed.
        var rtBase = { planta: '1945', by: 'Andres Zavaleta', sample: 2, zone: 3, area: 'Area 3', line: '', location: 'Point 2', ecoli: 0, salmonella: 0, saureus: 0, isRetest: true, originalId: 2, originalDate: '2026-10-08' };
        recs.push(Object.assign({}, rtBase, { id: id++, fecha: '2026-10-12', listeria: 0, resultado: 'Pending', retestNum: '1' }));
        recs.push(Object.assign({}, rtBase, { id: id++, fecha: '2026-10-13', listeria: 0, resultado: 'Pending', retestNum: '2' }));
        recs.push(Object.assign({}, rtBase, { id: id++, fecha: '2026-10-14', listeria: 0, resultado: 'Negative', retestNum: '3' }));
        localStorage.setItem('cap_h', JSON.stringify(recs));
      }
      if (!localStorage.getItem('cap_rv')) localStorage.setItem('cap_rv', '[]');
    } catch (e) {}
  }

  function enter() {
    seedIfEmpty();
    CU = { id: 'dev', uid: 'dev', name: 'Dev User', displayName: 'Dev User', email: 'dev@local', role: 'Administrator', active: true };
    try {
      var le = document.getElementById('loginScreen'); if (le) le.classList.remove('active');
      var sp = document.getElementById('loadingSplash'); if (sp) sp.classList.remove('show');
      var ap = document.getElementById('appScreen'); if (ap) ap.classList.add('active');
      var av = document.getElementById('userAvatar'); if (av) av.textContent = 'DU';
      var gn = document.getElementById('greetName'); if (gn) gn.textContent = 'Dev';
      var gd = document.getElementById('greetDate');
      if (gd) gd.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
      var sg = document.getElementById('nav-settings-group'); if (sg) sg.classList.add('visible');
      try { if (typeof refreshDashboard === 'function') refreshDashboard(); } catch (e) {}
      try { if (typeof searchHistory === 'function') searchHistory(); } catch (e) {}
      try { if (typeof loadRetests === 'function') loadRetests(); } catch (e) {}
      try { if (typeof loadSubmissions === 'function') loadSubmissions(); } catch (e) {}
      try { if (typeof updateNotifBadge === 'function') updateNotifBadge(); } catch (e) {}
      try { if (typeof showPage === 'function') showPage('dashboard'); } catch (e) {}
    } catch (e) { console.warn('[devlocal] enter error', e); }
    console.log('%c[devlocal] login bypass active (localhost) — open ?login to see the real login', 'color:#345d46;font-weight:bold');
    if (typeof FB_EMU !== 'undefined' && FB_EMU) emuSignIn();
  }

  // Local emulator session so Firestore rules see a real token with a role.
  function emuSignIn() {
    var asInspector = /[?&]as=inspector\b/.test(location.search);
    var email = asInspector ? 'inspector@caputo.test' : 'admin@caputo.test', pass = 'devpass123';
    var base = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
    var post = function (url, body, owner) {
      return fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, owner ? { Authorization: 'Bearer owner' } : {}), body: JSON.stringify(body) }).then(function (r) { return r.json(); });
    };
    post(base + '/accounts:signUp?key=dev', { email: email, password: pass, returnSecureToken: true })
      .then(function () { return post(base + '/accounts:signInWithPassword?key=dev', { email: email, password: pass, returnSecureToken: true }); })
      .then(function (u) { return post(base + '/projects/envirotrack-5173f/accounts:update', { localId: u.localId, customAttributes: JSON.stringify({ role: asInspector ? 'Inspector' : 'Administrator' }) }, true); })
      .then(function () { return fbAuth.signInWithEmailAndPassword(email, pass); })
      .then(function (c) { return c.user.getIdToken(true); })
      .then(function () {
        CU.email = email; CU.role = asInspector ? 'Inspector' : 'Administrator';
        console.log('%c[devlocal] emulator session: ' + email, 'color:#345d46;font-weight:bold');
      })
      .catch(function (e) { console.warn('[devlocal] emulator sign-in failed — is `firebase emulators:start` running?', e); });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(enter, 60);
  else window.addEventListener('load', function () { setTimeout(enter, 60); });
})();
