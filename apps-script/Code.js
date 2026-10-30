/**
 * Таблиця результатів для ігор-контрольних з інформатики (версія 3: кілька контрольних).
 * Автор гри: учитель інформатики Вовненко Ярослав Віталійович.
 *
 * Кожна контрольна має код (наприклад, «5-1» — 5 клас, I чверть). Результати кожного класу за кожну
 * контрольну лежать на окремому аркуші «5-А · 5-1», живий прогрес усіх учнів — на аркуші «Прогрес».
 * Для кожної паралелі (5, 6, 7 клас) вчитель вмикає свою активну контрольну.
 *
 * Код викладається з папки apps-script командою `npx @google/clasp push` (див. .clasp.json).
 * Пароль вчителя ADMIN_KEY лежить у config.js, який не зберігається в git.
 */

var BASE = ['Час', 'Клас', 'Прізвище', "Ім'я", 'Оцінка (12)', 'Бали', 'Максимум', '%', 'Зірок'];
var CLASS_RE = /^\d{1,2}-[А-ЯІЇЄҐA-Z]$/;
var TEST_RE = /^\d{1,2}-[0-9a-z]{1,8}$/;
var SEP = ' · ';
/* Живий прогрес учнів під час контрольної (один рядок на учня й контрольну) */
var PROG = 'Прогрес';
var PHEAD = ['Оновлено', 'Клас', 'Прізвище', "Ім'я", 'Прогрес %', 'Пройдено рівнів', 'Зараз', 'Виходів зі сторінки', 'Поза сторінкою, с', 'Завершено', 'Зараз поза сторінкою', 'Аватар', 'Мітка', 'Сервер, мс', 'Контрольна', 'Пристрій'];
var C_TEST = 14, C_DEV = 15;
/* Випадковий ідентифікатор пристрою учня: старий запис можна прибрати лише з того самого пристрою */
var DEV_RE = /^[a-z0-9]{8,32}$/;
function dev_(v) { v = String(v || ''); return DEV_RE.test(v) ? v : ''; }
/* Обмеження спроб: забагато неправильних кодів чи паролів за 2 хвилини — тимчасово відмовляємо */
function blocked_(kind, limit) { return Number(CacheService.getScriptCache().get('fail:' + kind) || 0) >= limit; }
function failed_(kind) { var c = CacheService.getScriptCache(), k = 'fail:' + kind; c.put(k, String(Number(c.get(k) || 0) + 1), 120); }
function keyOk_(key) { if (blocked_('key', 15)) return false; if (key === ADMIN_KEY) return true; failed_('key'); return false; }
/* Контрольні, які вже вмикались: інші коди сервер не приймає */
function known_() {
  var ap = props_().getProperties(), k = {};
  try { (JSON.parse(ap.known || '[]') || []).forEach(function (t) { k[t] = 1; }); } catch (x) {}
  var a = active_(); Object.keys(a).forEach(function (g) { if (okTest_(a[g])) k[a[g]] = 1; });
  Object.keys(ap).forEach(function (p) { if (p.indexOf('round:') === 0) k[p.slice(6)] = 1; });
  return k;
}
function round_(test) { return Number(props_().getProperty('round:' + test)) || 1; }
function staleRound_(d) { return d.round != null && d.round !== '' && Number(d.round) !== round_(String(d.test)); }
var AV_RE = /^[a-z]{2,12}\.[0-9]$/;
function av_(v) { v = String(v || ''); return AV_RE.test(v) ? v : ''; }

/* Розбір відповідей учня для PDF: [{ t, s, m, r: [[питання, відповідь, правильна, 0/1, бал, максимум, малюнок]] }].
   Зберігаємо очищений JSON в одній клітинці (ліміт клітинки 50 000 символів). */
