/* ============================================================
 * label.js  一括表示（別記様式1）のラベル案を組み立てる
 * ============================================================ */
(function (global) {
  'use strict';

  function 一括アレルゲン文(input) {
    var s = (input.アレルゲン一括文 || '').trim();
    if (!s) return '';
    if (/^（.*）$/.test(s) || /^\(.*\)$/.test(s)) return s;
    if (s.indexOf('一部に') >= 0) return '（' + s + '）';
    return '（一部に' + s + 'を含む）';
  }

  function 原材料の行(input) {
    var 原 = (input.原材料 || [])
      .map(function (x) { return (x.表示名 || '').trim(); })
      .filter(Boolean).join('、');
    var 添 = (input.添加物 || [])
      .map(function (x) { return (x.表示名 || '').trim(); })
      .filter(Boolean).join('、');
    var 一括 = input.アレルゲン表示方式 === '一括表示' ? 一括アレルゲン文(input) : '';

    if (input.添加物区分方法 === '別欄' || !添) {
      return { 原材料: 原 + (一括 || ''), 添加物: 添 ? 添 + (一括 || '') : '' };
    }
    if (input.添加物区分方法 === 'スラッシュ') {
      return { 原材料: 原 + (一括 || '') + '／' + 添 + (一括 || ''), 添加物: '' };
    }
    /* 改行 */
    return { 原材料: 原 + (一括 || '') + '\n' + 添 + (一括 || ''), 添加物: '' };
  }

  /* 一括表示枠に載せる行を作る（値が空の行は出さない） */
  function 行一覧(input) {
    var g = 原材料の行(input);
    var e = input.事業者 || {};
    var 期限 = input.期限 || {};
    var rows = [];
    function add(label, value) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        rows.push({ 項目: label, 値: String(value) });
      }
    }
    add('名称', input.名称);
    add('原材料名', g.原材料);
    add('添加物', g.添加物);
    add('原料原産地名', input.原料原産地名);
    add('内容量', input.内容量);
    add(期限.種別 || '賞味期限', 期限.日付);
    add('保存方法', input.保存方法);
    add('原産国名', input.原産国名);
    var 事業者値 = [e.名称, input.製造所固有記号].filter(Boolean).join('　') +
      (e.住所 ? '\n' + e.住所 : '');
    add(e.区分 || '製造者', 事業者値.trim());
    return rows;
  }

  /* ---------- 栄養成分表示（別記様式2） ---------- */

  function 栄養成分項目一覧() {
    /* 項目の定義は engine.js が持っています（読み込み順の都合で実行時に参照します） */
    var e = global.LabelEngine;
    return (e && e.栄養成分項目) || [
      { キー: '熱量', 単位: 'kcal', 義務: true },
      { キー: 'たんぱく質', 単位: 'g', 義務: true },
      { キー: '脂質', 単位: 'g', 義務: true },
      { キー: '炭水化物', 単位: 'g', 義務: true },
      { キー: '食塩相当量', 単位: 'g', 義務: true }
    ];
  }

  /* 「栄養成分表示（100g当たり）」の見出しを作る */
  function 栄養成分の見出し(n) {
    var 単位 = String(n.食品単位 || '').trim();
    if (!単位) return '栄養成分表示';
    if (単位 === '1食分') {
      var 目安 = String(n.一食分の量 || '').trim();
      return '栄養成分表示（1食分' + (目安 ? '（' + 目安 + '）' : '') + '当たり）';
    }
    return '栄養成分表示（' + 単位 + '当たり）';
  }

  /* 栄養成分表示の行を作る（値が空の項目も枠は出す） */
  function 栄養成分の行一覧(input) {
    var n = input.栄養成分 || {};
    if (n.省略) return [];
    var 値あり = 栄養成分項目一覧().some(function (item) {
      return String(n[item.キー] == null ? '' : n[item.キー]).trim() !== '';
    });
    if (!値あり) return [];
    return 栄養成分項目一覧().map(function (item) {
      var v = String(n[item.キー] == null ? '' : n[item.キー]).trim();
      var 値 = v ? v + item.単位 : '';
      if (item.キー === '食塩相当量' && n.ナトリウム併記) {
        var na = String(n.ナトリウム == null ? '' : n.ナトリウム).trim();
        /* ナトリウム塩無添加の食品のみ。ナトリウムを主として書き、食塩相当量を括弧書きにする */
        値 = 'ナトリウム ' + (na ? na + 'mg' : '') + '（食塩相当量' + (v ? ' ' + v + 'g' : '') + '）';
        return { 項目: 'ナトリウム', 値: 値 };
      }
      return { 項目: item.キー, 値: 値 };
    });
  }

  function 推定値の注記(input) {
    var n = input.栄養成分 || {};
    if (n.省略) return '';
    if (n.値の性格 !== '推定値') return '';
    return String(n.推定値文言 || '').trim();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* HTMLの一括表示枠を作る */
  function HTMLを作る(input) {
    var rows = 行一覧(input);
    if (!rows.length) return '<p class="muted">入力するとここにラベル案が表示されます。</p>';
    var html = '<table class="label-table"><tbody>';
    rows.forEach(function (r) {
      html += '<tr><th>' + escapeHtml(r.項目) + '</th><td>' +
        escapeHtml(r.値).replace(/\n/g, '<br>') + '</td></tr>';
    });
    html += '</tbody></table>';

    var 栄養 = 栄養成分の行一覧(input);
    if (栄養.length) {
      html += '<table class="label-table label-nutrition"><tbody>';
      html += '<tr><th colspan="2" class="nutrition-head">' +
        escapeHtml(栄養成分の見出し(input.栄養成分 || {})) + '</th></tr>';
      栄養.forEach(function (r) {
        html += '<tr><th>' + escapeHtml(r.項目) + '</th><td>' + escapeHtml(r.値) + '</td></tr>';
      });
      html += '</tbody></table>';
      var 注記 = 推定値の注記(input);
      if (注記) html += '<p class="label-note">' + escapeHtml(注記) + '</p>';
    }

    if ((input.注意喚起 || '').trim()) {
      html += '<p class="label-note"><strong>【枠外表示】</strong><br>' +
        escapeHtml(input.注意喚起).replace(/\n/g, '<br>') + '</p>';
    }
    return html;
  }

  /* コピー用のテキストを作る */
  function テキストを作る(input) {
    var rows = 行一覧(input);
    var 幅 = 0;
    rows.forEach(function (r) { 幅 = Math.max(幅, r.項目.length); });
    var lines = rows.map(function (r) {
      var pad = r.項目 + '　'.repeat(Math.max(0, 幅 - r.項目.length));
      return pad + '：' + r.値.replace(/\n/g, '\n' + '　'.repeat(幅) + '　');
    });
    var 栄養 = 栄養成分の行一覧(input);
    if (栄養.length) {
      lines.push('');
      lines.push(栄養成分の見出し(input.栄養成分 || {}));
      var 栄養幅 = 0;
      栄養.forEach(function (r) { 栄養幅 = Math.max(栄養幅, r.項目.length); });
      栄養.forEach(function (r) {
        lines.push(r.項目 + '　'.repeat(Math.max(0, 栄養幅 - r.項目.length)) + '：' + r.値);
      });
      var 注記 = 推定値の注記(input);
      if (注記) lines.push(注記);
    }

    if ((input.注意喚起 || '').trim()) {
      lines.push('');
      lines.push('【枠外表示】');
      lines.push('※' + input.注意喚起);
    }
    return lines.join('\n');
  }

  global.LabelBuilder = {
    HTMLを作る: HTMLを作る,
    テキストを作る: テキストを作る,
    行一覧: 行一覧,
    栄養成分の行一覧: 栄養成分の行一覧,
    栄養成分の見出し: 栄養成分の見出し
  };
})(window);
