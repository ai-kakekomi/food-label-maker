/* ============================================================
 * ui-test.js  画面の回帰テスト（jsdom を使ったブラウザ動作の再現）
 *
 *   node test/ui-test.js
 *
 * jsdom が必要です。入っていない場合はスキップします。
 *   npm install jsdom          （このリポジトリ自体は依存パッケージなしのままです）
 *   NODE_PATH を使う場合： set NODE_PATH=C:\path\to\node_modules
 *
 * 静的サーバーはこのスクリプトの中で立てるので、別途 python 等は不要です。
 * ============================================================ */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.log('jsdom が見つからないため、画面の回帰テストをスキップします。');
  console.log('（実行するには `npm install jsdom` してください）');
  process.exit(0);
}

/* ---------- テスト用の静的サーバー ---------- */

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8'
};

var server = http.createServer(function (req, res) {
  var rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  var file = path.join(ROOT, rel);
  if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

var 失敗 = 0, 成功 = 0;
function ok(cond, name, extra) {
  if (cond) { 成功++; console.log('  ok  ' + name); }
  else { 失敗++; console.log('  NG  ' + name + (extra ? '  → ' + extra : '')); }
}
function 見出し(s) { console.log('\n== ' + s + ' =='); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function txt(el) { return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim(); }

function ページを開く(BASE, page) {
  return fetch(BASE + page).then(function (r) { return r.text(); }).then(function (html) {
    var 印刷回数 = { n: 0 };
    var コピー内容 = { v: null };
    var エラー = [];
    var dom = new JSDOM(html, {
      url: BASE + page,
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse: function (w) {
        w.fetch = function (u, o) { return fetch(new URL(u, BASE), o); };
        w.navigator.clipboard = {
          writeText: function (t) { コピー内容.v = t; return Promise.resolve(); }
        };
        w.confirm = function () { return true; };
        w.print = function () { 印刷回数.n++; };
        w.addEventListener('error', function (e) { エラー.push(e.message); });
      }
    });
    dom.virtualConsole.on('jsdomError', function (e) { エラー.push(e.message); });
    return { dom: dom, 印刷回数: 印刷回数, コピー内容: コピー内容, エラー: エラー };
  });
}

(async function () {
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var BASE = 'http://127.0.0.1:' + server.address().port + '/';

  /* ============================================================
   * 1. 【回帰】検証を実行したあともラベル生成・印刷ができること
   *
   * 不具合：検証結果カードに position:sticky と max-height:100vh が
   *         付いていたため、指摘が増えるとカードが画面いっぱいに居座り、
   *         その下にあったラベル案カード（コピー・印刷ボタンを含む）に
   *         到達できなくなっていた。
   * ============================================================ */
  見出し('1. 【回帰】検証実行後もラベル生成・印刷ができる');

  var p = await ページを開く(BASE, 'index.html');
  var w = p.dom.window, d = w.document;
  await wait(2500);

  ok(!/読み込めませんでした/.test(txt(d.getElementById('results'))), 'ルールYAMLが読み込める');

  /* --- レイアウト上の回帰（原因そのものを固定する） --- */
  var cards = [].slice.call(d.querySelectorAll('.col-result > .card'));
  var labelCardIdx = cards.findIndex(function (c) { return c.querySelector('#label-preview'); });
  var resultCardIdx = cards.findIndex(function (c) { return c.querySelector('#results'); });
  ok(labelCardIdx >= 0 && resultCardIdx >= 0, 'ラベル案カードと検証結果カードが存在する');
  ok(labelCardIdx < resultCardIdx,
    'ラベル案カードが検証結果カードより前にある（検証結果に押し流されない）',
    'label=' + labelCardIdx + ' result=' + resultCardIdx);

  var resultCard = cards[resultCardIdx];
  var cs = w.getComputedStyle(resultCard);
  ok(cs.position !== 'sticky' && cs.position !== 'fixed',
    '検証結果カード自体が sticky/fixed になっていない', 'position=' + cs.position);
  ok(!/vh/.test(cs.maxHeight || ''),
    '検証結果カードに画面高さいっぱいの max-height が付いていない', 'max-height=' + cs.maxHeight);

  var labelCard = cards[labelCardIdx];
  var lcs = w.getComputedStyle(labelCard);
  ok(lcs.display !== 'none' && lcs.visibility !== 'hidden', 'ラベル案カードが非表示になっていない');

  /* --- 実際の操作：サンプル投入 → 検証 → ラベル生成 → 印刷 --- */
  d.querySelector('[data-sample="くるみパン"]').click();
  await wait(400);
  d.getElementById('btn-validate').click();
  await wait(400);

  var sum = txt(d.getElementById('summary'));
  ok(/要修正 [1-9]/.test(sum), '検証が実行され、要修正が検出される', sum);

  var label = d.getElementById('label-preview');
  ok(!!label.querySelector('table.label-table'), '【回帰】検証実行後もラベル案の表が生成されている');
  ok(/菓子パン/.test(txt(label)), '【回帰】検証実行後のラベル案に名称が入っている');

  var printBtn = d.getElementById('btn-print');
  ok(!!printBtn && !printBtn.disabled, '【回帰】検証実行後も印刷ボタンが押せる状態にある');

  /* ラベル案（と印刷ボタン）の祖先に、画面を覆ってしまう要素がないこと。
     これが今回の不具合の直接の原因だった。
     ※ jsdom は media="print" のスタイルシートも適用してしまうため、
       ボタンの display は判定材料にせず、レイアウトの構造で確認する。 */
  var 覆う祖先 = [];
  for (var el = printBtn.parentElement; el && el !== d.body; el = el.parentElement) {
    var s = w.getComputedStyle(el);
    if (s.position === 'sticky' || s.position === 'fixed' || /vh/.test(s.maxHeight || '')) {
      覆う祖先.push(el.className + '(' + s.position + '/' + s.maxHeight + ')');
    }
  }
  ok(覆う祖先.length === 0,
    '【回帰】ラベル案・印刷ボタンの祖先に画面を覆う sticky/全画面高の要素がない', 覆う祖先.join(', '));

  /* 画面用スタイルではボタン群を隠していないこと */
  var screenCss = await (await fetch(BASE + 'css/style.css')).text();
  ok(!/\.btn-group[^{]*\{[^}]*display:\s*none/.test(screenCss),
    '画面用CSSでボタン群を非表示にしていない');

  printBtn.click();
  await wait(200);
  ok(p.印刷回数.n === 1, '【回帰】検証実行後に印刷が実行される', '呼び出し回数=' + p.印刷回数.n);

  d.getElementById('btn-copy').click();
  await wait(200);
  ok(p.コピー内容.v && /菓子パン/.test(p.コピー内容.v),
    '【回帰】検証実行後にラベル案のテキストがコピーできる');

  /* --- 検証を何度実行してもラベルが壊れないこと --- */
  for (var i = 0; i < 3; i++) { d.getElementById('btn-validate').click(); await wait(150); }
  ok(!!d.getElementById('label-preview').querySelector('table.label-table'),
    '【回帰】検証を繰り返してもラベル案の表が残る');

  /* --- 検証後もフォーム編集がラベルに反映されること --- */
  var nameEl = d.getElementById('f-name');
  nameEl.value = '菓子パン（改訂版）';
  nameEl.dispatchEvent(new w.Event('input'));
  await wait(200);
  ok(/菓子パン（改訂版）/.test(txt(d.getElementById('label-preview'))),
    '【回帰】検証実行後もフォームの変更がラベル案に反映される');

  /* --- 印刷用スタイルでラベルが消えないこと --- */
  var printCss = await (await fetch(BASE + 'css/print.css')).text();
  var 非表示ブロック = printCss.match(/([^{}]*)\{[^{}]*display:\s*none[^{}]*\}/g) || [];
  var ラベルを隠している = 非表示ブロック.some(function (b) {
    return /(^|[\s,])(\.label-preview|\.label-table|\.col-result|#label-preview)([\s,{])/.test(b);
  });
  ok(!ラベルを隠している, '【回帰】印刷用CSSがラベル案を display:none にしていない');
  ok(/\.col-form[\s,]/.test(printCss), '印刷用CSSで入力フォームは非表示にしている');

  ok(p.エラー.length === 0, 'JavaScriptのエラーが発生していない', p.エラー.join(' / '));
  w.close();

  /* ============================================================
   * 2. 使い方マニュアルのページ
   * ============================================================ */
  見出し('2. 使い方マニュアル（manual.html）');

  var m = await ページを開く(BASE, 'manual.html');
  var dm = m.dom.window.document;
  await wait(500);

  ok(/使い方マニュアル/.test(dm.title), 'タイトルが設定されている', dm.title);
  ['what', 'start', 'steps', 'result', 'allergen', 'rules', 'custom', 'faq', 'disclaimer']
    .forEach(function (id) {
      ok(!!dm.getElementById(id), 'セクション #' + id +' がある');
    });

  var body = txt(dm.body);
  ok(/本ツールは参考情報です。表示内容の最終確認は必ず食品表示基準および消費者庁の最新ガイドラインで行ってください。/.test(body),
    '免責文が記載されている');
  ok(/UTF-8/.test(body), 'YAMLを保存するときの文字コードの注意がある');
  ok(/タブ文字は使えません/.test(body), 'YAMLのインデントの注意がある');
  ok(/最終確認日/.test(body), '「最終確認日」の直し方の説明がある');
  ok(/sample\.yaml/.test(body), '社内ルールのテンプレートの場所が書いてある');
  ok(/乳成分を含む/.test(body), 'アレルゲン表記の注意（乳成分）がある');

  /* もくじのリンク先がすべてページ内に存在すること */
  var 欠落 = [].slice.call(dm.querySelectorAll('.toc a[href^="#"]'))
    .map(function (a) { return a.getAttribute('href').slice(1); })
    .filter(function (id) { return !dm.getElementById(id); });
  ok(欠落.length === 0, 'もくじのリンク先がすべて存在する', 欠落.join(', '));

  /* 内部リンクのファイルが存在すること */
  var 壊れたリンク = [].slice.call(dm.querySelectorAll('a[href], link[href], script[src]'))
    .map(function (el) { return el.getAttribute('href') || el.getAttribute('src'); })
    .filter(function (h) { return h && !/^(https?:|mailto:|#)/.test(h); })
    .filter(function (h) { return !fs.existsSync(path.join(ROOT, h.split('#')[0])); });
  ok(壊れたリンク.length === 0, 'manual.html の内部リンクがすべて存在する', 壊れたリンク.join(', '));

  ok(m.エラー.length === 0, 'manual.html でJavaScriptのエラーが発生していない', m.エラー.join(' / '));
  m.dom.window.close();

  /* ============================================================
   * 3. 各ページからマニュアルへ1クリックで行けること
   * ============================================================ */
  見出し('3. ナビゲーションからマニュアルへ行ける');

  for (var page of ['index.html', 'rules.html']) {
    var html = await (await fetch(BASE + page)).text();
    var dd = new JSDOM(html).window.document;
    var リンク = [].slice.call(dd.querySelectorAll('.site-nav a'))
      .map(function (a) { return a.getAttribute('href'); });
    ok(リンク.indexOf('manual.html') >= 0,
      page + ' のナビに使い方マニュアルへのリンクがある', リンク.join(', '));
  }

  /* ============================================================ */
  server.close();
  console.log('\n============================');
  console.log('  成功 ' + 成功 + ' / 失敗 ' + 失敗);
  console.log('============================');
  process.exit(失敗 ? 1 : 0);
})().catch(function (e) {
  console.error('例外が発生しました:', e);
  server.close();
  process.exit(1);
});