function review_(lv) {
  if (!Array.isArray(lv)) return '';
  function str(v, n) { return String(v == null ? '' : v).replace(/[\r\t]+/g, ' ').slice(0, n); }
  var out = lv.slice(0, 40).map(function (l) {
    l = l || {};
    return { t: str(l.t, 80), s: l.s == null ? null : num_(l.s, 1000), m: num_(l.m, 1000), r: (Array.isArray(l.r) ? l.r : []).slice(0, 80).map(function (a) {
      a = Array.isArray(a) ? a : []; var x = [str(a[0], 300), str(a[1], 600), str(a[2], 600), a[3] ? 1 : 0];
      if (a.length > 5) x.push(a[5] == null ? null : num_(a[4], 100), a[5] == null ? null : num_(a[5], 100));
      if (a.length > 6 && /^media\/[\w\-.\/]{1,80}$/.test(String(a[6]))) x.push(String(a[6]));
      return x;
    }) };
  });
  var j = JSON.stringify(out);
  for (var cut = 200; j.length > 49000 && cut >= 40; cut -= 40) {
    out.forEach(function (l) { l.r.forEach(function (x) { x[0] = x[0].slice(0, cut); x[1] = x[1].slice(0, cut); x[2] = x[2].slice(0, cut); }); });
    j = JSON.stringify(out);
  }
  return j.length > 49000 ? '' : j;
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
/* Прибирає переноси й захищає від формул у клітинках */
function clean_(v, n) { v = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n || 30); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function strip_(v) { return String(v).replace(/^'/, ''); }
function same_(a, b) { return strip_(a).toLowerCase() === strip_(b).toLowerCase(); }
function props_() { return PropertiesService.getScriptProperties(); }
function num_(v, max) { v = Math.round(Number(v) || 0); return Math.max(0, Math.min(max, v)); }
function gradeOf_(cls) { return String(parseInt(cls, 10)); }
function okTest_(t) { return TEST_RE.test(String(t || '')); }
/* Таблиця перетворює «5-1» на дату, тому код контрольної пишемо як текст (з апострофом) і читаємо обережно */
function tval_(v) { return (v instanceof Date || typeof v === 'number') ? '' : strip_(v); }

/* Активні контрольні: { "5": "5-1", "6": "", "7": "" } */
function active_() { try { return JSON.parse(props_().getProperty('active') || '{}') || {}; } catch (x) { return {}; } }
/* Контрольна для запиту: явно вказана або активна для паралелі класу */
function testFor_(cls, t) { if (okTest_(t)) return String(t); var a = active_()[gradeOf_(cls)]; return okTest_(a) ? a : ''; }

/* Код доступу учнів до контрольної (порожній — доступ відкритий) */
/* Код доступу класу (наприклад «5А-БАЙТ-47»): без нього учень не може зайти; за кодом сервер визначає клас.
   Порівнюємо без урахування регістру, пробілів, дефісів і латинських літер, схожих на кириличні. */
var LOOK = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
function normCode_(v) { return String(v || '').toLowerCase().replace(/[\s\-–—_.]+/g, '').replace(/[abcehikmoptxy]/g, function (ch) { return LOOK[ch]; }); }
function codes_() { var cs = {}, ap = props_().getProperties(); Object.keys(ap).forEach(function (k) { if (k.indexOf('ccode:') === 0 && ap[k]) cs[k.slice(6)] = ap[k]; }); return cs; }
function codeOk_(cls, code) { var c = props_().getProperty('ccode:' + cls); return !!c && normCode_(code) === normCode_(c); }

function sheetName_(cls, test) { return cls + SEP + test; }
function sheet_(cls, test) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), name = sheetName_(cls, test), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, BASE.length).setValues([BASE]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function head_(sh) { var c = sh.getLastColumn(); return c ? sh.getRange(1, 1, 1, c).getValues()[0].map(String) : []; }
function rows_(sh) { var n = sh.getLastRow(), c = sh.getLastColumn(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, c).getValues(); }
/* Знаходить колонку за назвою або додає нову */
function col_(sh, head, name) {
  var i = head.indexOf(name);
  if (i >= 0) return i;
  head.push(name);
  sh.getRange(1, head.length).setValue(name).setFontWeight('bold');
  return head.length - 1;
}

/* Запустіть один раз у редакторі Apps Script, щоб надати скрипту доступ до таблиці */
function setup() {
  progSheet_();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), first = ss.getSheetByName('Аркуш1') || ss.getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  Logger.log('Готово.');
}

function progSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(PROG);
  // Час у таблиці має збігатися з часом скрипта, інакше «оновлено N хв тому» зсувається
  if (ss.getSpreadsheetTimeZone() !== Session.getScriptTimeZone()) ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
  if (!sh) { sh = ss.insertSheet(PROG); sh.setFrozenRows(1); }
  var hr = sh.getRange(1, 1, 1, PHEAD.length);
  if (hr.getValues()[0].join('|') !== PHEAD.join('|')) hr.setValues([PHEAD]).setFontWeight('bold');
  return sh;
}
/* Копія аркуша прогресу в кеші: панель і телевізор читають її без відкриття таблиці */
function progRows_() {
  var c = CacheService.getScriptCache(), raw = c.get('prog');
  if (raw) return JSON.parse(raw);
  var ps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROG), rows = ps ? rows_(ps).map(function (r) { return r.map(function (v) { return v instanceof Date ? v.getTime() : v; }); }) : [];
  try { c.put('prog', JSON.stringify(rows), 20); } catch (x) {}
  return rows;
}
function progDirty_() { CacheService.getScriptCache().remove('prog'); }
function progFind_(sh, cls, test, last, first) {
  var data = rows_(sh);
  for (var i = 0; i < data.length; i++) if (data[i][1] === cls && tval_(data[i][C_TEST]) === test && same_(data[i][2], last) && same_(data[i][3], first)) return i + 2;
  return 0;
}

