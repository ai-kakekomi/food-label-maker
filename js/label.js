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
    行一覧: 行一覧
  };
})(window);
