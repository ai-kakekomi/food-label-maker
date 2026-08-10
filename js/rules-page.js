/* ============================================================
 * rules-page.js  ルール一覧（監査モード）
 * ============================================================ */
(function () {
  'use strict';

  var 全ルール = [];

  /* 画面に出す重大度の表記（内部の値は 'error' / 'warn' のまま） */
  var 重大度ラベル = {
    error: 'エラー（要修正）',
    warn: '注意（確認推奨）'
  };
  function 重大度表記(sev) { return 重大度ラベル[sev] || sev; }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function 機械が判定するか(r) {
    return (r.機械判定 || {})['種別'] !== '確認事項';
  }

  LabelRules.loadBaseRules().then(function (r) {
    全ルール = r.ルール;
    分類を埋める();
    バインド();
    描画();
  }).catch(function (e) {
    $('rules-list').innerHTML =
      '<div class="card"><div class="msg msg-error"><p><strong>ルールファイルを読み込めませんでした。</strong></p>' +
      '<p>' + esc(e.message) + '</p>' +
      '<p class="help">ローカルのHTTPサーバー経由で開いてください（README.md の「動かし方」を参照）。</p></div></div>';
  });

  function 分類を埋める() {
    var seen = {};
    全ルール.forEach(function (r) { seen[r.分類] = true; });
    var sel = $('cat');
    Object.keys(seen).forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }

  function バインド() {
    ['q', 'cat', 'sev', 'mode'].forEach(function (id) {
      $(id).addEventListener('input', 描画);
      $(id).addEventListener('change', 描画);
    });
  }

  function 描画() {
    var q = $('q').value.trim();
    var cat = $('cat').value;
    var sev = $('sev').value;
    var mode = $('mode').value;

    var list = 全ルール.filter(function (r) {
      if (cat && r.分類 !== cat) return false;
      if (sev && r.重大度 !== sev) return false;
      if (mode === 'auto' && !機械が判定するか(r)) return false;
      if (mode === 'manual' && 機械が判定するか(r)) return false;
      if (q) {
        var blob = [r.id, r.名称, r.分類, r.根拠, r.条件, r.判定, r.メッセージ, r.ヒント].join(' ');
        if (blob.indexOf(q) < 0) return false;
      }
      return true;
    });

    var 自動 = 全ルール.filter(機械が判定するか).length;
    var 監修済 = 全ルール.filter(function (r) { return !!r.最終確認日; }).length;
    $('stats').innerHTML =
      '<span class="pill pill-pass">全 ' + 全ルール.length + ' 本</span>' +
      '<span class="pill pill-error">エラー（要修正） ' + 全ルール.filter(function (r) { return r.重大度 === 'error'; }).length + '</span>' +
      '<span class="pill pill-warn">注意（確認推奨） ' + 全ルール.filter(function (r) { return r.重大度 === 'warn'; }).length + '</span>' +
      '<span class="pill pill-check">機械判定 ' + 自動 + ' ／ 人の確認 ' + (全ルール.length - 自動) + '</span>' +
      '<span class="pill ' + (監修済 ? 'pill-pass' : 'pill-warn') + '">監修済 ' + 監修済 + ' ／ 未監修 ' + (全ルール.length - 監修済) + '</span>' +
      '<span class="pill">表示中 ' + list.length + '</span>';

    var 分類ごと = {};
    list.forEach(function (r) { (分類ごと[r.分類] = 分類ごと[r.分類] || []).push(r); });

    var html = '';
    Object.keys(分類ごと).forEach(function (c) {
      html += '<div class="card"><h2 class="cat-head">' + esc(c) + '</h2>';
      分類ごと[c].forEach(function (r) { html += ルールHTML(r); });
      html += '</div>';
    });
    $('rules-list').innerHTML = html || '<div class="card"><p class="muted">該当するルールがありません。</p></div>';
  }

  function ルールHTML(r) {
    var 自動 = 機械が判定するか(r);
    var h = '<details class="rule-card">';
    h += '<summary>';
    h += '<span class="badge badge-' + r.重大度 + '">' + esc(重大度表記(r.重大度)) + '</span>';
    h += '<span class="res-title">' + esc(r.名称) + '</span>';
    h += '<span class="badge ' + (自動 ? 'badge-auto' : 'badge-manual') + '">' + (自動 ? '機械判定' : '人の確認') + '</span>';
    if (!r.最終確認日) h += '<span class="badge badge-unreviewed">未監修</span>';
    h += '</summary>';
    h += '<div class="res-body">';
    h += '<dl class="rule-dl">';
    h += '<dt>ID</dt><dd class="rule-id">' + esc(r.id) + '</dd>';
    h += '<dt>条件</dt><dd>' + esc(r.条件) + '</dd>';
    h += '<dt>判定</dt><dd>' + esc(r.判定) + '</dd>';
    h += '<dt>メッセージ</dt><dd>' + esc(r.メッセージ) + '</dd>';
    if (r.ヒント) h += '<dt>ヒント</dt><dd>' + esc(r.ヒント).replace(/\n/g, '<br>') + '</dd>';
    h += '<dt>根拠</dt><dd>' + esc(r.根拠) + '</dd>';
    h += '<dt>出典URL</dt><dd>' + (r.出典URL
      ? '<a href="' + esc(r.出典URL) + '" target="_blank" rel="noopener">' + esc(r.出典URL) + '</a>'
      : '（未記入）') + '</dd>';
    h += '<dt>最終確認日</dt><dd>' + (r.最終確認日 ? esc(r.最終確認日) : '<strong>未記入（未監修）</strong>') + '</dd>';
    h += '<dt>判定方法</dt><dd>' + esc((r.機械判定 || {})['種別'] || '') + '</dd>';
    h += '<dt>ファイル</dt><dd class="rule-id">rules/' + esc(r.ファイル) + '</dd>';
    h += '</dl></div></details>';
    return h;
  }
})();