/* Перехід з версії 2 (одна контрольна) на версію 3: наявні дані стають контрольною «5-1» */
var LEGACY_TEST = '5-1';
function migrate_() {
  var pr = props_();
  if (pr.getProperty('schema') === '3') return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(function (x) { if (CLASS_RE.test(x.getName())) x.setName(sheetName_(x.getName(), LEGACY_TEST)); });
  var ps = progSheet_(), n = ps.getLastRow();
  if (n > 1) {
    var rng = ps.getRange(2, C_TEST + 1, n - 1, 1), vals = rng.getValues();
    rng.setValues(vals.map(function (v) { return [tval_(v[0]) ? "'" + tval_(v[0]) : "'" + LEGACY_TEST]; }));
  }
  if (pr.getProperty('round')) pr.setProperty('round:' + LEGACY_TEST, pr.getProperty('round'));
  if (pr.getProperty('review')) pr.setProperty('review:' + LEGACY_TEST, pr.getProperty('review'));
  pr.deleteProperty('round'); pr.deleteProperty('review');
  if (!pr.getProperty('active')) pr.setProperty('active', JSON.stringify({ '5': LEGACY_TEST }));
  pr.setProperty('schema', '3');
  progDirty_();
}
function ensureSchema_() {
  if (props_().getProperty('schema') === '3') return;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { migrate_(); } finally { lock.releaseLock(); }
}

/* Швидкі проміжні оновлення прогресу: пишемо лише в кеш скрипта, без таблиці й без черги */
function tickKey_(cls, test, last, first) { return 't|' + cls + '|' + test + '|' + strip_(last).toLowerCase() + '|' + strip_(first).toLowerCase(); }
function tick_(d) {
  if (!CLASS_RE.test(String(d.cls)) || !okTest_(d.test) || !known_()[d.test]) return out_({ ok: false, error: 'bad class' });
  if (!codeOk_(d.cls, d.code)) return out_({ ok: false, error: 'bad code' });
  var f = clean_(d.first), l = clean_(d.last);
  if (!f || !l) return out_({ ok: false, error: 'name required' });
  CacheService.getScriptCache().put(tickKey_(d.cls, d.test, l, f), JSON.stringify({ pct: num_(d.pct, 100), now: clean_(d.now, 60), out: !!d.out, ts: Number(d.ts) || 0, srv: Date.now() }), 21600);
  return out_({ ok: true });
}

