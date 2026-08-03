/* ============================================================
 * rules.js  ルールファイル（YAML）の読み込み
 * ============================================================ */
(function (global) {
  'use strict';

  var RULES_INDEX = 'rules/index.json';

  function fetchText(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(path + ' の読み込みに失敗しました（HTTP ' + res.status + '）');
      return res.text();
    });
  }

  function parseYaml(text, path) {
    try {
      return jsyaml.load(text);
    } catch (e) {
      throw new Error(path + ' のYAMLに文法エラーがあります: ' + e.message);
    }
  }

  /* ルールファイル1つ分を、ルール配列に正規化する */
  function normalizeRuleFile(doc, meta) {
    var list = (doc && doc['ルール']) || [];
    return list.map(function (r) {
      return {
        id: r.id,
        名称: r['名称'] || '(名称なし)',
        分類: (doc && doc['分類']) || meta.分類 || 'その他',
        根拠: r['根拠'] || '',
        出典URL: r['出典URL'] || '',
        最終確認日: (r['最終確認日'] || '').toString().trim(),
        条件: r['条件'] || '',
        判定: r['判定'] || '',
        重大度: r['重大度'] === 'error' ? 'error' : 'warn',
        メッセージ: r['メッセージ'] || '',
        ヒント: r['ヒント'] || '',
        機械判定: r['機械判定'] || { 種別: '確認事項' },
        適用条件: r['適用条件'] || [],
        由来: meta.由来,          // 'base' | 'custom'
        ファイル: meta.ファイル
      };
    });
  }

  /* アレルゲン辞書を検索しやすい形に変換 */
  function buildDictionary(doc) {
    var items = [];
    function push(list, kind) {
      (list || []).forEach(function (e) {
        items.push({
          品目: e['品目'],
          区分: kind,
          代替表記: e['代替表記'] || [],
          拡大表記: e['拡大表記'] || [],
          表示形式: e['表示形式'] || e['品目'],
          添加物表示形式: e['添加物表示形式'] || e['品目'],
          注意: e['注意'] || ''
        });
      });
    }
    push(doc['特定原材料'], '特定原材料');
    push(doc['特定原材料に準ずるもの'], '特定原材料に準ずるもの');
    return {
      品目一覧: items,
      大分類の例外表記: doc['大分類の例外表記'] || [],
      検索: function (name) {
        for (var i = 0; i < items.length; i++) if (items[i].品目 === name) return items[i];
        return null;
      }
    };
  }

  /* 法令ルール一式を読み込む */
  function loadBaseRules() {
    return fetchText(RULES_INDEX).then(function (txt) {
      var index = JSON.parse(txt);
      var jobs = [fetchText('rules/' + index['辞書'])];
      index['法令ルール'].forEach(function (f) { jobs.push(fetchText('rules/' + f)); });

      return Promise.all(jobs).then(function (texts) {
        var dict = buildDictionary(parseYaml(texts[0], index['辞書']));
        var rules = [];
        index['法令ルール'].forEach(function (f, i) {
          var doc = parseYaml(texts[i + 1], f);
          rules = rules.concat(normalizeRuleFile(doc, { 由来: 'base', ファイル: f }));
        });
        return { 辞書: dict, ルール: rules };
      });
    });
  }

  /* ユーザーが選んだ社内ルールYAMLを読み込む */
  function loadCustomRulesFromText(text, filename) {
    var doc = parseYaml(text, filename);
    return normalizeRuleFile(doc, { 由来: 'custom', ファイル: filename, 分類: '社内ルール' });
  }

  global.LabelRules = {
    loadBaseRules: loadBaseRules,
    loadCustomRulesFromText: loadCustomRulesFromText
  };
})(window);
