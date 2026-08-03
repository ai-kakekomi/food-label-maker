/* ============================================================
 * test.js  ルールYAMLと判定エンジンの自動テスト
 *
 *   node test/test.js
 *
 * Node.js だけで動きます（外部パッケージ不要）。
 * ============================================================ */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var jsyaml = require(path.join(ROOT, 'vendor', 'js-yaml.min.js'));

var 失敗 = 0;
var 成功 = 0;

function ok(cond, name, extra) {
  if (cond) { 成功++; }
  else { 失敗++; console.log('  NG  ' + name + (extra ? '  → ' + extra : '')); }
}
function 見出し(s) { console.log('\n== ' + s + ' =='); }

/* ---------------- 1. ルールYAMLの検査 ---------------- */

見出し('1. ルールYAMLの検査');

var index = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'index.json'), 'utf8'));

var 辞書doc = jsyaml.load(fs.readFileSync(path.join(ROOT, 'rules', index['辞書']), 'utf8'));
ok(Array.isArray(辞書doc['特定原材料']), 'アレルゲン辞書：特定原材料がリストである');
ok(辞書doc['特定原材料'].length === 8, '特定原材料は8品目', 辞書doc['特定原材料'].length + '品目');
ok(辞書doc['特定原材料に準ずるもの'].length === 20, '特定原材料に準ずるものは20品目',
  辞書doc['特定原材料に準ずるもの'].length + '品目');

var 想定8 = ['えび', 'かに', 'くるみ', '小麦', 'そば', '卵', '乳', '落花生'];
ok(JSON.stringify(辞書doc['特定原材料'].map(function (x) { return x['品目']; })) === JSON.stringify(想定8),
  '特定原材料8品目の内容が正しい');

var 全ルール = [];
var 既出id = {};
var 既知の種別 = [
  '必須項目', '正規表現一致必須', '正規表現禁止', '数値下限', '用途名併記',
  'Lフェニルアラニン', 'アレルゲン表示', 'アレルゲン一括網羅', 'アレルゲン方式併用',
  '乳の表記', '乳由来の表記', '卵白卵黄', '大分類表記', '期限日付書式',
  '製造所固有記号', 'アレルゲン整合性', '確認事項'
];

index['法令ルール'].concat(['custom/sample.yaml']).forEach(function (f) {
  var p = path.join(ROOT, 'rules', f);
  var doc;
  try {
    doc = jsyaml.load(fs.readFileSync(p, 'utf8'));
    ok(true, f + ' のYAMLが読める');
  } catch (e) {
    ok(false, f + ' のYAMLが読める', e.message);
    return;
  }
  ok(Array.isArray(doc['ルール']), f + ' に「ルール」リストがある');
  (doc['ルール'] || []).forEach(function (r) {
    var タグ = f + ' / ' + (r.id || '(idなし)');
    ok(!!r.id, タグ + '：id がある');
    ok(!既出id[r.id], タグ + '：id が重複していない');
    既出id[r.id] = true;
    ok(!!r['名称'], タグ + '：名称 がある');
    ok(!!r['根拠'], タグ + '：根拠 がある');
    ok(!!r['出典URL'], タグ + '：出典URL がある');
    ok(r['最終確認日'] !== undefined, タグ + '：最終確認日 の欄がある');
    ok(!!r['条件'], タグ + '：条件 がある');
    ok(!!r['判定'], タグ + '：判定 がある');
    ok(r['重大度'] === 'error' || r['重大度'] === 'warn', タグ + '：重大度 が error か warn', r['重大度']);
    ok(!!r['メッセージ'], タグ + '：メッセージ がある');
    var 種別 = (r['機械判定'] || {})['種別'];
    ok(既知の種別.indexOf(種別) >= 0, タグ + '：機械判定の種別が既知', 種別);
    if (f.indexOf('custom/') !== 0) {
      全ルール.push(Object.assign({}, r, { 分類: doc['分類'], 由来: 'base', ファイル: f }));
    }
  });
});