function doPost(e) {
  var d0;
  try { d0 = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'bad json' }); }
  if (d0.action === 'tick') return tick_(d0);
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    migrate_();
    var d = d0, act = d.action || 'submit';

    if (act === 'progress') {
      if (!CLASS_RE.test(String(d.cls)) || !okTest_(d.test) || !known_()[d.test]) return out_({ ok: false, error: 'bad class' });
      if (!codeOk_(d.cls, d.code)) return out_({ ok: false, error: 'bad code' });
      if (staleRound_(d)) return out_({ ok: false, error: 'old round' });
      var pf = clean_(d.first), pl = clean_(d.last), test = String(d.test), dev = dev_(d.dev);
      if (!pf || !pl) return out_({ ok: false, error: 'name required' });
      var ps = progSheet_(), ts = Number(d.ts) || 0;
      // Учень виправив ім'я, прізвище чи клас: прибираємо його старий рядок
      if (d.prev && CLASS_RE.test(String(d.prev.cls))) {
        var pp = d.prev, ptest = okTest_(pp.test) ? String(pp.test) : test;
        var same = pp.cls === d.cls && ptest === test && same_(pp.last, pl) && same_(pp.first, pf);
        var old = same ? 0 : progFind_(ps, pp.cls, ptest, clean_(pp.last), clean_(pp.first));
        // Прибираємо лише запис, створений з цього самого пристрою
        if (old && dev && String(ps.getRange(old, C_DEV + 1).getValue()) === dev) ps.deleteRow(old);
      }
      var at = progFind_(ps, d.cls, test, pl, pf);
      // Запити можуть прийти не в тому порядку: старіші за збережений ігноруємо
      if (at && ts && Number(ps.getRange(at, 13).getValue()) > ts) return out_({ ok: true, stale: true });
      var prow = [new Date(), d.cls, pl, pf, num_(d.pct, 100), num_(d.done, 100) + ' з ' + num_(d.total, 100), clean_(d.now, 60),
        num_(d.leaves, 100000), num_(d.away, 1000000), d.fin ? 'так' : '', d.out ? 'так' : '', av_(d.av), ts, Date.now(), "'" + test, dev];
      if (at) ps.getRange(at, 1, 1, PHEAD.length).setValues([prow]); else ps.appendRow(prow);
      progDirty_();
      return out_({ ok: true });
    }

    if (act === 'submit') {
      if (!CLASS_RE.test(String(d.cls)) || !okTest_(d.test) || !known_()[d.test]) return out_({ ok: false, error: 'bad class' });
      if (!codeOk_(d.cls, d.code)) return out_({ ok: false, error: 'bad code' });
      if (staleRound_(d)) return out_({ ok: false, error: 'old round' });
      var first = clean_(d.first), last = clean_(d.last), sdev = dev_(d.dev);
      var score = Number(d.score), max = Number(d.max), grade = Number(d.grade), stars = num_(d.stars, 1000);
      if (!first || !last) return out_({ ok: false, error: 'name required' });
      if (!(max > 0 && max <= 1000) || !(score >= 0 && score <= max) || !(grade >= 1 && grade <= 12)) return out_({ ok: false, error: 'bad numbers' });
      // Учень перейшов у правильний клас або виправив ім'я після завершення: прибираємо стару оцінку.
      // Це можна лише з правильним кодом того класу, де лежить стара оцінка, і лише з того самого пристрою.
      var pv = d.prev;
      if (pv && sdev && CLASS_RE.test(String(pv.cls)) && codeOk_(pv.cls, pv.code) && (pv.cls !== d.cls || !same_(pv.first, first) || !same_(pv.last, last))) {
        var osh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName_(pv.cls, String(d.test)));
        if (osh) {
          var oc = head_(osh).indexOf('Пристрій'), od = rows_(osh);
          if (oc >= 0) for (var oi = od.length - 1; oi >= 0; oi--) if (same_(od[oi][2], pv.last) && same_(od[oi][3], pv.first) && String(od[oi][oc]) === sdev) osh.deleteRow(oi + 2);
        }
      }
      var sh = sheet_(d.cls, String(d.test)), head = head_(sh), data = rows_(sh);
      for (var i = 0; i < data.length; i++) {
        // Контрольна: зараховується лише перший результат учня, повторні надсилання ігноруються.
        if (same_(data[i][2], last) && same_(data[i][3], first)) return out_({ ok: true, duplicate: true });
      }
      var row = [new Date(), d.cls, last, first, grade, score, max, Math.round(score / max * 100), stars];
      if (d.leaves != null) {
        var c1 = col_(sh, head, 'Виходів зі сторінки'), c2 = col_(sh, head, 'Поза сторінкою, с');
        while (row.length <= Math.max(c1, c2)) row.push('');
        row[c1] = num_(d.leaves, 100000); row[c2] = num_(d.away, 1000000);
      }
      if (av_(d.av)) { var c3 = col_(sh, head, 'Аватар'); while (row.length <= c3) row.push(''); row[c3] = av_(d.av); }
      if (sdev) { var c4 = col_(sh, head, 'Пристрій'); while (row.length <= c4) row.push(''); row[c4] = sdev; }
      var det = d.details || {};
      Object.keys(det).slice(0, 40).forEach(function (k) {
        var x = det[k] || {}, col = col_(sh, head, 'Рівень: ' + clean_(x.t || k, 40));
        while (row.length <= col) row.push('');
        row[col] = (x.s == null ? '—' : Number(x.s)) + ' з ' + Number(x.m || 0);
      });
      var rvj = review_(d.review);
      if (rvj) { var c5 = col_(sh, head, 'Розбір'); while (row.length <= c5) row.push(''); row[c5] = rvj; }
      while (row.length < head.length) row.push('');
      sh.appendRow(row);
      return out_({ ok: true });
    }

    if (!keyOk_(d.key)) return out_({ ok: false, error: 'wrong key' });
    if (act === 'setactive') {
      var a = {}, src = d.active || {};
      Object.keys(src).forEach(function (g) { if (/^\d{1,2}$/.test(g) && (src[g] === '' || okTest_(src[g]))) a[g] = src[g]; });
      props_().setProperty('active', JSON.stringify(a));
      var kn = known_(); Object.keys(a).forEach(function (g) { if (a[g]) kn[a[g]] = 1; }); props_().setProperty('known', JSON.stringify(Object.keys(kn)));
      return out_({ ok: true, active: a });
    }
    if (act === 'setcodes') {
      // Коди класів мають бути різними, від 3 символів; порожній код закриває вхід для класу
      var nc = d.codes || {}, seen = {}, bad = '';
      Object.keys(nc).forEach(function (c) {
        if (!CLASS_RE.test(c)) { bad = 'bad class'; return; }
        var v = String(nc[c] || '').trim().slice(0, 30), n = normCode_(v);
        if (!v) return;
        if (n.length < 3) bad = 'Код для ' + c + ' закороткий (мінімум 3 символи).';
        else if (seen[n]) bad = 'Однаковий код у ' + seen[n] + ' і ' + c + '.';
        seen[n] = c;
      });
      if (bad) return out_({ ok: false, error: bad });
      Object.keys(nc).forEach(function (c) { var v = String(nc[c] || '').trim().slice(0, 30); if (v) props_().setProperty('ccode:' + c, v); else props_().deleteProperty('ccode:' + c); });
      return out_({ ok: true, codes: codes_() });
    }
    if (act === 'getcodes') return out_({ ok: true, codes: codes_() });
    if (act === 'setreview') {
      if (!okTest_(d.test)) return out_({ ok: false, error: 'bad test' });
      props_().setProperty('review:' + d.test, d.value ? '1' : '0'); return out_({ ok: true });
    }
    if (act === 'newround') {
      // Нова спроба контрольної: очищаємо її результати й прогрес, а пристрої учнів скинуть локальні дані за номером спроби
      if (!okTest_(d.test)) return out_({ ok: false, error: 'bad test' });
      var t = String(d.test), ss = SpreadsheetApp.getActiveSpreadsheet();
      ss.getSheets().forEach(function (x) { var nm = x.getName(); if (nm.slice(-(SEP + t).length) === SEP + t) { var lr = x.getLastRow(); if (lr > 1) x.deleteRows(2, lr - 1); } });
      var ps4 = progSheet_(), pd4 = rows_(ps4);
      for (var r4 = pd4.length - 1; r4 >= 0; r4--) if (tval_(pd4[r4][C_TEST]) === t) ps4.deleteRow(r4 + 2);
      var round = (Number(props_().getProperty('round:' + t)) || 1) + 1;
      props_().setProperty('round:' + t, String(round)); props_().setProperty('review:' + t, '0'); progDirty_();
      return out_({ ok: true, round: round });
    }
    if (!CLASS_RE.test(String(d.cls))) return out_({ ok: false, error: 'bad class' });
    var dt = testFor_(d.cls, d.test);
    if (!dt) return out_({ ok: false, error: 'no test' });
    if (act === 'delete') {
      var sh2 = sheet_(d.cls, dt), data2 = rows_(sh2);
      for (var j = data2.length - 1; j >= 0; j--) if (same_(data2[j][2], d.last) && same_(data2[j][3], d.first)) sh2.deleteRow(j + 2);
      var ps2 = progSheet_(), at2 = progFind_(ps2, d.cls, dt, d.last, d.first);
      if (at2) ps2.deleteRow(at2);
      progDirty_();
      return out_({ ok: true });
    }
    if (act === 'clear') {
      var sh3 = sheet_(d.cls, dt), n = sh3.getLastRow();
      if (n > 1) sh3.deleteRows(2, n - 1);
      var ps3 = progSheet_(), pdata = rows_(ps3);
      for (var q = pdata.length - 1; q >= 0; q--) if (pdata[q][1] === d.cls && (tval_(pdata[q][C_TEST]) === dt || !okTest_(tval_(pdata[q][C_TEST])))) ps3.deleteRow(q + 2);
      progDirty_();
      return out_({ ok: true });
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
  finally { try { lock.releaseLock(); } catch (x) {} }
}

