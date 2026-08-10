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

  /* ============================================================
   * 1-2. 機械判定の指摘が0件のときの成功バナー
   *      error・warn がともに0件のときだけ出す。
   *      「error 0件だが warn あり」では出さない。
   * ============================================================ */
  見出し('1-2. 機械判定0件の成功バナー');

  function バナー() { return d.getElementById('goodbox'); }
  function 件数(種別) {
    var m = txt(d.getElementById('summary')).match(new RegExp(種別 + ' (\\d+)'));
    return m ? Number(m[1]) : -1;
  }

  /* --- サンプル2（くるみパン）：要修正あり → 出ない --- */
  d.querySelector('[data-sample="くるみパン"]').click();
  await wait(400);
  ok(件数('要修正') > 0, 'サンプル2は要修正が1件以上ある', '要修正=' + 件数('要修正'));
  ok(!バナー(), 'サンプル2（要修正あり）では成功バナーが表示されない');

  /* --- サンプル1（クッキー）：要修正0・要確認0 → 出る --- */
  d.querySelector('[data-sample="クッキー"]').click();
  await wait(400);
  ok(件数('要修正') === 0 && 件数('要確認') === 0,
    'サンプル1は要修正0件・要確認0件', '要修正=' + 件数('要修正') + ' 要確認=' + 件数('要確認'));
  var g = バナー();
  ok(!!g, 'サンプル1（機械判定0件）で成功バナーが表示される');
  ok(/機械判定で検出された問題はありませんでした/.test(txt(g)), '成功バナーに成功の文言がある');
  ok(/機械では判定できない項目が残っています/.test(txt(g)), '成功バナーに人の確認を促す補足がある');

  /* 未確認のチェックリスト件数がバナーに出ていること */
  var check件数 = 件数('人の確認が必要');
  ok(check件数 > 0, 'サンプル1に未確認のチェックリスト項目がある', 'check=' + check件数);
  ok(new RegExp('人の確認が必要な項目：' + check件数 + '件').test(txt(g)),
    '成功バナーに未確認のチェックリスト件数が表示される',
    'summary=' + check件数 + ' / banner=' + txt(g));

  /* 緑系（成功）の見た目であること */
  var gs = w.getComputedStyle(g);
  ok(/rgb|#/.test(gs.backgroundColor || ''), '成功バナーに背景色が付いている', gs.backgroundColor);

  /* --- チェックを1つ入れると件数が減って追随すること --- */
  var cb1 = d.querySelector('#results input[data-confirm]');
  if (cb1) {
    cb1.click();
    await wait(250);
    var 減後 = 件数('人の確認が必要');
    ok(減後 === check件数 - 1, 'チェックすると未確認件数が1件減る', check件数 + ' -> ' + 減後);
    ok(バナー() && new RegExp('人の確認が必要な項目：' + 減後 + '件').test(txt(バナー())),
      '成功バナーの件数がチェックに追随する');
  }

  /* --- warn を発生させると成功バナーが消えること（error 0・warn ありの区別） --- */
  var noteEl = d.getElementById('f-note');
  noteEl.value = '落花生が入っているかもしれません';   // 可能性表示 → warn ではなく error
  noteEl.dispatchEvent(new w.Event('input'));
  d.getElementById('btn-validate').click();
  await wait(400);
  ok(!バナー(), '指摘が発生すると成功バナーが消える',
    '要修正=' + 件数('要修正') + ' 要確認=' + 件数('要確認'));

  /* error を出さずに warn だけを足して、error 0・warn ありの状態を作る。
     （既存の原材料は書き換えない。書き換えるとアレルゲンの表示が消えて error になる）
     原材料を1行追加し、大分類表示「穀類」を入れると warn だけが増える。 */
  d.querySelector('[data-sample="クッキー"]').click();
  await wait(400);
  ok(!!バナー(), 'サンプル1に戻すと成功バナーが再表示される');
  d.querySelector('[data-add="ingredient"]').click();
  await wait(200);
  var 行群 = d.querySelectorAll('#ingredient-rows .row-input');
  var 最終行 = 行群[行群.length - 1];
  最終行.value = '穀類';                                // 大分類表示 → warn
  最終行.dispatchEvent(new w.Event('input'));
  d.getElementById('btn-validate').click();
  await wait(400);
  ok(件数('要修正') === 0 && 件数('要確認') > 0,
    '要修正0件・要確認ありの状態を作れた', '要修正=' + 件数('要修正') + ' 要確認=' + 件数('要確認'));
  ok(!バナー(), '要修正0件でも要確認があれば成功バナーは出さない');

  ok(p.エラー.length === 0, '成功バナーの操作でJavaScriptのエラーが発生していない', p.エラー.join(' / '));

  /* ============================================================
   * 1-3. 栄養成分表示の入力欄
   * ============================================================ */
  見出し('1-3. 栄養成分表示の入力欄');

  d.querySelector('[data-sample="クッキー"]').click();
  await wait(400);

  ok(!!d.getElementById('f-nutri-energy'), '栄養成分の入力欄がある');
  ok(/栄養成分表示（100g当たり）/.test(txt(d.getElementById('label-preview'))),
    'ラベル案に栄養成分表示の枠が出る');
  ok(/480kcal/.test(txt(d.getElementById('label-preview'))), '熱量に単位が付いて表示される');

  /* 1食分を選ぶと目安量の欄が出る */
  var 単位 = d.getElementById('f-nutri-unit');
  単位.value = '1食分';
  単位.dispatchEvent(new w.Event('change'));
  await wait(200);
  ok(!d.getElementById('wrap-nutri-serving').hidden, '1食分を選ぶと目安量の欄が現れる');
  d.getElementById('btn-validate').click();
  await wait(300);
  ok(/1食分/.test(txt(d.getElementById('results'))), '目安量が空だと指摘が出る');

  var 目安 = d.getElementById('f-nutri-serving');
  目安.value = '50g';
  目安.dispatchEvent(new w.Event('input'));
  await wait(200);
  ok(/栄養成分表示（1食分（50g）当たり）/.test(txt(d.getElementById('label-preview'))),
    '目安量がラベル案に併記される');

  /* ナトリウムからの換算ボタン */
  d.getElementById('f-nutri-na-input').value = '200';
  d.getElementById('btn-na-convert').click();
  await wait(200);
  ok(d.getElementById('f-nutri-salt').value === '0.51',
    'ナトリウム200mgが食塩相当量0.51gに換算される', d.getElementById('f-nutri-salt').value);

  /* 省略のチェックで入力欄が隠れ、ラベル案からも消える */
  var 省略 = d.getElementById('f-nutri-omit');
  省略.checked = true;
  省略.dispatchEvent(new w.Event('change'));
  await wait(200);
  ok(d.getElementById('wrap-nutrition').hidden, '省略にチェックすると入力欄が隠れる');
  ok(!/栄養成分表示/.test(txt(d.getElementById('label-preview'))),
    '省略にチェックするとラベル案から栄養成分表示が消える');

  ok(p.エラー.length === 0, '栄養成分の操作でJavaScriptのエラーが発生していない', p.エラー.join(' / '));
  w.close();

  /* ============================================================
   * 2. 使い方マニュアルのページ
   * ============================================================ */
  見出し('2. 使い方マニュアル（manual.html）');

  var m = await ページを開く(BASE, 'manual.html');
  var dm = m.dom.window.document;
  await wait(500);

  ok(/使い方マニュアル/.test(dm.title), 'タイトルが設定されている', dm.title);
  ['what', 'start', 'steps', 'result', 'allergen', 'detect', 'ask-ai', 'faq', 'disclaimer']
    .forEach(function (id) {
      ok(!!dm.getElementById(id), 'セクション #' + id +' がある');
    });

  var body = txt(dm.body);
  ok(/本ツールは参考情報です。表示内容の最終確認は必ず食品表示基準および消費者庁の最新ガイドラインで行ってください。/.test(body),
    '免責文が記載されている');
  ok(/乳成分を含む/.test(body), 'アレルゲン表記の注意（乳成分）がある');
  ok(/この面の右側に記載/.test(body), '枠外表示（期限）のOK例が書いてある');
  ok(/本品製造工場では/.test(body), '枠外表示（コンタミネーション注意喚起）のOK例が書いてある');
  ok(!/CC BY/.test(body), 'CC BY 4.0 の記述が残っていない');
  ok(/MIT/.test(body), 'ライセンス（MIT）の記載がある');

  /* 「自分用に変えたい（AIに頼む）」の章 */
  var ask = dm.getElementById('ask-ai');
  var askTxt = txt(ask);
  ok(!!ask, '「AIに頼む」の章（#ask-ai）がある');
  ok(/Claude Code/.test(askTxt), 'AIコーディングエージェントの具体名がある');
  ok(!!dm.getElementById('rules') && !!dm.getElementById('custom') && !!dm.getElementById('improve'),
    '旧章のリンク先（#rules・#custom・#improve）が残っている');

  /* コピーできるプロンプトブロック */
  var blocks = ask.querySelectorAll('.prompt-block');
  ok(blocks.length >= 2, 'コピーできるプロンプトが2つ以上ある', blocks.length + '個');
  [].slice.call(blocks).forEach(function (b, i) {
    var btn = b.querySelector('button.js-copy');
    var pre = btn && dm.getElementById(btn.getAttribute('data-target'));
    ok(!!btn, 'プロンプト' + (i + 1) + ' にコピーボタンがある');
    ok(!!pre, 'プロンプト' + (i + 1) + ' のコピー対象が存在する',
      btn && btn.getAttribute('data-target'));
  });
  var setup = txt(dm.getElementById('p-setup'));
  ok(/git clone/.test(setup) && /git pull/.test(setup),
    'ソース取得のプロンプトに clone と pull の両方が入っている');
  ok(/github\.com\/ai-kakekomi\/food-label-maker/.test(setup),
    'ソース取得のプロンプトにリポジトリのURLが入っている');
  ok(/社内ルール/.test(txt(dm.getElementById('p-custom'))),
    '社内ルールを頼むプロンプトがある');

  /* ユーザーにYAMLを書かせる導線が消えていること */
  ok(!/タブ文字は使えません/.test(body), 'YAMLの書き方の注意（タブ文字）が消えている');
  ok(!dm.getElementById('yaml-caution'), 'YAML構文の折りたたみが消えている');

  var gh = dm.querySelector('#ask-ai a[href*="github.com/ai-kakekomi/food-label-maker"]');
  ok(!!gh, 'GitHubリポジトリへのリンクがある');
  ok(gh && gh.getAttribute('target') === '_blank' && /noopener/.test(gh.getAttribute('rel') || ''),
    'GitHubリンクが別タブ＋rel=noopener で開く');

  /* 章番号ともくじの並びが一致していること（章を足したときのずれ防止） */
  var 見出し番号 = [].slice.call(dm.querySelectorAll('main > section.card > h2'))
    .map(function (h) { return parseInt(txt(h), 10); });
  var 連番 = 見出し番号.every(function (n, i) { return n === i + 1; });
  ok(連番, 'セクションの章番号が1から連番になっている', 見出し番号.join(','));
  ok(dm.querySelectorAll('.toc a[href^="#"]').length === 見出し番号.length,
    'もくじの項目数とセクション数が一致する',
    dm.querySelectorAll('.toc a[href^="#"]').length + ' vs ' + 見出し番号.length);
  var toc順 = [].slice.call(dm.querySelectorAll('.toc a[href^="#"]'))
    .map(function (a) { return a.getAttribute('href').slice(1); });
  var 本文順 = [].slice.call(dm.querySelectorAll('main > section.card[id]'))
    .map(function (s) { return s.id; });
  ok(JSON.stringify(toc順) === JSON.stringify(本文順), 'もくじの並び順が本文と一致する',
    toc順.join(',') + ' / ' + 本文順.join(','));

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