console.log('  法令ルール本数：' + 全ルール.length);
ok(全ルール.length >= 20, '法令ルールが20本以上ある', 全ルール.length + '本');

/* ---------------- 2. 判定エンジンの動作 ---------------- */

見出し('2. 判定エンジンの動作');

/* ブラウザ用のJSをNodeで動かすための最小限のダミー */
var sandbox = { window: {}, console: console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
['js/engine.js', 'js/label.js', 'js/samples.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});
var Engine = sandbox.window.LabelEngine;
var Builder = sandbox.window.LabelBuilder;
var Samples = sandbox.window.LabelSamples;

ok(!!Engine && !!Builder && !!Samples, 'engine.js / label.js / samples.js が読み込める');

/* 辞書オブジェクトを組み立てる（rules.js と同じ形） */
function 辞書を作る(doc) {
  var items = [];
  function push(list, kind) {
    (list || []).forEach(function (e) {
      items.push({
        品目: e['品目'], 区分: kind,
        代替表記: e['代替表記'] || [], 拡大表記: e['拡大表記'] || [],
        表示形式: e['表示形式'] || e['品目'],
        添加物表示形式: e['添加物表示形式'] || e['品目']
      });
    });
  }
  push(doc['特定原材料'], '特定原材料');
  push(doc['特定原材料に準ずるもの'], '特定原材料に準ずるもの');
  return {
    品目一覧: items,
    大分類の例外表記: doc['大分類の例外表記'] || [],
    検索: function (n) { for (var i = 0; i < items.length; i++) if (items[i].品目 === n) return items[i]; return null; }
  };
}
var 辞書 = 辞書を作る(辞書doc);

/* ルールを engine が期待する形に正規化 */
var ルール群 = 全ルール.map(function (r) {
  return {
    id: r.id, 名称: r['名称'], 分類: r.分類, 根拠: r['根拠'], 出典URL: r['出典URL'],
    最終確認日: (r['最終確認日'] || '').toString(), 条件: r['条件'], 判定: r['判定'],
    重大度: r['重大度'], メッセージ: r['メッセージ'], ヒント: r['ヒント'] || '',
    機械判定: r['機械判定'] || { 種別: '確認事項' }, 適用条件: r['適用条件'] || [],
    由来: 'base', ファイル: r.ファイル
  };
});

function 検証(input) { return Engine.検証する(input, ルール群, 辞書); }
function idで(results, 結果) {
  return results.filter(function (r) { return r.結果 === 結果; }).map(function (r) { return r.rule.id; });
}

/* --- サンプル1（クッキー：お手本）--- */
var r1 = 検証(JSON.parse(JSON.stringify(Samples['クッキー'].データ)));
var e1 = idで(r1, 'error');
console.log('  サンプル1 クッキー：error = ' + (e1.length ? e1.join(', ') : 'なし'));
ok(e1.length === 0, 'サンプル1（お手本）に error が出ない', e1.join(', '));
ok(r1.filter(function (r) { return r.結果 === 'check'; }).length > 0, 'サンプル1でチェックリストが提示される');

/* --- サンプル2（くるみパン：わざと間違いあり）--- */
var r2 = 検証(JSON.parse(JSON.stringify(Samples['くるみパン'].データ)));
var e2 = idで(r2, 'error');
console.log('  サンプル2 くるみパン：error = ' + e2.join(', '));
ok(e2.indexOf('allergen-mandatory-8') >= 0, 'サンプル2でくるみの表示漏れを検出する');
ok(e2.indexOf('allergen-egg-white-yolk') >= 0, 'サンプル2で卵黄の「卵を含む」漏れを検出する');
ok(e2.indexOf('additive-usage-name-8') >= 0, 'サンプル2で「保存料」の物質名なしを検出する');
ok(e2.indexOf('origin-of-material') >= 0, 'サンプル2で原料原産地名の未記入を検出する');

/* --- 個別のふるまい --- */
function 素材(over) {
  return Object.assign(JSON.parse(JSON.stringify(Samples['クッキー'].データ)), over || {});
}

/* 空の入力では必須項目が error になる */
var 空 = {
  名称: '', 原材料: [], 添加物: [], 添加物区分方法: '', アレルゲン表示方式: '個別表示',
  アレルゲン一括文: '', 内容量: '', 期限: { 種別: '賞味期限', 日付: '', 期間区分: '3か月以内' },
  保存方法: '', 事業者: { 区分: '製造者', 名称: '', 住所: '' }, 原料原産地名: '', 原産国名: '',
  輸入品: false, 文字サイズ: 8, 表示可能面積: 300, 確認済み: {}
};
var e0 = idで(検証(空), 'error');
['name-required', 'ingredient-required', 'quantity-required', 'date-required',
  'storage-required', 'business-name-required', 'business-address-required'].forEach(function (id) {
    ok(e0.indexOf(id) >= 0, '空入力で ' + id + ' が error になる');
  });

/* 乳の表記ゆれ */
var 乳誤 = 素材({ 原材料: [{ 表示名: 'マーガリン（乳を含む）', アレルゲン: ['乳'] }] });
ok(idで(検証(乳誤), 'error').indexOf('allergen-milk-notation') >= 0, '「乳を含む」を error にする');

var 乳正 = 素材({ 原材料: [{ 表示名: 'マーガリン（乳成分を含む）', アレルゲン: ['乳'] }] });
ok(idで(検証(乳正), 'error').indexOf('allergen-milk-notation') < 0, '「乳成分を含む」は error にしない');

/* 代替表記による省略が認められること（小麦粉 → 小麦の表示とみなす） */
var 小麦 = 素材({ 原材料: [{ 表示名: '小麦粉', アレルゲン: ['小麦'] }], 添加物: [] });
ok(検証(小麦).filter(function (r) {
  return r.rule.id === 'allergen-mandatory-8' && r.結果 === 'error';
}).length === 0, '「小麦粉」は代替表記として小麦の表示とみなす');

/* 一括表示で列挙漏れを検出する */
var 一括 = 素材({
  アレルゲン表示方式: '一括表示',
  アレルゲン一括文: '小麦',
  原材料: [{ 表示名: '小麦粉', アレルゲン: ['小麦'] }, { 表示名: 'バター', アレルゲン: ['乳'] }],
  添加物: []
});
var e一括 = idで(検証(一括), 'error');
ok(e一括.indexOf('allergen-ikkatsu-all') >= 0, '一括表示で乳成分の列挙漏れを検出する');

/* 個別表示と一括表示の併用を検出する */
var 併用 = 素材({
  アレルゲン表示方式: '一括表示', アレルゲン一括文: '小麦・乳成分',
  原材料: [{ 表示名: '小麦粉（小麦を含む）', アレルゲン: ['小麦'] }]
});
ok(idで(検証(併用), 'error').indexOf('allergen-method-no-mixing') >= 0, '個別表示と一括表示の併用を検出する');

/* 用途名併記 */
var 用途OK = 素材({ 添加物: [{ 表示名: '酸化防止剤（ビタミンE）', アレルゲン: [] }] });
ok(idで(検証(用途OK), 'error').indexOf('additive-usage-name-8') < 0, '「酸化防止剤（ビタミンE）」は通る');
var 用途NG = 素材({ 添加物: [{ 表示名: '酸化防止剤', アレルゲン: [] }] });
ok(idで(検証(用途NG), 'error').indexOf('additive-usage-name-8') >= 0, '「酸化防止剤」だけは error になる');

/* L-フェニルアラニン */
var LP無 = 素材({ 添加物: [{ 表示名: '甘味料（アスパルテーム）', アレルゲン: [] }], 注意喚起: '' });
ok(idで(検証(LP無), 'error').indexOf('additive-l-phenylalanine') >= 0, 'アスパルテーム使用時の注意喚起漏れを検出する');
var LP有 = 素材({
  添加物: [{ 表示名: '甘味料（アスパルテーム・L-フェニルアラニン化合物）', アレルゲン: [] }]
});
ok(idで(検証(LP有), 'error').indexOf('additive-l-phenylalanine') < 0, 'L-フェニルアラニン化合物の記載があれば通る');

/* 期限の書式 */
var 日付NG = 素材({ 期限: { 種別: '消費期限', 日付: '2026年8月', 期間区分: '3か月以内' } });
ok(idで(検証(日付NG), 'error').indexOf('date-format-within-3months') >= 0, '3か月以内で年月のみは error になる');
var 日付OK = 素材({ 期限: { 種別: '消費期限', 日付: '2026.08.10', 期間区分: '3か月以内' } });
ok(idで(検証(日付OK), 'error').indexOf('date-format-within-3months') < 0, '3か月以内で年月日は通る');

/* 内容量の単位 */
ok(idで(検証(素材({ 内容量: '100' })), 'error').indexOf('quantity-unit') >= 0, '内容量に単位がないと error になる');
ok(idで(検証(素材({ 内容量: '100g' })), 'error').indexOf('quantity-unit') < 0, '内容量「100g」は通る');

/* 文字サイズ */
ok(idで(検証(素材({ 文字サイズ: 7, 表示可能面積: 300 })), 'error').indexOf('font-size-8pt') >= 0,
  '面積300で7ポイントは error になる');
ok(idで(検証(素材({ 文字サイズ: 6, 表示可能面積: 100 })), 'error').indexOf('font-size-8pt') < 0,
  '面積100なら8ポイント未満でも font-size-8pt は適用されない');
ok(idで(検証(素材({ 文字サイズ: 5, 表示可能面積: 100 })), 'error').indexOf('font-size-5-5pt') >= 0,
  '面積100で5ポイントは error になる');

/* 可能性表示の禁止 */
ok(idで(検証(素材({ 注意喚起: '落花生が入っているかもしれません' })), 'error')
  .indexOf('allergen-no-possibility-wording') >= 0, '「かもしれない」表示を検出する');

/* 輸入品 */
var 輸入 = 素材({ 輸入品: true, 原料原産地名: '', 原産国名: '' });
var e輸入 = idで(検証(輸入), 'error');
ok(e輸入.indexOf('origin-country-import') >= 0, '輸入品で原産国名の未記入を検出する');
ok(e輸入.indexOf('origin-of-material') < 0, '輸入品では原料原産地名を求めない');

/* ---------------- 3. ラベル案の組み立て ---------------- */

見出し('3. ラベル案の組み立て');

var txt = Builder.テキストを作る(Samples['クッキー'].データ);
console.log('\n----- ラベル案（サンプル1）-----\n' + txt + '\n-------------------------------');
ok(txt.indexOf('焼き菓子（クッキー）') >= 0, 'ラベル案に名称が入る');
ok(txt.indexOf('／') >= 0, 'スラッシュ区分で原材料と添加物が区切られる');
ok(txt.indexOf('賞味期限') >= 0, 'ラベル案に期限の事項名が入る');
ok(txt.indexOf('販売者') >= 0, 'ラベル案に事業者の事項名が入る');

var 一括txt = Builder.テキストを作る(Object.assign({}, Samples['クッキー'].データ, {
  アレルゲン表示方式: '一括表示', アレルゲン一括文: '小麦・乳成分・大豆'
}));
ok(一括txt.indexOf('（一部に小麦・乳成分・大豆を含む）') >= 0, '一括表示の文が自動で組み立てられる');

var html = Builder.HTMLを作る(Samples['クッキー'].データ);
ok(html.indexOf('<table class="label-table">') >= 0, 'ラベル案のHTMLが生成される');
ok(html.indexOf('<script') < 0, 'ラベル案のHTMLにスクリプトが混入しない');

/* ---------------- 結果 ---------------- */

console.log('\n============================');
console.log('  成功 ' + 成功 + ' / 失敗 ' + 失敗);
console.log('============================');
process.exit(失敗 ? 1 : 0);
