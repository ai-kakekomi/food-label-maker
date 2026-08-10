/* ============================================================
 * app.js  画面まわり（入力フォーム・検証・ラベル案）
 * ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'food-label-maker.input.v1';

  var 辞書 = null;
  var 法令ルール = [];
  var 社内ルール = [];
  var state = 初期値();

  function 初期値() {
    return {
      名称: '',
      原材料: [{ 表示名: '', アレルゲン: [] }],
      添加物: [],
      添加物区分方法: '',
      アレルゲン表示方式: '個別表示',
      アレルゲン一括文: '',
      アレルゲン対象範囲: '28品目',
      原料原産地名: '',
      原産国名: '',
      輸入品: false,
      内容量: '',
      期限: { 種別: '賞味期限', 日付: '', 期間区分: '3か月以内' },
      保存方法: '',
      事業者: { 区分: '製造者', 名称: '', 住所: '' },
      製造所固有記号: '',
      固有記号応答義務: '',
      文字サイズ: 8,
      表示可能面積: 300,
      注意喚起: '',
      栄養成分: 栄養成分の初期値(),
      確認済み: {}
    };
  }

  /* 栄養成分（別記様式2）。項目の順序は法令で決まっているので、この並びを変えないこと。 */
  function 栄養成分の初期値() {
    return {
      省略: false,
      省略理由: '',
      食品単位: '100g',
      一食分の量: '',
      熱量: '',
      たんぱく質: '',
      脂質: '',
      炭水化物: '',
      食塩相当量: '',
      ナトリウム併記: false,
      ナトリウム塩無添加: false,
      ナトリウム: '',
      値の性格: '分析値',
      推定値文言: ''
    };
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- 起動 ---------------- */

  LabelRules.loadBaseRules().then(function (r) {
    辞書 = r.辞書;
    法令ルール = r.ルール;
    復元();
    描画();
    バインド();
  }).catch(function (e) {
    $('results').innerHTML =
      '<div class="msg msg-error"><p><strong>ルールファイルを読み込めませんでした。</strong></p>' +
      '<p>' + esc(e.message) + '</p>' +
      '<p class="help">このツールはローカルのHTTPサーバー経由で開いてください。' +
      'ファイルを直接ダブルクリックして開く（file:// で開く）と、ブラウザの制限でルールファイルを読み込めません。' +
      'README.md の「動かし方」を参照してください。</p></div>';
  });

  /* ---------------- 保存と復元 ---------------- */

  function 保存() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 容量超過等は無視 */ }
  }
  function 復元() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        var o = JSON.parse(s);
        state = Object.assign(初期値(), o);
        state.期限 = Object.assign({ 種別: '賞味期限', 日付: '', 期間区分: '3か月以内' }, o.期限 || {});
        state.事業者 = Object.assign({ 区分: '製造者', 名称: '', 住所: '' }, o.事業者 || {});
        state.栄養成分 = Object.assign(栄養成分の初期値(), o.栄養成分 || {});
        state.確認済み = o.確認済み || {};
      }
    } catch (e) { state = 初期値(); }
  }

  /* ---------------- フォームの描画 ---------------- */

  function 描画() {
    $('f-name').value = state.名称 || '';
    $('f-sep').value = state.添加物区分方法 || '';
    document.querySelectorAll('input[name="allergen-mode"]').forEach(function (el) {
      el.checked = el.value === state.アレルゲン表示方式;
    });
    $('f-ikkatsu').value = state.アレルゲン一括文 || '';
    $('f-allergen-scope').value = state.アレルゲン対象範囲 || '28品目';
    $('f-import').checked = !!state.輸入品;
    $('f-origin').value = state.原料原産地名 || '';
    $('f-country').value = state.原産国名 || '';
    $('f-qty').value = state.内容量 || '';
    $('f-date-type').value = state.期限.種別 || '賞味期限';
    $('f-date-span').value = state.期限.期間区分 || '3か月以内';
    $('f-date').value = state.期限.日付 || '';
    $('f-storage').value = state.保存方法 || '';
    $('f-biz-type').value = state.事業者.区分 || '製造者';
    $('f-biz-name').value = state.事業者.名称 || '';
    $('f-biz-addr').value = state.事業者.住所 || '';
    $('f-code').value = state.製造所固有記号 || '';
    $('f-code-contact').value = state.固有記号応答義務 || '';
    $('f-area').value = state.表示可能面積;
    $('f-font').value = state.文字サイズ;
    $('f-note').value = state.注意喚起 || '';

    /* 項目の順序を法令どおりに保つため、毎回ひな形に載せ替える */
    state.栄養成分 = Object.assign(栄養成分の初期値(), state.栄養成分 || {});
    var n = state.栄養成分;
    $('f-nutri-omit').checked = !!n.省略;
    $('f-nutri-omit-reason').value = n.省略理由 || '';
    $('f-nutri-unit').value = n.食品単位 || '100g';
    $('f-nutri-serving').value = n.一食分の量 || '';
    $('f-nutri-energy').value = n.熱量 || '';
    $('f-nutri-protein').value = n.たんぱく質 || '';
    $('f-nutri-fat').value = n.脂質 || '';
    $('f-nutri-carb').value = n.炭水化物 || '';
    $('f-nutri-salt').value = n.食塩相当量 || '';
    $('f-nutri-na-show').checked = !!n.ナトリウム併記;
    $('f-nutri-na-free').checked = !!n.ナトリウム塩無添加;
    $('f-nutri-na').value = n.ナトリウム || '';
    $('f-nutri-kind').value = n.値の性格 || '分析値';
    $('f-nutri-estimate').value = n.推定値文言 || '';

    行を描画('ingredient-rows', state.原材料, '原材料');
    行を描画('additive-rows', state.添加物, '添加物');
    表示切替();
    ラベル更新();
  }

  function 表示切替() {
    $('wrap-ikkatsu').hidden = state.アレルゲン表示方式 !== '一括表示';
    $('wrap-country').hidden = !state.輸入品;
    $('wrap-origin').hidden = !!state.輸入品;

    var n = state.栄養成分;
    $('wrap-nutrition').hidden = !!n.省略;
    $('wrap-nutri-omit-reason').hidden = !n.省略;
    $('wrap-nutri-serving').hidden = n.食品単位 !== '1食分';
    $('wrap-nutri-na').hidden = !n.ナトリウム併記;
    $('wrap-nutri-estimate').hidden = n.値の性格 !== '推定値';

    /* 3項目が数値でそろっているときだけ、熱量の計算ボタンを出す */
    var kcal = LabelEngine.熱量を計算(n.たんぱく質, n.脂質, n.炭水化物);
    $('wrap-nutri-energy-calc').hidden = kcal === null;
    if (kcal !== null) {
      $('btn-energy-calc').textContent = '計算値：' + kcal + 'kcal を入れる';
    }
  }

  function 行を描画(containerId, list, 種別) {
    var box = $(containerId);
    box.innerHTML = '';
    list.forEach(function (item, idx) {
      box.appendChild(行を作る(item, idx, 種別));
    });
    if (!list.length) {
      var p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 種別 === '添加物' ? '添加物を使っていない場合は空のままで構いません。' : '「＋ 原材料を追加」から入力してください。';
      box.appendChild(p);
    }
  }

  function 行を作る(item, idx, 種別) {
    var row = document.createElement('div');
    row.className = 'row';
    row.dataset.kind = 種別;
    row.dataset.index = idx;

    var num = document.createElement('span');
    num.className = 'row-num';
    num.textContent = (idx + 1);
    row.appendChild(num);

    var main = document.createElement('div');
    main.className = 'row-main';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'row-input';
    input.value = item.表示名 || '';
    input.placeholder = 種別 === '添加物'
      ? '例：酸化防止剤（ビタミンE）'
      : '例：マーガリン（乳成分を含む）';
    input.addEventListener('input', function () {
      item.表示名 = input.value;
      保存(); ラベル更新();
    });
    main.appendChild(input);

    /* アレルゲン選択 */
    var det = document.createElement('details');
    det.className = 'allergen-picker';
    var sum = document.createElement('summary');
    function サマリ更新() {
      var a = item.アレルゲン || [];
      sum.textContent = a.length ? 'アレルゲン：' + a.join('・') : 'アレルゲン：なし（クリックして選ぶ）';
      sum.className = a.length ? 'has-allergen' : '';
    }
    サマリ更新();
    det.appendChild(sum);

    var chips = document.createElement('div');
    chips.className = 'chips';
    ['特定原材料', '特定原材料に準ずるもの'].forEach(function (区分) {
      var h = document.createElement('p');
      h.className = 'chips-head';
      h.textContent = 区分 === '特定原材料' ? '特定原材料（表示義務8品目）' : '特定原材料に準ずるもの（表示推奨20品目）';
      chips.appendChild(h);
      var wrap = document.createElement('div');
      wrap.className = 'chips-body';
      辞書.品目一覧.filter(function (d) { return d.区分 === 区分; }).forEach(function (d) {
        var lab = document.createElement('label');
        lab.className = 'chip' + (区分 === '特定原材料' ? ' chip-must' : '');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = (item.アレルゲン || []).indexOf(d.品目) >= 0;
        cb.addEventListener('change', function () {
          item.アレルゲン = item.アレルゲン || [];
          var i = item.アレルゲン.indexOf(d.品目);
          if (cb.checked && i < 0) item.アレルゲン.push(d.品目);
          if (!cb.checked && i >= 0) item.アレルゲン.splice(i, 1);
          サマリ更新(); 保存();
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(d.品目));
        wrap.appendChild(lab);
      });
      chips.appendChild(wrap);
    });
    det.appendChild(chips);
    main.appendChild(det);
    row.appendChild(main);

    var tools = document.createElement('div');
    tools.className = 'row-tools';
    tools.appendChild(小ボタン('↑', '上へ移動', function () { 並べ替え(種別, idx, -1); }));
    tools.appendChild(小ボタン('↓', '下へ移動', function () { 並べ替え(種別, idx, 1); }));
    tools.appendChild(小ボタン('×', '削除', function () { 削除(種別, idx); }));
    row.appendChild(tools);
    return row;
  }

  function 小ボタン(text, title, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-mini';
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', fn);
    return b;
  }

  function 配列(種別) { return 種別 === '添加物' ? state.添加物 : state.原材料; }

  function 並べ替え(種別, idx, dir) {
    var a = 配列(種別);
    var j = idx + dir;
    if (j < 0 || j >= a.length) return;
    var t = a[idx]; a[idx] = a[j]; a[j] = t;
    保存();
    行を描画(種別 === '添加物' ? 'additive-rows' : 'ingredient-rows', a, 種別);
    ラベル更新();
  }

  function 削除(種別, idx) {
    var a = 配列(種別);
    a.splice(idx, 1);
    保存();
    行を描画(種別 === '添加物' ? 'additive-rows' : 'ingredient-rows', a, 種別);
    ラベル更新();
  }

  /* ---------------- 入力の受け取り ---------------- */

  function バインド() {
    var 単純 = [
      ['f-name', function (v) { state.名称 = v; }],
      ['f-sep', function (v) { state.添加物区分方法 = v; }],
      ['f-ikkatsu', function (v) { state.アレルゲン一括文 = v; }],
      ['f-allergen-scope', function (v) { state.アレルゲン対象範囲 = v; }],
      ['f-origin', function (v) { state.原料原産地名 = v; }],
      ['f-country', function (v) { state.原産国名 = v; }],
      ['f-qty', function (v) { state.内容量 = v; }],
      ['f-date-type', function (v) { state.期限.種別 = v; }],
      ['f-date-span', function (v) { state.期限.期間区分 = v; }],
      ['f-date', function (v) { state.期限.日付 = v; }],
      ['f-storage', function (v) { state.保存方法 = v; }],
      ['f-biz-type', function (v) { state.事業者.区分 = v; }],
      ['f-biz-name', function (v) { state.事業者.名称 = v; }],
      ['f-biz-addr', function (v) { state.事業者.住所 = v; }],
      ['f-code', function (v) { state.製造所固有記号 = v; }],
      ['f-code-contact', function (v) { state.固有記号応答義務 = v; }],
      ['f-area', function (v) { state.表示可能面積 = parseFloat(v) || 0; }],
      ['f-font', function (v) { state.文字サイズ = parseFloat(v) || 0; }],
      ['f-note', function (v) { state.注意喚起 = v; }],
      ['f-nutri-omit-reason', function (v) { state.栄養成分.省略理由 = v; }],
      ['f-nutri-unit', function (v) { state.栄養成分.食品単位 = v; }],
      ['f-nutri-serving', function (v) { state.栄養成分.一食分の量 = v; }],
      ['f-nutri-energy', function (v) { state.栄養成分.熱量 = v; }],
      ['f-nutri-protein', function (v) { state.栄養成分.たんぱく質 = v; }],
      ['f-nutri-fat', function (v) { state.栄養成分.脂質 = v; }],
      ['f-nutri-carb', function (v) { state.栄養成分.炭水化物 = v; }],
      ['f-nutri-salt', function (v) { state.栄養成分.食塩相当量 = v; }],
      ['f-nutri-na', function (v) { state.栄養成分.ナトリウム = v; }],
      ['f-nutri-kind', function (v) { state.栄養成分.値の性格 = v; }],
      ['f-nutri-estimate', function (v) { state.栄養成分.推定値文言 = v; }]
    ];
    単純.forEach(function (p) {
      var el = $(p[0]);
      el.addEventListener('input', function () { p[1](el.value); 保存(); 表示切替(); ラベル更新(); });
      el.addEventListener('change', function () { p[1](el.value); 保存(); 表示切替(); ラベル更新(); });
    });

    $('f-import').addEventListener('change', function () {
      state.輸入品 = $('f-import').checked;
      保存(); 表示切替(); ラベル更新();
    });

    [
      ['f-nutri-omit', function (c) { state.栄養成分.省略 = c; }],
      ['f-nutri-na-show', function (c) { state.栄養成分.ナトリウム併記 = c; }],
      ['f-nutri-na-free', function (c) { state.栄養成分.ナトリウム塩無添加 = c; }]
    ].forEach(function (p) {
      $(p[0]).addEventListener('change', function () {
        p[1]($(p[0]).checked);
        保存(); 表示切替(); ラベル更新();
      });
    });

    /* ナトリウム(mg) → 食塩相当量(g) の換算補助 */
    $('btn-na-convert').addEventListener('click', function () {
      var mg = $('f-nutri-na-input').value;
      var g = LabelEngine.食塩相当量に換算(mg);
      if (g === null) {
        トースト('ナトリウムの値を数値で入力してください');
        return;
      }
      state.栄養成分.食塩相当量 = String(g);
      $('f-nutri-salt').value = String(g);
      保存(); ラベル更新();
      トースト('食塩相当量 ' + g + 'g を入れました（' + mg + 'mg × 2.54 ÷ 1000）');
    });

    /* たんぱく質・脂質・炭水化物 → 熱量(kcal) の計算補助（押したときだけ入れる） */
    $('btn-energy-calc').addEventListener('click', function () {
      var n = state.栄養成分;
      var kcal = LabelEngine.熱量を計算(n.たんぱく質, n.脂質, n.炭水化物);
      if (kcal === null) {
        トースト('たんぱく質・脂質・炭水化物を数値で入力してください');
        return;
      }
      state.栄養成分.熱量 = String(kcal);
      $('f-nutri-energy').value = String(kcal);
      保存(); ラベル更新();
      トースト('熱量 ' + kcal + 'kcal を入れました（目安の計算値です。「推定値」の併記をご確認ください）');
    });

    document.querySelectorAll('input[name="allergen-mode"]').forEach(function (el) {
      el.addEventListener('change', function () {
        if (el.checked) { state.アレルゲン表示方式 = el.value; 保存(); 表示切替(); ラベル更新(); }
      });
    });

    document.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        var 種別 = b.dataset.add === 'additive' ? '添加物' : '原材料';
        配列(種別).push({ 表示名: '', アレルゲン: [] });
        保存();
        行を描画(種別 === '添加物' ? 'additive-rows' : 'ingredient-rows', 配列(種別), 種別);
        var rows = $(種別 === '添加物' ? 'additive-rows' : 'ingredient-rows').querySelectorAll('.row-input');
        if (rows.length) rows[rows.length - 1].focus();
      });
    });

    document.querySelectorAll('[data-sample]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = LabelSamples[b.dataset.sample];
        if (!s) return;
        state = JSON.parse(JSON.stringify(s.データ));
        保存(); 描画();
        検証();
        トースト(s.表示名 + ' を読み込みました');
      });
    });

    $('btn-clear').addEventListener('click', function () {
      if (!confirm('入力した内容をすべて消します。よろしいですか？')) return;
      state = 初期値();
      保存(); 描画();
      $('results').innerHTML = '';
      $('summary').innerHTML = '';
      トースト('入力を消しました');
    });

    $('btn-validate').addEventListener('click', 検証);
    $('btn-print').addEventListener('click', function () { window.print(); });
    $('btn-copy').addEventListener('click', function () {
      var t = LabelBuilder.テキストを作る(state);
      navigator.clipboard.writeText(t).then(function () {
        トースト('ラベル案のテキストをコピーしました');
      }, function () {
        window.prompt('下のテキストを選択してコピーしてください', t);
      });
    });

    $('f-custom').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          社内ルール = LabelRules.loadCustomRulesFromText(String(reader.result), file.name);
          $('custom-status').className = 'custom-status ok';
          $('custom-status').textContent = '社内ルール ' + 社内ルール.length + '件を読み込みました（' + file.name + '）';
          検証();
        } catch (e) {
          社内ルール = [];
          $('custom-status').className = 'custom-status ng';
          $('custom-status').textContent = '読み込めませんでした：' + e.message;
        }
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  /* ---------------- 検証 ---------------- */

  function 検証() {
    var rules = 法令ルール.concat(社内ルール);
    var results = LabelEngine.検証する(state, rules, 辞書);
    結果を描画(results);
    ラベル更新(results);
  }

  function 結果を描画(results) {
    var 件数 = { error: 0, warn: 0, check: 0, pass: 0 };
    results.forEach(function (r) { 件数[r.結果] = (件数[r.結果] || 0) + 1; });

    $('summary').innerHTML =
      '<span class="pill pill-error">要修正 ' + 件数.error + '</span>' +
      '<span class="pill pill-warn">要確認 ' + 件数.warn + '</span>' +
      '<span class="pill pill-check">人の確認が必要 ' + 件数.check + '</span>' +
      '<span class="pill pill-pass">問題なし ' + 件数.pass + '</span>';

    var 並び = { error: 0, warn: 1, check: 2, pass: 3 };
    var sorted = results.slice().sort(function (a, b) { return 並び[a.結果] - 並び[b.結果]; });

    /* 機械判定の指摘（要修正・要確認）が1件もないときだけ、成功バナーを出す。
       「要修正0件だが要確認あり」のときは出さない。 */
    var html = '';
    if (results.length && 件数.error === 0 && 件数.warn === 0) {
      html += '<div class="goodbox" id="goodbox" role="status">';
      html += '<p class="goodbox-title">✓ 機械判定で検出された問題はありませんでした</p>';
      if (件数.check > 0) {
        html += '<p class="goodbox-sub">ただし、機械では判定できない項目が残っています。' +
          '下のチェックリストの確認をお願いします。</p>';
        html += '<p class="goodbox-count">人の確認が必要な項目：<strong>' + 件数.check + '件</strong></p>';
      } else {
        html += '<p class="goodbox-sub">チェックリストの項目もすべて確認済みです。</p>';
      }
      html += '<p class="goodbox-note">この表示は、このツールに入っているルールの範囲で' +
        '問題が見つからなかったという意味です。版下にする前に、必ず表示の責任者が最終確認してください。</p>';
      html += '</div>';
    }

    var 現在 = null;
    var 見出し = {
      error: '要修正（法令違反のおそれがあります）',
      warn: '要確認（推奨事項・慣行）',
      check: '人の確認が必要（機械では判定できません）',
      pass: '問題なし'
    };
    sorted.forEach(function (r) {
      if (r.結果 !== 現在) {
        if (現在 !== null) html += '</div>';
        現在 = r.結果;
        html += '<h3 class="res-head res-' + 現在 + '">' + 見出し[現在] + '</h3><div class="res-group">';
      }
      html += 項目HTML(r);
    });
    if (現在 !== null) html += '</div>';
    if (!html) html = '<p class="muted">入力してから「この内容を検証する」を押してください。</p>';
    $('results').innerHTML = html;

    /* チェックリストのチェックボックス */
    $('results').querySelectorAll('input[data-confirm]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        state.確認済み[cb.dataset.confirm] = cb.checked;
        保存();
        検証();
      });
    });
  }

  function 項目HTML(r) {
    var rule = r.rule;
    var 未監修 = !rule.最終確認日;
    var h = '<details class="res-item res-' + r.結果 + '"' + (r.結果 === 'pass' ? '' : ' open') + '>';
    h += '<summary>';
    if (r.結果 === 'check') {
      h += '<label class="confirm"><input type="checkbox" data-confirm="' + esc(rule.id) + '"> 確認しました</label> ';
    }
    h += '<span class="res-title">' + esc(rule.名称) + '</span>';
    h += '<span class="badge badge-' + (rule.由来 === 'custom' ? 'custom' : 'law') + '">' +
      (rule.由来 === 'custom' ? '社内ルール' : '法令') + '</span>';
    if (未監修) h += '<span class="badge badge-unreviewed" title="専門家によるレビューがまだ行われていません">未監修</span>';
    h += '</summary>';
    h += '<div class="res-body">';
    if (r.結果 !== 'pass') h += '<p class="res-msg">' + esc(r.メッセージ) + '</p>';
    if (r.結果 === 'check') h += '<p class="res-msg">' + esc(LabelEngine.展開(rule.判定, r.変数)) + '</p>';
    if (r.注記) h += '<p class="res-msg">' + esc(r.注記) + '</p>';
    if (rule.ヒント) h += '<div class="res-hint">' + esc(rule.ヒント).replace(/\n/g, '<br>') + '</div>';
    h += '<p class="res-src"><strong>根拠：</strong>' + esc(rule.根拠);
    if (rule.出典URL) h += ' ／ <a href="' + esc(rule.出典URL) + '" target="_blank" rel="noopener">出典を開く</a>';
    h += '<br><strong>最終確認日：</strong>' + (rule.最終確認日 ? esc(rule.最終確認日) : '未記入（未監修）');
    h += ' ／ <span class="rule-id">' + esc(rule.id) + '</span></p>';
    h += '</div></details>';
    return h;
  }

  /* ---------------- ラベル案 ---------------- */

  function ラベル更新(results) {
    $('label-preview').innerHTML = LabelBuilder.HTMLを作る(state);
    var pt = parseFloat(state.文字サイズ) || 8;
    $('label-preview').style.setProperty('--label-font-size', Math.max(pt, 8) + 'pt');
    var meta = [];
    meta.push('設定した文字サイズ：' + state.文字サイズ + 'ポイント');
    meta.push('表示可能面積：' + state.表示可能面積 + '平方センチメートル');
    if (results) {
      var e = results.filter(function (r) { return r.結果 === 'error'; }).length;
      meta.push(e ? '要修正の指摘が ' + e + '件あります。修正してから版下に使ってください。' : '要修正の指摘はありません（人の確認は別途必要です）。');
    }
    $('label-meta').textContent = meta.join('　／　');
  }

  /* ---------------- おしらせ ---------------- */

  var toastTimer = null;
  function トースト(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
})();
