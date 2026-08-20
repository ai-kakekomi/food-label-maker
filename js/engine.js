/* ============================================================
 * engine.js  ルール判定エンジン
 *
 * ルールYAMLの「機械判定.種別」ごとに判定関数を用意しています。
 * 「確認事項」は機械では判定せず、人が確認するチェックリストとして返します。
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 入力値の取り出し ---------- */

  function 原材料テキスト(input) {
    return (input.原材料 || []).map(function (x) { return x.表示名 || ''; }).join('、');
  }
  function 添加物テキスト(input) {
    return (input.添加物 || []).map(function (x) { return x.表示名 || ''; }).join('、');
  }
  function 全文(input) {
    var e = input.事業者 || {};
    return [
      input.名称, 原材料テキスト(input), 添加物テキスト(input), input.アレルゲン一括文,
      input.内容量, (input.期限 || {}).種別, (input.期限 || {}).日付, input.保存方法,
      input.原料原産地名, input.原産国名, e.区分, e.名称, e.住所,
      input.製造所固有記号, input.注意喚起
    ].filter(Boolean).join('\n');
  }

  /* ---------- 栄養成分 ---------- */

  /* 別記様式2の並び順。上から順に表示します。
     任意表示の成分（ビタミン等）を将来足すときは、この配列に
     { キー: '飽和脂肪酸', 単位: 'g', 義務: false } のように加えます。 */
  var 栄養成分項目 = [
    { キー: '熱量', 単位: 'kcal', 義務: true },
    { キー: 'たんぱく質', 単位: 'g', 義務: true },
    { キー: '脂質', 単位: 'g', 義務: true },
    { キー: '炭水化物', 単位: 'g', 義務: true },
    { キー: '食塩相当量', 単位: 'g', 義務: true }
  ];

  function 栄養(input) { return input.栄養成分 || {}; }

  /* 「12」「0.5」「20〜25」のような書き方を数値とみなす */
  var 数値パターン = /^\s*\d+(\.\d+)?\s*([~〜\-－ー]\s*\d+(\.\d+)?\s*)?$/;
  function 数値として読めるか(v) { return 数値パターン.test(String(v)); }

  /* ナトリウム(mg) から食塩相当量(g) を求める（小数第2位まで） */
  function 食塩相当量に換算(ナトリウムmg) {
    var n = parseFloat(ナトリウムmg);
    if (isNaN(n)) return null;
    return Math.round(n * 2.54 / 1000 * 100) / 100;
  }

  /* エネルギー換算係数（Atwater係数）による熱量の目安 */
  function 熱量を計算(たんぱく質g, 脂質g, 炭水化物g) {
    var p = parseFloat(たんぱく質g);
    var f = parseFloat(脂質g);
    var c = parseFloat(炭水化物g);
    if (isNaN(p) || isNaN(f) || isNaN(c)) return null;
    return Math.round(p * 4 + f * 9 + c * 4);
  }

  var FIELD_GETTERS = {
    '名称': function (i) { return i.名称; },
    '原材料一覧': function (i) { return (i.原材料 || []).filter(function (x) { return (x.表示名 || '').trim(); }); },
    '添加物一覧': function (i) { return (i.添加物 || []).filter(function (x) { return (x.表示名 || '').trim(); }); },
    '原材料名': 原材料テキスト,
    '添加物': 添加物テキスト,
    '内容量': function (i) { return i.内容量; },
    '保存方法': function (i) { return i.保存方法; },
    '原料原産地名': function (i) { return i.原料原産地名; },
    '原産国名': function (i) { return i.原産国名; },
    '期限.種別': function (i) { return (i.期限 || {}).種別; },
    '期限.日付': function (i) { return (i.期限 || {}).日付; },
    '事業者.区分': function (i) { return (i.事業者 || {}).区分; },
    '事業者.名称': function (i) { return (i.事業者 || {}).名称; },
    '事業者.住所': function (i) { return (i.事業者 || {}).住所; },
    '製造所固有記号': function (i) { return i.製造所固有記号; },
    '文字サイズ': function (i) { return i.文字サイズ; },
    '表示可能面積': function (i) { return i.表示可能面積; },
    '添加物区分方法': function (i) { return i.添加物区分方法; },
    'アレルゲン表示方式': function (i) { return i.アレルゲン表示方式; },
    'アレルゲン一括文': function (i) { return i.アレルゲン一括文; },
    '注意喚起': function (i) { return i.注意喚起; },
    '輸入品': function (i) { return !!i.輸入品; },
    '栄養成分.省略': function (i) { return !!栄養(i).省略; },
    '栄養成分.食品単位': function (i) { return 栄養(i).食品単位; },
    '栄養成分.一食分の量': function (i) { return 栄養(i).一食分の量; },
    '栄養成分.値の性格': function (i) { return 栄養(i).値の性格; },
    '栄養成分.推定値文言': function (i) { return 栄養(i).推定値文言; },
    '栄養成分.ナトリウム': function (i) { return 栄養(i).ナトリウム; },
    '全文': 全文
  };

  function getField(input, path) {
    var g = FIELD_GETTERS[path];
    return g ? g(input) : undefined;
  }

  function isEmpty(v) {
    if (v === null || v === undefined) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'boolean') return false;
    return String(v).trim() === '';
  }

  /* ---------- 適用条件 ---------- */

  function 適用条件を満たすか(rule, input) {
    var conds = rule.適用条件 || [];
    for (var i = 0; i < conds.length; i++) {
      var c = conds[i];
      var v = getField(input, c['対象']);
      var ok;
      switch (c['演算']) {
        case '空でない': ok = !isEmpty(v); break;
        case '空である': ok = isEmpty(v); break;
        case '真': ok = v === true || v === 'true'; break;
        case '偽': ok = !(v === true || v === 'true'); break;
        case '等しい': ok = String(v) === String(c['値']); break;
        case '含む': ok = String(v || '').indexOf(String(c['値'])) >= 0; break;
        case '数値以下': ok = parseFloat(v) <= parseFloat(c['値']); break;
        case '数値より大きい': ok = parseFloat(v) > parseFloat(c['値']); break;
        case '記載場所表記': ok = 記載場所の表記か(String(v || '')); break;
        default: ok = true;
      }
      if (!ok) return false;
    }
    return true;
  }

  /* ---------- アレルゲン判定の下ごしらえ ---------- */

  /* 製品全体に含まれるアレルゲン（品目名の配列）を集める */
  function 含有アレルゲン一覧(input) {
    var set = {};
    (input.原材料 || []).forEach(function (x) {
      (x.アレルゲン || []).forEach(function (a) { set[a] = true; });
    });
    (input.添加物 || []).forEach(function (x) {
      (x.アレルゲン || []).forEach(function (a) { set[a] = true; });
    });
    return Object.keys(set);
  }

  /* ある品目が、ある表示テキストの中で「表示されている」と言えるか */
  function 品目が表示されているか(品目, dict, input) {
    var d = dict.検索(品目);
    if (!d) return false;
    var 含む形 = d.表示形式;          // 乳 → 乳成分
    var 由来形 = d.添加物表示形式;    // 乳 → 乳

    /* 一括表示：（一部に○○を含む）に列挙されていればOK */
    if (input.アレルゲン表示方式 === '一括表示') {
      var 一括 = input.アレルゲン一括文 || '';
      return 一括.indexOf(含む形) >= 0 || 一括.indexOf(品目) >= 0;
    }

    /* 個別表示：どれか1つの原材料・添加物に表示があればよい
       （別添 第1-3(2)① 繰り返しになるアレルゲンの省略） */
    var 候補 = [].concat(input.原材料 || [], input.添加物 || []);
    for (var i = 0; i < 候補.length; i++) {
      var t = 候補[i].表示名 || '';
      if (!t) continue;
      /* (1) 明示的な「○○を含む」「○○由来」 */
      if (t.indexOf(含む形 + 'を含む') >= 0) return true;
      if (t.indexOf(由来形 + '由来') >= 0) return true;
      if (t.indexOf(品目 + 'を含む') >= 0) return true;
      /* (2) 代替表記・拡大表記・品目名そのもの（省略が認められる） */
      if (表記に該当するか(t, d)) return true;
    }
    return false;
  }

  /* 表示名が、その品目の名称・代替表記・拡大表記に該当するか */
  function 表記に該当するか(text, d) {
    var cands = [d.品目].concat(d.代替表記 || [], d.拡大表記 || []);
    for (var i = 0; i < cands.length; i++) {
      if (!cands[i]) continue;
      if (text.indexOf(cands[i]) >= 0) {
        /* 「卵白」「卵黄」は拡大表記による省略が不可（別表3 注記） */
        if (d.品目 === '卵' && /卵白|卵黄/.test(text) && !/卵を含む|たまごを含む/.test(text)) {
          continue;
        }
        return true;
      }
    }
    return false;
  }

  /* ---------- 各種判定 ---------- */

  var CHECKS = {};

  CHECKS['必須項目'] = function (rule, input) {
    var v = getField(input, rule.機械判定['対象']);
    return isEmpty(v) ? [fail(rule)] : [pass(rule)];
  };

  CHECKS['正規表現一致必須'] = function (rule, input) {
    var v = String(getField(input, rule.機械判定['対象']) || '');
    if (!v.trim()) return [];   // 空欄は別の必須ルールが担当する
    var re = new RegExp(rule.機械判定['パターン']);
    return re.test(v) ? [pass(rule)] : [fail(rule)];
  };

  CHECKS['正規表現禁止'] = function (rule, input) {
    var v = String(getField(input, rule.機械判定['対象']) || '');
    var re = new RegExp(rule.機械判定['パターン']);
    var m = v.match(re);
    return m ? [fail(rule, { 該当: m[0] })] : [pass(rule)];
  };

  CHECKS['数値下限'] = function (rule, input) {
    var v = parseFloat(getField(input, rule.機械判定['対象']));
    if (isNaN(v)) return [];
    var lo = parseFloat(rule.機械判定['下限']);
    return v >= lo ? [pass(rule)] : [fail(rule, { 値: v })];
  };

  CHECKS['用途名併記'] = function (rule, input) {
    var names = rule.機械判定['用途名一覧'] || [];
    var out = [];
    (input.添加物 || []).forEach(function (a) {
      var t = (a.表示名 || '').trim();
      if (!t) return;
      names.forEach(function (n) {
        if (t.indexOf(n) < 0) return;
        /* 「用途名（物質名）」の形になっているか */
        var re = new RegExp(n + '\\s*[（(][^）)]+[）)]');
        if (!re.test(t)) out.push(fail(rule, { 用途名: n, 該当: t }));
      });
    });
    return out.length ? out : [pass(rule)];
  };

  CHECKS['Lフェニルアラニン'] = function (rule, input) {
    var 使用 = (input.添加物 || []).some(function (a) {
      return (a.表示名 || '').indexOf('アスパルテーム') >= 0;
    });
    if (!使用) return [];
    var t = 全文(input);
    return /[LＬ]\s*[-－ー‐]?\s*フェニルアラニン/.test(t) ? [pass(rule)] : [fail(rule)];
  };

  CHECKS['アレルゲン表示'] = function (rule, input, ctx) {
    var 範囲 = rule.機械判定['対象範囲'];
    var 品目群 = 含有アレルゲン一覧(input).filter(function (a) {
      var d = ctx.辞書.検索(a);
      return d && d.区分 === 範囲;
    });
    if (!品目群.length) return [];
    var out = [];
    品目群.forEach(function (a) {
      if (品目が表示されているか(a, ctx.辞書, input)) out.push(pass(rule, { 品目: a }));
      else out.push(fail(rule, { 品目: a }));
    });
    return out;
  };

  CHECKS['アレルゲン一括網羅'] = function (rule, input, ctx) {
    var 一括 = input.アレルゲン一括文 || '';
    var 未記載 = 含有アレルゲン一覧(input).filter(function (a) {
      var d = ctx.辞書.検索(a);
      if (!d) return false;
      if (d.区分 === '特定原材料に準ずるもの' && (input.アレルゲン対象範囲 === '9品目' || input.アレルゲン対象範囲 === '8品目')) return false;
      return 一括.indexOf(d.表示形式) < 0 && 一括.indexOf(a) < 0;
    });
    if (!未記載.length) return [pass(rule)];
    return [fail(rule, { 品目: 未記載.join('・') })];
  };

  CHECKS['アレルゲン方式併用'] = function (rule, input) {
    var 個別あり = [].concat(input.原材料 || [], input.添加物 || []).some(function (x) {
      return /[（(][^）)]*(を含む|由来)[^）)]*[）)]/.test(x.表示名 || '');
    });
    var 一括あり = !!(input.アレルゲン一括文 || '').trim();
    if (個別あり && 一括あり) return [fail(rule)];
    return [pass(rule)];
  };

  CHECKS['乳の表記'] = function (rule, input) {
    var t = 原材料テキスト(input) + '\n' + (input.アレルゲン一括文 || '');
    if (/乳を含む/.test(t)) return [fail(rule, { 該当: '乳を含む' })];
    return [pass(rule)];
  };

  CHECKS['乳由来の表記'] = function (rule, input) {
    var t = 添加物テキスト(input);
    if (/乳成分由来/.test(t)) return [fail(rule, { 該当: '乳成分由来' })];
    return [pass(rule)];
  };

  CHECKS['卵白卵黄'] = function (rule, input) {
    if (input.アレルゲン表示方式 === '一括表示') {
      /* 一括表示なら（一部に卵を含む）に卵があればよい */
      var ある = /卵白|卵黄/.test(原材料テキスト(input) + 添加物テキスト(input));
      if (!ある) return [];
      return /卵/.test(input.アレルゲン一括文 || '') ? [pass(rule)] : [fail(rule)];
    }
    var out = [];
    [].concat(input.原材料 || [], input.添加物 || []).forEach(function (x) {
      var t = x.表示名 || '';
      if (!/卵白|卵黄/.test(t)) return;
      if (!/卵を含む/.test(t)) out.push(fail(rule, { 該当: t }));
    });
    return out.length ? out : [pass(rule)];
  };

  CHECKS['大分類表記'] = function (rule, input, ctx) {
    var 例外 = ctx.辞書.大分類の例外表記 || [];
    var 大分類 = ['穀類', '魚介類', '肉類', 'ナッツ類', '野菜類', '果実類', '豆類'];
    var out = [];
    (input.原材料 || []).forEach(function (x) {
      var t = (x.表示名 || '').trim();
      if (!t) return;
      var 例外に該当 = 例外.some(function (e) { return t.indexOf(e) >= 0 || e.indexOf(t) >= 0; });
      if (例外に該当) return;
      大分類.forEach(function (g) {
        if (t.indexOf(g) >= 0) out.push(fail(rule, { 該当: t, 分類: g }));
      });
    });
    return out.length ? out : [pass(rule)];
  };

  /* 枠内に「日付の記載場所」を書き、日付そのものは枠外に印字するパターン
     （例：「この面の右側に記載」「枠外上部に記載」「箱の底面に記載」）。
     枠内に記載箇所を明示すれば適法な表示方法なので、書式チェックの対象外とする。
     ただし「枠外に記載」のような曖昧な書き方では記載箇所を明示したことにならないため、
     別のルール（date-location-must-be-specific）で具体的な場所を書くよう促す。 */
  var 具体場所語 = '面|上部|下部|上|下|左|右|側|端|裏|表|底|ふた|蓋|キャップ|口|袋|箱|缶|パック|ラベル';
  var 曖昧場所語 = '枠外|欄外|別途|別記|この|ここ|他';
  var 記載語 = '記載|表示|記入|印字|表記';
  var 記載場所パターン = new RegExp('(' + 具体場所語 + '|' + 曖昧場所語 + ')[^。\\n]{0,12}(' + 記載語 + ')');

  function 記載場所の表記か(v) {
    return 記載場所パターン.test(v);
  }

  CHECKS['期限日付書式'] = function (rule, input) {
    var 期限 = input.期限 || {};
    var v = String(期限.日付 || '').trim();
    if (!v) return [];
    /* 枠外表示（記載場所の明示）は書式チェックを行わない */
    if (記載場所の表記か(v)) return [pass(rule, { 該当: v })];
    var 要求 = rule.機械判定['要求'];
    var 三か月超 = 期限.期間区分 === '3か月超' && 期限.種別 === '賞味期限';

    if (要求 === '年月日' && 三か月超) return [];
    if (要求 === '年月' && !三か月超) return [];

    var 年月日 = /^(令和|平成)?\s*\d{1,4}\s*[年.．\-\/]\s*\d{1,2}\s*[月.．\-\/]\s*\d{1,2}\s*日?$/.test(v)
      || /^\d{6,8}$/.test(v);
    var 年月 = 年月日 || /^(令和|平成)?\s*\d{1,4}\s*[年.．\-\/]\s*\d{1,2}\s*月?$/.test(v) || /^\d{4,6}$/.test(v);

    if (要求 === '年月日') return 年月日 ? [pass(rule)] : [fail(rule, { 該当: v })];
    return 年月 ? [pass(rule)] : [fail(rule, { 該当: v })];
  };

  CHECKS['製造所固有記号'] = function (rule, input) {
    var v = String(input.製造所固有記号 || '').trim();
    if (!v) return [];
    var ok = /^[＋+]/.test(v);
    var 応答 = !!String(input.固有記号応答義務 || '').trim();
    if (ok && 応答) return [pass(rule)];
    return [fail(rule, { 該当: v })];
  };

  CHECKS['アレルゲン整合性'] = function (rule, input, ctx) {
    var out = [];
    var rows = [].concat(
      (input.原材料 || []).map(function (x) { return { x: x, 種: '原材料' }; }),
      (input.添加物 || []).map(function (x) { return { x: x, 種: '添加物' }; })
    );
    rows.forEach(function (r) {
      var t = (r.x.表示名 || '').trim();
      if (!t) return;
      var 指定 = r.x.アレルゲン || [];
      ctx.辞書.品目一覧.forEach(function (d) {
        if (指定.indexOf(d.品目) >= 0) return;
        var cands = [d.品目].concat(d.代替表記 || [], d.拡大表記 || []);
        for (var i = 0; i < cands.length; i++) {
          if (cands[i] && cands[i].length >= 2 && t.indexOf(cands[i]) >= 0) {
            out.push(fail(rule, { 原材料: t, 品目: d.品目 }));
            return;
          }
        }
      });
    });
    return out.length ? out : [pass(rule)];
  };

  /* ---------- 栄養成分の判定 ---------- */

  /* 義務5項目のうち、値が空のものを指摘する */
  CHECKS['栄養成分5項目'] = function (rule, input) {
    var n = 栄養(input);
    var out = [];
    栄養成分項目.forEach(function (item) {
      if (!item.義務) return;
      if (isEmpty(n[item.キー])) out.push(fail(rule, { 項目: item.キー }));
    });
    return out.length ? out : [pass(rule)];
  };

  /* 別記様式2の並び順どおりか（ルールを書き換えて項目を増やしたときの安全装置） */
  CHECKS['栄養成分順序'] = function (rule, input) {
    var n = 栄養(input);
    var 正しい順 = 栄養成分項目.map(function (x) { return x.キー; });
    var 入力順 = Object.keys(n).filter(function (k) { return 正しい順.indexOf(k) >= 0; });
    var 期待 = 正しい順.filter(function (k) { return 入力順.indexOf(k) >= 0; });
    if (入力順.join('>') === 期待.join('>')) return [pass(rule)];
    return [fail(rule, { 該当: 入力順.join('→') })];
  };

  /* 値が数値（または下限値・上限値）として読めるか */
  CHECKS['栄養成分数値'] = function (rule, input) {
    var n = 栄養(input);
    var out = [];
    栄養成分項目.forEach(function (item) {
      var v = n[item.キー];
      if (isEmpty(v)) return;   // 空欄は 栄養成分5項目 が担当する
      if (!数値として読めるか(v)) out.push(fail(rule, { 項目: item.キー, 該当: String(v) }));
    });
    return out.length ? out : [pass(rule)];
  };

  /* 何あたりの量かの表示（食品単位）。1食分なら目安量の併記が必要 */
  CHECKS['栄養成分食品単位'] = function (rule, input) {
    var n = 栄養(input);
    var 単位 = String(n.食品単位 || '').trim();
    if (!単位) {
      return [fail(rule, { 該当: '何あたりの量か（100g当たり・100ml当たり・1食分当たり）が選ばれていません。栄養成分表示には食品単位を必ず書きます。' })];
    }
    if (単位 === '1食分' && isEmpty(n.一食分の量)) {
      return [fail(rule, { 該当: '「1食分当たり」で表示する場合は、1食分が何グラム（何ミリリットル）かを併記しなければなりません。目安量を入力してください。' })];
    }
    return [pass(rule)];
  };

  /* ナトリウムの量を併記する場合の要件 */
  CHECKS['栄養成分ナトリウム併記'] = function (rule, input) {
    var n = 栄養(input);
    if (!n.ナトリウム併記) return [];
    var out = [];
    if (!n.ナトリウム塩無添加) {
      out.push(fail(rule, { 該当: 'ナトリウムの量を併記できるのは、ナトリウム塩を添加していない食品の場合だけです。添加していない場合は、その旨のチェックを入れてください。' }));
    }
    if (isEmpty(n.食塩相当量)) {
      out.push(fail(rule, { 該当: 'ナトリウムの量を併記する場合でも、食塩相当量の表示は必要です。「ナトリウム○mg（食塩相当量○g）」のように括弧書きで併記します。' }));
    }
    if (isEmpty(n.ナトリウム)) {
      out.push(fail(rule, { 該当: 'ナトリウムの量を併記する設定ですが、ナトリウムの値が空欄です。' }));
    }
    return out.length ? out : [pass(rule)];
  };

  /* 推定値で表示する場合の併記文言 */
  CHECKS['栄養成分推定値文言'] = function (rule, input) {
    var n = 栄養(input);
    if (n.値の性格 !== '推定値') return [];
    return isEmpty(n.推定値文言) ? [fail(rule)] : [pass(rule)];
  };

  CHECKS['確認事項'] = function (rule, input, ctx) {
    var 済 = (input.確認済み || {})[rule.id] === true;
    return [{ 結果: 済 ? 'pass' : 'check', rule: rule, 変数: {} }];
  };

  /* ---------- 結果オブジェクト ---------- */

  function fail(rule, vars) { return { 結果: rule.重大度, rule: rule, 変数: vars || {} }; }
  function pass(rule, vars) { return { 結果: 'pass', rule: rule, 変数: vars || {} }; }

  /* メッセージ内の {品目} などを実際の値に置き換える */
  function 展開(text, vars) {
    return String(text || '').replace(/\{([^}]+)\}/g, function (m, key) {
      return vars && vars[key] !== undefined ? vars[key] : m;
    });
  }

  /* ---------- 実行 ---------- */

  function 検証する(input, rules, 辞書) {
    var ctx = { 辞書: 辞書 };
    var results = [];
    rules.forEach(function (rule) {
      if (!適用条件を満たすか(rule, input)) return;
      var fn = CHECKS[(rule.機械判定 || {})['種別']];
      if (!fn) {
        results.push({ 結果: 'check', rule: rule, 変数: {}, 注記: '未対応の判定種別です: ' + (rule.機械判定 || {})['種別'] });
        return;
      }
      var rs;
      try {
        rs = fn(rule, input, ctx) || [];
      } catch (e) {
        rs = [{ 結果: 'check', rule: rule, 変数: {}, 注記: '判定中にエラー: ' + e.message }];
      }
      rs.forEach(function (r) {
        r.メッセージ = 展開(r.rule.メッセージ, r.変数);
        results.push(r);
      });
    });
    return results;
  }

  global.LabelEngine = {
    検証する: 検証する,
    含有アレルゲン一覧: 含有アレルゲン一覧,
    全文: 全文,
    展開: 展開,
    栄養成分項目: 栄養成分項目,
    食塩相当量に換算: 食塩相当量に換算,
    熱量を計算: 熱量を計算,
    判定種別一覧: Object.keys(CHECKS)
  };
})(window);