function doGet(e) {
  var p = e.parameter || {};
  if (p.action === 'auth') { Utilities.sleep(300); return out_({ ok: keyOk_(p.key) }); }
  ensureSchema_();
  if (p.action === 'status') {
    var all = props_().getProperties(), reviews = {}, rounds = {};
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('review:') === 0) reviews[k.slice(7)] = all[k] === '1';
      if (k.indexOf('round:') === 0) rounds[k.slice(6)] = Number(all[k]) || 1;
    });
    return out_({ active: active_(), reviews: reviews, rounds: rounds });
  }
  if (p.action === 'join') {
    // Учень вводить код класу: повертаємо клас і активну контрольну його паралелі
    Utilities.sleep(400);
    if (blocked_('join', 80)) return out_({ ok: false, error: 'busy' });
    var n = normCode_(p.code), cs = codes_(), found = '';
    if (n) Object.keys(cs).forEach(function (c) { if (normCode_(cs[c]) === n) found = c; });
    if (!found) { failed_('join'); return out_({ ok: false }); }
    return out_({ ok: true, cls: found, test: testFor_(found, '') });
  }
  var cls = p['class'];
  if (!CLASS_RE.test(String(cls))) return out_({ error: 'bad class' });
  var test = testFor_(cls, p.test);
  if (!test) return out_({ rows: [], test: '', now: Date.now() });
  if (p.action === 'live' || p.action === 'tv') {
    // live — для панелі вчителя (виходи зі сторінки), tv — для екрана в класі (без виходів). Обидва лише з ключем вчителя.
    if (!keyOk_(p.key)) return out_({ error: 'wrong key' });
    var live = progRows_().filter(function (r) { return r[1] === cls && tval_(r[C_TEST]) === test; }).map(function (r) {
      return { t: Number(r[13]) || new Date(r[0]).getTime(), ts: Number(r[12]) || 0, last: strip_(r[2]), first: strip_(r[3]), pct: Number(r[4]) || 0, done: String(r[5]), now: strip_(r[6]), leaves: Number(r[7]) || 0, away: Number(r[8]) || 0, fin: r[9] === 'так', out: r[10] === 'так', av: av_(r[11]) };
    });
    // Накладаємо свіжіші проміжні оновлення з кешу
    if (live.length) {
      var ticks = CacheService.getScriptCache().getAll(live.map(function (r) { return tickKey_(cls, test, r.last, r.first); }));
      live.forEach(function (r) {
        var raw = ticks[tickKey_(cls, test, r.last, r.first)]; if (!raw) return;
        var x = JSON.parse(raw); if (r.fin || x.ts <= r.ts) return;
        r.pct = Math.max(r.pct, x.pct); r.now = x.now || r.now; r.out = x.out; r.t = Math.max(r.t, x.srv);
      });
    }
    live.sort(function (a, b) { return a.last.localeCompare(b.last, 'uk') || a.first.localeCompare(b.first, 'uk'); });
    if (p.action === 'tv') live = live.map(function (r) { return { n: r.first + ' ' + r.last, av: r.av, pct: r.pct, done: r.done, now: r.now, fin: r.fin }; });
    return out_({ rows: live, test: test, now: Date.now() });
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName_(cls, test)), avc = sh ? head_(sh).indexOf('Аватар') : -1;
  var data = (sh ? rows_(sh) : []).map(function (r) {
    return { t: new Date(r[0]).getTime(), last: strip_(r[2]), first: strip_(r[3]), g: Number(r[4]), s: Number(r[5]), m: Number(r[6]), st: Number(r[8]) || 0, av: avc >= 0 ? av_(r[avc]) : '' };
  });
  data.sort(function (a, b) { return b.s - a.s || a.t - b.t; });
  if (p.action === 'board') {
    if (!codeOk_(cls, p.code)) return out_({ error: 'bad code' });
    return out_({ test: test, rows: data.slice(0, 40).map(function (r) { return { n: r.first + ' ' + r.last, av: r.av, g: r.g, s: r.s, st: r.st }; }) });
  }
  if (p.action === 'list') {
    if (!keyOk_(p.key)) return out_({ error: 'wrong key' });
    return out_({ test: test, rows: data });
  }
  if (p.action === 'answers') {
    // Розбір відповідей кожного учня (для PDF), лише з ключем вчителя
    if (!keyOk_(p.key)) return out_({ error: 'wrong key' });
    var rvc = sh ? head_(sh).indexOf('Розбір') : -1;
    return out_({ test: test, rows: (sh ? rows_(sh) : []).map(function (r) {
      var rv = null; if (rvc >= 0 && r[rvc]) { try { rv = JSON.parse(String(r[rvc])); } catch (x) {} }
      return { t: new Date(r[0]).getTime(), last: strip_(r[2]), first: strip_(r[3]), g: Number(r[4]), s: Number(r[5]), m: Number(r[6]), av: avc >= 0 ? av_(r[avc]) : '', rv: rv };
    }) });
  }
  return out_({ error: 'unknown action' });
}
