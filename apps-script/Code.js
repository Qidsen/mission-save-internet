/**
 * Таблиця результатів для гри-контрольної «Місія: Врятувати Інтернет» (версія 2, універсальна).
 * Автор гри: учитель інформатики Вовненко Ярослав Віталійович.
 *
 * Скрипт не залежить від складу рівнів і списку класів: колонки рівнів і аркуші класів
 * створюються автоматично, тож при зміні гри його не потрібно оновлювати.
 *
 * Код викладається з папки apps-script командою `npx @google/clasp push` (див. .clasp.json).
 * Пароль вчителя ADMIN_KEY лежить у config.js, який не зберігається в git.
 */

var BASE = ['Час', 'Клас', 'Прізвище', "Ім'я", 'Оцінка (12)', 'Бали', 'Максимум', '%', 'Зірок'];
var CLASS_RE = /^\d{1,2}-[А-ЯІЇЄҐA-Z]$/;
/* Живий прогрес учнів під час контрольної (один рядок на учня) */
var PROG = 'Прогрес';
var PHEAD = ['Оновлено', 'Клас', 'Прізвище', "Ім'я", 'Прогрес %', 'Пройдено рівнів', 'Зараз', 'Виходів зі сторінки', 'Поза сторінкою, с', 'Завершено', 'Зараз поза сторінкою', 'Аватар', 'Мітка', 'Сервер, мс'];
var AV_RE = /^[a-z]{2,12}\.[0-9]$/;
function av_(v) { v = String(v || ''); return AV_RE.test(v) ? v : ''; }

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
/* Прибирає переноси й захищає від формул у клітинках */
function clean_(v, n) { v = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n || 30); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function strip_(v) { return String(v).replace(/^'/, ''); }
function same_(a, b) { return strip_(a).toLowerCase() === strip_(b).toLowerCase(); }
function props_() { return PropertiesService.getScriptProperties(); }

function sheet_(cls) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(cls);
  if (!sh) {
    sh = ss.insertSheet(cls);
    sh.getRange(1, 1, 1, BASE.length).setValues([BASE]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function head_(sh) { var c = sh.getLastColumn(); return c ? sh.getRange(1, 1, 1, c).getValues()[0].map(String) : []; }
function rows_(sh) { var n = sh.getLastRow(), c = sh.getLastColumn(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, c).getValues(); }
/* Знаходить колонку за назвою або додає нову */
function levelCol_(sh, head, title) { return col_(sh, head, 'Рівень: ' + title); }
function col_(sh, head, name) {
  var i = head.indexOf(name);
  if (i >= 0) return i;
  head.push(name);
  sh.getRange(1, head.length).setValue(name).setFontWeight('bold');
  return head.length - 1;
}

/* Запустіть один раз у редакторі Apps Script, щоб надати скрипту доступ до таблиці */
function setup() {
  ['5-А', '5-Б', '5-В', '5-Г'].forEach(sheet_);
  var first = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Аркуш1') || SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && SpreadsheetApp.getActiveSpreadsheet().getSheets().length > 1) SpreadsheetApp.getActiveSpreadsheet().deleteSheet(first);
  Logger.log('Готово: аркуші класів створено.');
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
function progFind_(sh, cls, last, first) {
  var data = rows_(sh);
  for (var i = 0; i < data.length; i++) if (data[i][1] === cls && same_(data[i][2], last) && same_(data[i][3], first)) return i + 2;
  return 0;
}
function num_(v, max) { v = Math.round(Number(v) || 0); return Math.max(0, Math.min(max, v)); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse(e.postData.contents), act = d.action || 'submit';

    if (act === 'progress') {
      if (!CLASS_RE.test(String(d.cls))) return out_({ ok: false, error: 'bad class' });
      var pf = clean_(d.first), pl = clean_(d.last);
      if (!pf || !pl) return out_({ ok: false, error: 'name required' });
      var ps = progSheet_(), at = progFind_(ps, d.cls, pl, pf), ts = Number(d.ts) || 0;
      // Запити можуть прийти не в тому порядку: старіші за збережений ігноруємо
      if (at && ts && Number(ps.getRange(at, PHEAD.length - 1).getValue()) > ts) return out_({ ok: true, stale: true });
      var prow = [new Date(), d.cls, pl, pf, num_(d.pct, 100), num_(d.done, 100) + ' з ' + num_(d.total, 100), clean_(d.now, 60),
        num_(d.leaves, 100000), num_(d.away, 1000000), d.fin ? 'так' : '', d.out ? 'так' : '', av_(d.av), ts, Date.now()];
      if (at) ps.getRange(at, 1, 1, PHEAD.length).setValues([prow]); else ps.appendRow(prow);
      return out_({ ok: true });
    }

    if (act === 'submit') {
      if (!CLASS_RE.test(String(d.cls))) return out_({ ok: false, error: 'bad class' });
      var first = clean_(d.first), last = clean_(d.last);
      var score = Number(d.score), max = Number(d.max), grade = Number(d.grade), stars = Number(d.stars) || 0;
      if (!first || !last) return out_({ ok: false, error: 'name required' });
      if (!(max > 0 && max <= 1000) || !(score >= 0 && score <= max) || !(grade >= 1 && grade <= 12)) return out_({ ok: false, error: 'bad numbers' });
      var sh = sheet_(d.cls), head = head_(sh), data = rows_(sh);
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
      var det = d.details || {};
      Object.keys(det).slice(0, 40).forEach(function (k) {
        var x = det[k] || {}, col = levelCol_(sh, head, clean_(x.t || k, 40));
        while (row.length <= col) row.push('');
        row[col] = (x.s == null ? '—' : Number(x.s)) + ' з ' + Number(x.m || 0);
      });
      while (row.length < head.length) row.push('');
      sh.appendRow(row);
      return out_({ ok: true });
    }

    if (d.key !== ADMIN_KEY) return out_({ ok: false, error: 'wrong key' });
    if (act === 'setreview') { props_().setProperty('review', d.value ? '1' : '0'); return out_({ ok: true }); }
    if (!CLASS_RE.test(String(d.cls))) return out_({ ok: false, error: 'bad class' });
    if (act === 'delete') {
      var sh2 = sheet_(d.cls), data2 = rows_(sh2);
      for (var j = data2.length - 1; j >= 0; j--) if (same_(data2[j][2], d.last) && same_(data2[j][3], d.first)) sh2.deleteRow(j + 2);
      var ps2 = progSheet_(), at2 = progFind_(ps2, d.cls, d.last, d.first);
      if (at2) ps2.deleteRow(at2);
      return out_({ ok: true });
    }
    if (act === 'clear') {
      var sh3 = sheet_(d.cls), n = sh3.getLastRow();
      if (n > 1) sh3.deleteRows(2, n - 1);
      var ps3 = progSheet_(), pdata = rows_(ps3);
      for (var q = pdata.length - 1; q >= 0; q--) if (pdata[q][1] === d.cls) ps3.deleteRow(q + 2);
      return out_({ ok: true });
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
  finally { try { lock.releaseLock(); } catch (x) {} }
}

function doGet(e) {
  var p = e.parameter || {};
  if (p.action === 'status') return out_({ review: props_().getProperty('review') === '1' });
  var cls = p['class'];
  if (!CLASS_RE.test(String(cls))) return out_({ error: 'bad class' });
  if (p.action === 'live' || p.action === 'tv') {
    // live — для вчителя (з ключем, повні прізвища й виходи); tv — для екрана в класі (лише ім'я та прогрес)
    if (p.action === 'live' && p.key !== ADMIN_KEY) return out_({ error: 'wrong key' });
    var ps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROG);
    var live = (ps ? rows_(ps) : []).filter(function (r) { return r[1] === cls; }).map(function (r) {
      return { t: Number(r[13]) || new Date(r[0]).getTime(), last: strip_(r[2]), first: strip_(r[3]), pct: Number(r[4]) || 0, done: String(r[5]), now: strip_(r[6]), leaves: Number(r[7]) || 0, away: Number(r[8]) || 0, fin: r[9] === 'так', out: r[10] === 'так', av: av_(r[11]) };
    });
    live.sort(function (a, b) { return a.last.localeCompare(b.last, 'uk') || a.first.localeCompare(b.first, 'uk'); });
    if (p.action === 'tv') live = live.map(function (r) { return { n: r.first + ' ' + r.last, av: r.av, pct: r.pct, done: r.done, now: r.now, fin: r.fin }; });
    return out_({ rows: live, now: Date.now() });
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(cls), avc = sh ? head_(sh).indexOf('Аватар') : -1;
  var data = (sh ? rows_(sh) : []).map(function (r) {
    return { t: new Date(r[0]).getTime(), last: strip_(r[2]), first: strip_(r[3]), g: Number(r[4]), s: Number(r[5]), m: Number(r[6]), st: Number(r[8]) || 0, av: avc >= 0 ? av_(r[avc]) : '' };
  });
  data.sort(function (a, b) { return b.s - a.s || a.t - b.t; });
  if (p.action === 'board') {
    return out_({ rows: data.slice(0, 40).map(function (r) { return { n: r.first + ' ' + r.last, av: r.av, g: r.g, s: r.s, st: r.st }; }) });
  }
  if (p.action === 'list') {
    if (p.key !== ADMIN_KEY) return out_({ error: 'wrong key' });
    return out_({ rows: data });
  }
  return out_({ error: 'unknown action' });
}
