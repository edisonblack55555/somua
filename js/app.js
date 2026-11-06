/* ==========================================================================
   苏摩图鉴 · 前端逻辑
   数据来自 js/data.js（由 update_sumo.py 生成）：
     SUMO_DATA = { meta, genes[], items[], sumo[], dialogues[] }

   视图偏好（布局 / 显示模式 / 排序 / 倒序）存在 localStorage，下次打开保持一致。
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.SUMO_DATA;
  if (!DATA || !DATA.sumo) {
    document.body.insertAdjacentHTML('afterbegin',
      '<p style="padding:24px;font-family:sans-serif;color:#b00">' +
      '缺少 js/data.js，请先双击「一键更新苏摩.cmd」生成数据。</p>');
    return;
  }

  /* ---------------------------- 基础配置 ---------------------------- */

  // 配色从 js/config.js 读（window.SUMO_CONFIG），读不到就用这里的默认值
  var CFG = window.SUMO_CONFIG || {};
  var GENE_COLORS = CFG.geneColors || {
    '可爱基因': '#f472b6',
    '正义基因': '#38bdf8',
    '邪恶基因': '#8b5cf6',
    '庆典基因': '#fb923c',
    '王者基因': '#f5b429',
    '黑色基因': '#4b5563',
    '白色基因': '#a8b3c7',
    '蓝色基因': '#2f6bee',
    '绿色基因': '#22c55e',
    '黄色基因': '#e5b800',
    '紫色基因': '#a855f7',
    '红色基因': '#ef4444',
    '原始基因': '#b8c1d1',
    '未知基因': '#cbd5e1'
  };
  var GENE_FALLBACK = CFG.geneColorFallback || '#94a3b8';
  var SOFT_ALPHA = CFG.softAlpha || {};
  var ALPHA_CELL = SOFT_ALPHA.geneCell || 0.16;
  var ALPHA_CHIP = SOFT_ALPHA.chip || 0.16;

  var TALK_ORDER = ['专属对话', '点击应答', '靠近技能', '待机情绪', '特殊精灵对话', '彩蛋靠近', '通用开心', '通用哭泣', '通用虚弱',
    '通用点击1', '通用点击2', '通用点击3', '通用点击', '通用精灵点击',
    '通用靠近1', '通用靠近2', '通用待机', '千里击涛', '洛林卡'];
  var PRIVATE_TALK = ['特殊精灵对话', '彩蛋靠近'];

  var PREF_KEY = 'sumo.view.v1';
  // 视图偏好（会被 localStorage 覆盖）
  var prefs = { layout: 'grid', mode: 'gene', sort: 'id', desc: false, talkCompress: true };

  /* ---------------------------- 小工具 ---------------------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hexToRgba(hex, alpha) {
    var h = (hex || GENE_FALLBACK).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  // 新数据基因名不带「基因」后缀（可爱），旧配置带（可爱基因），两种都认
  // 原始 / 突变 / 宝宝 视为同一实体，前端统一显示「宝宝基因」
  function geneLabel(gene) {
    var g = String(gene || '').replace(/基因$/, '');
    if (!g || g === '原始' || g === '突变') g = '宝宝';
    return g + '基因';
  }

  function geneColor(gene) {
    var g = String(gene || '');
    var bare = g.replace(/基因$/, '');
    return GENE_COLORS[g] || GENE_COLORS[bare] || GENE_COLORS[bare + '基因'] ||
      (bare === '宝宝' ? '#f9a8d4' : GENE_FALLBACK);
  }

  // 属性 token 配色（引擎：ATK/HLP/DEF/CRT/SPD/KBF/CTD/ATR）
  var ATTR_COLOR = {
    ATK: '#f472b6',   // 攻击 粉
    DEF: '#22c55e',   // 防御 绿
    HLP: '#ef4444',   // 生命 红
    CRT: '#eab308',   // 暴击 黄
    SPD: '#3b82f6',   // 移速 蓝
    KBF: '#8b5cf6',   // 击退 紫
    CTD: '#fb923c',   // 暴击伤害 橙
    ATR: '#0ea5e9'    // 速度 天蓝
  };

  var ATTR_LABEL = {
    ATK: '攻击', HLP: '生命', DEF: '防御', CRT: '暴击',
    SPD: '移速', KBF: '击退', CTD: '暴击伤害', ATR: '速度'
  };

  var ATTR_TOKEN = /\b(ATK|HLP|DEF|CRT|SPD|KBF|CTD|ATR)\b/g;

  // 描述渲染：[] 内的计算对象按属性上色（引擎会把 [] 求值成橙色结果）
  function renderDesc(text) {
    var src = String(text || '');
    var out = '';
    var last = 0;
    var re = /\[([^\]]*)\]/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      out += esc(src.slice(last, m.index));
      var inner = esc(m[1]).replace(ATTR_TOKEN, function (tok) {
        return '<b class="attr-token" style="color:' + (ATTR_COLOR[tok] || '#888') + '">' +
          (ATTR_LABEL[tok] || tok) + '</b>';
      });
      out += '<span class="expr">[' + inner + ']</span>';
      last = m.index + m[0].length;
    }
    out += esc(src.slice(last));
    return out;
  }


  function geneChip(gene) {
    return '<span class="gchip" style="--c:' + geneColor(gene) + ';--c-soft:' +
      hexToRgba(geneColor(gene), ALPHA_CELL) + '">' + esc(geneLabel(gene)) + '</span>';
  }

  function mainGene(s) { return (s.uniqueGenes || [])[0] || '宝宝'; }

  // 立绘全部由浏览器实时渲染骨架（spine-canvas 4.0），不再读 PNG
  function paintSpine(canvas, s, opt) {
    if (!canvas) return;
    SomuaSpine.load().then(function () {
      var skel = SomuaSpine.make(s.petID, s.部件);
      if (SomuaSpine.render(canvas, skel, opt || {})) {
        canvas.dataset.painted = '1';
        canvas.dataset.box = (opt && opt.maxWidth) + 'x' + (opt && opt.maxHeight);
      }
    }).catch(function () {
      var fb = canvas.parentNode && canvas.parentNode.querySelector('.artfallback');
      if (fb) fb.hidden = false;
      canvas.hidden = true;
    });
  }

  // 以容器为框：最长边充满、等比缩放（contain），避免溢出被裁掉
  function artBox(cv) {
    var box = cv.parentNode;
    var w = box && box.clientWidth ? box.clientWidth : 0;
    var h = box && box.clientHeight ? box.clientHeight : 0;
    if (!w || !h) { w = 62; h = 62; }
    return { w: Math.max(8, w - 4), h: Math.max(8, h - 4) };
  }

  function paintAllArt(root) {
    var box = root || document;
    [].forEach.call(box.querySelectorAll('canvas[data-sumoid]'), function (cv) {
      var s = byId(Number(cv.getAttribute('data-sumoid')));
      if (!s) return;
      var b = artBox(cv);
      var key = b.w + 'x' + b.h;
      if (cv.dataset.box === key) return;      // 框尺寸没变就不重画
      paintSpine(cv, s, { maxWidth: b.w, maxHeight: b.h, scale: 3, pad: 1 });
    });
  }

  var TALK_KIND = { 1: '待机情绪', 2: '靠近技能', 3: '点击应答' };

  // 旧数据用「类型」字符串；新版 dangoAction 删掉了该字段，改用数字「分类」
  function talkType(t) {
    if (t.类型) return t.类型;
    if (t.适用精灵) return '专属对话';
    return TALK_KIND[t.分类] || '其它';
  }

  function isPrivateTalk(t) { return PRIVATE_TALK.indexOf(t.类型) > -1 || !!t.适用精灵; }

  // 空位在数据里已被映射为「宝宝奶昔 / 宝宝基因」
  function isOrigSlot(x) { return !!x.占位 || x.基因 === '原始' || x.基因 === '原始基因'; }

  /* ---------------------------- 视图偏好持久化 ---------------------------- */

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREF_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw) || {};
      if (saved.layout === 'grid' || saved.layout === 'list') prefs.layout = saved.layout;
      if (saved.mode === 'gene' || saved.mode === 'feed') prefs.mode = saved.mode;
      if (saved.sort) prefs.sort = saved.sort;
      prefs.desc = !!saved.desc;
      if (typeof saved.talkCompress === 'boolean') prefs.talkCompress = saved.talkCompress;
      talkState.compress = prefs.talkCompress !== false;
    } catch (e) { /* 隐私模式等场景忽略 */ }
  }

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* 忽略 */ }
  }

  /* ---------------------------- 顶部统计 / 页脚 ---------------------------- */

  function renderHeroStats() {
    var usedItems = {};
    DATA.sumo.forEach(function (s) {
      (s.slots || []).forEach(function (x) { if (!isOrigSlot(x)) usedItems[x.id] = 1; });
    });
    var stats = [
      '<b>' + DATA.sumo.length + '</b>只苏摩',
      '<b>' + realGenes().length + '</b>种基因',
      '<b>' + Object.keys(usedItems).length + '</b>种配方道具',
      '<b>' + DATA.dialogues.length + '</b>条台词'
    ];
    $('#heroStats').innerHTML = stats.map(function (x) { return '<li>' + x + '</li>'; }).join('');

    var meta = DATA.meta || {};
    var parts = [];
    parts.push('配置包 ' + (meta.配置包版本 || '—') + (meta.配置包抓取 ? '（' + meta.配置包抓取 + '）' : ''));
    parts.push('资源包 ' + (meta.资源包版本 || '—') + (meta.资源包抓取 ? '（' + meta.资源包抓取 + '）' : ''));
    parts.push('生成于 ' + (meta.生成时间 || '—'));
    $('#footMeta').textContent = '数据版本：' + parts.join(' ｜ ');

    $('#heroSub').textContent = '配方 · 基因 · 对话 一站式速查 · 更新于 ' + (meta.生成时间 || '—');
  }

  /* ---------------------------- 筛选状态 ---------------------------- */

  var state = { q: '', genes: [], seasons: [], onlyTalk: false, rarity: [] };
  // 对话图鉴：搜索词 + 是否压缩重复台词（默认开启）
  var talkState = { q: '', compress: prefs.talkCompress !== false };

  function byId(id) {
    for (var i = 0; i < DATA.sumo.length; i++) {
      if (DATA.sumo[i].id === id) return DATA.sumo[i];
    }
    return null;
  }

  var geneUsage = {};
  function computeGeneUsage() {
    var map = {};
    DATA.sumo.forEach(function (s) {
      (s.uniqueGenes || []).forEach(function (g) { (map[g] = map[g] || []).push(s); });
    });
    geneUsage = map;
  }

  // 排除「原始基因」（它是配方空位的占位基因，不算可选基因）
  function realGenes() {
    return DATA.genes.filter(function (g) { return !g.占位; });
  }

  /* ---------------------------- 基因筛选（可折叠） ---------------------------- */

  function renderFilters() {
    var seasons = seasonOptions();
    var sh = ['<button class="chip chip--season" data-season="__all" style="--c:#7c8ba1;--c-soft:#eef1f6">全部赛季</button>'];
    seasons.forEach(function (k) {
      var cnt = (DATA.sumo || []).filter(function (s) { return seasonKey(s) === k; }).length;
      sh.push('<button class="chip chip--season" data-season="' + esc(k) + '" style="--c:#c98a2e;--c-soft:#fff3dc">' +
        esc(k === '__none' ? '无赛季' : '赛季 ' + k) + '<span class="chip__count">' + cnt + '</span></button>');
    });
    var sbox = $('#seasonFilter');
    if (sbox) sbox.innerHTML = sh.join('');

    var html = ['<button class="chip" data-gene="__all" style="--c:#ff6f91;--c-soft:#ffe6ec">全部基因</button>'];
    realGenes().forEach(function (g) {
      html.push('<button class="chip" data-gene="' + esc(g.基因) + '" style="--c:' +
        geneColor(g.基因) + ';--c-soft:' + hexToRgba(geneColor(g.基因), ALPHA_CELL) + '">' +
        esc(g.基因) + '<span class="chip__count">' + geneUsers(g.基因).length + '</span></button>');
    });
    $('#geneFilter').innerHTML = html.join('');
  }

  function syncFilterUI() {
    $$('#geneFilter .chip').forEach(function (btn) {
      var g = btn.getAttribute('data-gene');
      var on = g === '__all' ? state.genes.length === 0 : state.genes.indexOf(g) > -1;
      btn.classList.toggle('is-on', on);
    });
    $$('#seasonFilter .chip').forEach(function (btn) {
      var k = btn.getAttribute('data-season');
      var on = k === '__all' ? state.seasons.length === 0 : state.seasons.indexOf(k) > -1;
      btn.classList.toggle('is-on', on);
    });
    var meta = [];
    if (state.seasons.length) meta.push(state.seasons.map(function (k) {
      return k === '__none' ? '无赛季' : '赛季 ' + k;
    }).join(' + '));
    if (state.genes.length) meta.push(state.genes.join(' + '));
    $('#filterMeta').textContent = meta.length ? '已选：' + meta.join(' ｜ ') : '未筛选';
  }

  /* ---------------------------- 六格条：基因 / 喂食 ---------------------------- */

  // 六格：不标槽位号，基因 / 道具名完整显示
  // pair = true 时按「左 1-3 / 右 4-6」两列排（网格布局的喂食显示用）
  function cellsHtml(s, pair) {
    var cells = (s.slots || []).map(function (x) {
      var c = geneColor(x.基因);
      var orig = isOrigSlot(x);
      var title = '第 ' + x.slot + ' 格 · ' + x.名称 + ' · ' + x.基因;
      if (prefs.mode === 'gene') {
        return '<span class="gcell gcell--gene" ' +
          'style="--c:' + c + ';--c-soft:' + hexToRgba(c, ALPHA_CELL) + '" title="' + esc(title) + '">' +
          esc(geneLabel(x.基因)) + '</span>';
      }
      return '<span class="gcell gcell--feed" style="--c:' + c + '" title="' + esc(title) + '">' +
        esc(x.名称) + '</span>';
    }).join('');
    return '<div class="gcells' + (pair ? ' gcells--pair' : '') + '">' + cells + '</div>';
  }

  function slotBlockHtml(s, forGrid) {
    // 网格 + 喂食：左三右三；其余都是按顺序一排六格
    return cellsHtml(s, !!forGrid && prefs.mode === 'feed');
  }

  /* ---------------------------- 过滤 / 排序 ---------------------------- */

  // 赛季：数据里是空串（无赛季）或数字字符串
  function seasonLabel(v) {
    return (!v || v === '0') ? '无赛季' : '赛季 ' + v;
  }

  function seasonKey(s) { return (!s.赛季 || s.赛季 === '0') ? '__none' : String(s.赛季); }

  function seasonOptions() {
    var set = {};
    (DATA.sumo || []).forEach(function (s) { set[seasonKey(s)] = 1; });
    return Object.keys(set).sort(function (a, b) {
      if (a === '__none') return -1;
      if (b === '__none') return 1;
      return Number(a) - Number(b);
    });
  }

  function matchText(s, q) {
    if (!q) return true;
    var hay = [s.名称, String(s.petID), String(s.id), s.介绍];
    (s.slots || []).forEach(function (x) { hay.push(x.名称 + ' ' + x.基因); });
    (s.uniqueGenes || []).forEach(function (g) { hay.push(g); });
    return hay.join(' ').toLowerCase().indexOf(q) > -1;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.sumo.filter(function (s) {
      if (state.seasons.length && state.seasons.indexOf(seasonKey(s)) === -1) return false;
      if (state.onlyTalk && !(s.talks || []).some(isPrivateTalk)) return false;
      if (state.genes.length) {
        var own = s.uniqueGenes || [];
        if (!state.genes.every(function (g) { return own.indexOf(g) > -1; })) return false;
      }
      return matchText(s, q);
    });

    var dir = prefs.desc ? -1 : 1;
    var key = prefs.sort;
    list.sort(function (a, b) {
      var r;
      if (key === 'petId') r = a.petID - b.petID;
      else if (key === 'name') r = a.名称.localeCompare(b.名称, 'zh-Hans-CN');
      else r = a.id - b.id;
      return r * dir;
    });
    return list;
  }

  /* ---------------------------- 渲染：网格 / 列表 ---------------------------- */

  function artCanvasHtml(s, cls) {
    return '<canvas class="' + cls + '" data-pet="' + s.petID + '" data-sumoid="' + s.id + '"></canvas>' +
      '<span class="artfallback" hidden>立绘待生成</span>';
  }

  function cardHtml(s) {
    var gene = mainGene(s);
    var art = artCanvasHtml(s, 'card__canvas');
    var genes = s.uniqueGenes || [];
    var geneHtml = genes.length
      ? genes.map(geneChip).join('')
      : geneChip('宝宝');
    var talkTag = (s.talks || []).some(isPrivateTalk)
      ? '<div class="card__tags"><span class="tag tag--warn">专属对话</span></div>' : '';

    return '<article class="card" tabindex="0" data-id="' + s.id + '" ' +
      'style="--c:' + geneColor(gene) + ';--c-soft:' + hexToRgba(geneColor(gene), ALPHA_CHIP) + '">' +
        '<div class="card__top">' +
          '<div class="card__art">' + art + '</div>' +
          '<div>' +
            '<div class="card__id">#' + s.id + ' · 精灵ID ' + s.petID + '</div>' +
            '<div class="card__name">' + esc(s.名称) + '</div>' +
            talkTag +
          '</div>' +
        '</div>' +
        '<div class="card__seqline">' +
          '<span class="seasoncell' + (s.赛季 ? ' seasoncell--on' : '') + '">' +
            esc(seasonLabel(s.赛季)) + '</span>' +
          '<div class="card__seqcells">' + slotBlockHtml(s, true) + '</div>' +
        '</div>' +
        '<div class="gene-row">' + geneHtml + '</div>' +
      '</article>';
  }

  function rowHtml(s) {
    var gene = mainGene(s);
    var art = artCanvasHtml(s, 'row__canvas');
    var sub = (s.talks || []).some(isPrivateTalk) ? '专属对话' : '&nbsp;';
    return '<article class="row" tabindex="0" data-id="' + s.id + '" ' +
      'style="--c:' + geneColor(gene) + ';--c-soft:' + hexToRgba(geneColor(gene), ALPHA_CHIP) + '">' +
        '<div class="row__id">#' + s.id + '<small>精灵ID ' + s.petID + '</small></div>' +
        '<div class="row__art">' + art + '</div>' +
        '<div class="row__name">' + esc(s.名称) + '<small>' + sub + '</small></div>' +
        '<div class="row__season"><span class="seasoncell' + (s.赛季 ? ' seasoncell--on' : '') + '">' +
          esc(seasonLabel(s.赛季)) + '</span></div>' +
        '<div class="row__slots">' + slotBlockHtml(s, false) + '</div>' +
      '</article>';
  }

  function renderList() {
    var list = filtered();
    var isList = prefs.layout === 'list';

    $('#cards').hidden = isList;
    $('#rows').hidden = !isList;
    if (isList) {
      $('#cards').innerHTML = '';
      $('#rows').innerHTML = list.map(rowHtml).join('');
    } else {
      $('#rows').innerHTML = '';
      $('#cards').innerHTML = list.map(cardHtml).join('');
    }

    paintAllArt(isList ? $('#rows') : $('#cards'));

    $('#empty').hidden = list.length > 0;
    $('#resultLine').innerHTML = '共 <b>' + list.length + '</b> 只苏摩 · ' +
      (prefs.mode === 'gene' ? '基因显示' : '喂食显示') + ' · ' + (prefs.desc ? '倒序' : '正序') +
      (state.genes.length ? ' · 同时含 ' + state.genes.map(function (g) {
        return '<b>' + esc(g) + '</b>';
      }).join(' + ') : '') +
      (state.seasons.length ? ' · ' + state.seasons.map(function (k) {
        return '<b>' + (k === '__none' ? '无赛季' : '赛季 ' + k) + '</b>';
      }).join(' + ') : '') +
      (state.onlyTalk ? ' · 仅专属对话' : '');
  }

  /* ---------------------------- 基因索引（行状折叠） ---------------------------- */

  // 某个基因的使用者：宝宝基因=有宝宝位（含空位）的苏摩
  function geneUsers(gene) {
    if (gene === '宝宝') {
      return DATA.sumo.filter(function (s) {
        return (s.基因序列 || []).some(function (x) { return x.占位 || x.基因 === '宝宝'; });
      });
    }
    return geneUsage[gene] || [];
  }

  function renderGenes() {
    $('#genes').innerHTML = DATA.genes.map(function (g) {
      var c = geneColor(g.基因);
      var users = geneUsers(g.基因);
      var chips = users.length
        ? users.map(function (s) {
            return '<button class="linkchip" data-jump="' + s.id + '">' + esc(s.名称) + '</button>';
          }).join('')
        : '<span class="gchip gchip--muted">暂无苏摩使用</span>';
      return '<article class="acc__item" style="--c:' + c + ';--c-soft:' + hexToRgba(c, ALPHA_CELL) + '">' +
        '<button class="acc__head" type="button" aria-expanded="false">' +
          '<span class="acc__dot"></span>' +
          '<span class="acc__title">' + esc(geneLabel(g.基因)) + '</span>' +
          '<span class="acc__sub">' + esc(g.道具) + ' · ' + esc(g.效果) + '</span>' +
          '<span class="acc__count">' + users.length + ' 只</span>' +
          '<span class="acc__chev"></span>' +
        '</button>' +
        '<div class="acc__body"><div class="acc__list">' + chips + '</div></div>' +
      '</article>';
    }).join('');
  }


  /* ---------------------------- 通用：悬浮信息窗 ---------------------------- */

  var infoPopBound = false;

  function openInfoPop(title, bodyHtml, opts) {
    var box = $('#infoPop');
    if (!box) return;
    $('#infoPopTitle').textContent = title;
    var body = $('#infoPopBody');
    body.innerHTML = bodyHtml;
    body.classList.toggle('is-center', !!(opts && opts.center));
    box.hidden = false;
    if (!infoPopBound) {
      infoPopBound = true;
      box.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]')) closeInfoPop();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeInfoPop();
      });
    }
  }

  function closeInfoPop() {
    var box = $('#infoPop');
    if (box) box.hidden = true;
  }

  function soulCardHtml(m, tag, tagClass) {
    if (!m) return '<div class="soulcard soulcard__none">没有对应魂印</div>';
    return '<div class="soulcard">' +
      '<div class="soulcard__head">' +
        '<span class="soulcard__tag ' + (tagClass || '') + '">' + esc(tag) + '</span>' +
        '<span>' + esc(m.名称) + '</span>' +
        '<span class="dim">#' + m.id + '</span>' +
        (m.rarity ? '<span class="dim">' + '★'.repeat(m.rarity) + '</span>' : '') +
      '</div>' +
      '<div class="soulcard__desc">' + renderDesc(m.描述) + '</div>' +
    '</div>';
  }

  function stars(n) {
    if (!n) return '<span class="flat">—</span>';
    return '<span class="dim">' + '★'.repeat(n) + '</span>';
  }

  function oneLine(text, n) {
    var s2 = String(text || '');
    return '<span class="one-line" title="' + esc(s2) + '">' + esc(s2.slice(0, n) || '—') + '</span>';
  }

  function dl(rows) {
    return '<dl>' + rows.filter(function (r) { return r[1] !== undefined && r[1] !== null && r[1] !== ''; })
      .map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(String(r[1])) + '</dd>'; })
      .join('') + '</dl>';
  }

  // 行点击 → 悬浮窗
  function bindRowPop(box, list, titleOf, bodyOf, center) {
    if (!box || box.dataset.bound) return;
    box.dataset.bound = '1';
    box.addEventListener('click', function (e) {
      var tr = e.target.closest('[data-i]');
      if (!tr) return;
      var item = list[Number(tr.getAttribute('data-i'))];
      if (!item) return;
      openInfoPop(titleOf(item), bodyOf(item), { center: !!center });
    });
  }

  /* ---------------------------- 魂印图鉴 ---------------------------- */

  function soulPopBody(m) {
    return '<p class="infopop__desc">' + renderDesc(m.描述) + '</p>' +
      dl([['编号', '#' + m.id]]);
  }

  function renderSouls() {
    var box = $('#souls');
    if (!box) return;
    if (box.dataset.done) return;
    box.dataset.done = '1';
    var sp = (DATA.soulMarks && DATA.soulMarks['真']) || [];
    var base = (DATA.soulMarks && DATA.soulMarks['基础']) || [];
    var all = sp.concat(base);
    var rows = all.map(function (m, i) {
      var isSp = m.id >= 11000;
      return '<tr data-i="' + i + '">' +
        '<td>' + (isSp ? '<span class="tagline tagline--sp">完美魂印</span>'
                       : '<span class="tagline">基础魂印</span>') + '</td>' +
        '<td><b>' + esc(m.名称) + '</b></td>' +
        '<td class="desc desc--wide">' + renderDesc(m.描述) + '</td>' +
      '</tr>';
    }).join('');
    box.innerHTML = '<table class="data"><thead><tr>' +
      '<th>档位</th><th>名称</th><th>效果</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    bindRowPop(box, all, function (m) { return m.名称; }, soulPopBody);
  }

  /* ---------------------------- 能力图鉴 ---------------------------- */

  function abilityPopBody(a) {
    return '<p class="infopop__desc">' + renderDesc(a.描述) + '</p>' +
      dl([['编号', '#' + a.id], ['稀有度', a.rarity ? '★'.repeat(a.rarity) : '—']]);
  }

  // 稀有度底色：1 绿 / 2 蓝 / 3 紫
  var RARITY_ROW = { 1: ' row--r1', 2: ' row--r2', 3: ' row--r3' };

  function abilityList() {
    var all = DATA.abilities || [];
    if (!state.rarity.length) return all;
    return all.filter(function (a) { return state.rarity.indexOf(a.rarity) > -1; });
  }

  function renderAbilityFilter() {
    var box = $('#abilityFilter');
    if (!box) return;
    var all = DATA.abilities || [];
    var counts = {};
    all.forEach(function (a) { counts[a.rarity] = (counts[a.rarity] || 0) + 1; });
    var RARITY_COLOR = { 1: '#2f9e63', 2: '#2f6bee', 3: '#8b5cf6' };   // 与行底色同系
    var html = ['<button class="chip" data-rarity="__all" style="--c:#7c8ba1;--c-soft:#eef1f6">' +
      '全部稀有度<span class="chip__count">' + all.length + '</span></button>'];
    [1, 2, 3].forEach(function (r) {
      var col = RARITY_COLOR[r];
      html.push('<button class="chip' + (state.rarity.indexOf(r) > -1 ? ' is-on' : '') +
        '" data-rarity="' + r + '" style="--c:' + col + ';--c-soft:' + hexToRgba(col, ALPHA_CELL) + '">' +
        '★'.repeat(r) + '<span class="chip__count">' + (counts[r] || 0) + '</span></button>');
    });
    box.innerHTML = html.join('');
    $$('#abilityFilter .chip').forEach(function (btn) {
      var r = btn.getAttribute('data-rarity');
      var on = r === '__all' ? state.rarity.length === 0 : state.rarity.indexOf(Number(r)) > -1;
      btn.classList.toggle('is-on', on);
    });
  }

  function renderAbilities() {
    var box = $('#abilities');
    if (!box) return;
    var all = abilityList();
    var rows = all.map(function (a, i) {
      return '<tr data-i="' + i + '" class="' + (RARITY_ROW[a.rarity] || '').trim() + '">' +
        '<td><b>' + esc(a.名称) + '</b></td>' +
        '<td>' + (a.rarity ? '★'.repeat(a.rarity) : '—') + '</td>' +
        '<td class="desc desc--wide">' + renderDesc(a.描述) + '</td>' +
      '</tr>';
    }).join('');
    box.innerHTML = '<table class="data"><thead><tr>' +
      '<th>名称</th><th>稀有度</th><th>效果</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    box.dataset.bound = '';          // 列表已换，允许重新绑定行点击
    bindRowPop(box, all, function (a) { return a.名称; }, abilityPopBody);
    renderAbilityFilter();           // 选中态跟着 state.rarity 刷新
  }

  /* ---------------------------- 性格图鉴 ---------------------------- */

  // 引擎 GetSumoAttributes(levels)：levels[0]→攻击 levels[1]→防御 levels[2]→生命
  // levels[3]→暴击(含暴击伤害) levels[4]→速度(含移速)
  var PERSONALITY_ATTR = ['攻击', '防御', '生命', '暴击', '速度'];
  var PERSONALITY_SUB = { 0: '', 1: '', 2: '', 3: '', 4: '' };   // 保留结构，界面不再显示缩写

  function personalityMark(v) {
    var delta = Math.round((v - 11) / 2);
    if (delta > 0) return '<span class="up">' + '↑'.repeat(Math.min(delta, 4)) + '</span>';
    if (delta < 0) return '<span class="down">' + '↓'.repeat(Math.min(-delta, 3)) + '</span>';
    return '<span class="flat">—</span>';
  }

  function personalityAdds(vals) {
    return '<div class="padds">' + PERSONALITY_ATTR.map(function (name, i) {
      var v = vals[i];
      return '<span class="pg"><i>' + name + '</i><b>' + v + '</b>' + personalityMark(v) + '</span>';
    }).join('') + '</div>';
  }

  function personalityHalf(p, idx) {
    if (!p) return '<td></td><td></td><td></td><td></td><td></td><td></td>';
    var vals = (p.数值 || []).slice(0, 5);
    return '<td class="pname" data-i="' + idx + '"><b>' + esc(p.名称) + '</b></td>' +
      vals.map(function (v, i) {
        return '<td class="pval" data-i="' + idx + '">' + v + ' ' + personalityMark(v) + '</td>';
      }).join('');
  }

  function personalityPopBody(p) {
    var vals = (p.数值 || []).slice(0, 5);
    return '<p class="infopop__desc">' +
      (p.流派 ? '流派：<b>' + esc(p.流派) + '</b>　' : '') +
      '这个性格对五项属性的影响（数字越大越强，11 为平均水平）。</p>' +
      '<table class="data" style="box-shadow:none"><thead><tr><th>属性</th><th>数值</th><th>变化</th></tr></thead><tbody>' +
      vals.map(function (v, i) {
        var delta = Math.round((v - 11) / 2);
        var txt = delta > 0 ? '<span class="up">增强</span>'
                : (delta < 0 ? '<span class="down">削弱</span>' : '<span class="flat">中性</span>');
        return '<tr><td>' + PERSONALITY_ATTR[i] + '</td>' +
          '<td class="num">' + v + '</td><td>' + txt + '</td></tr>';
      }).join('') + '</tbody></table>' +
      dl([['编号', '#' + p.id]]);
  }

  function renderPersonalities() {
    var box = $('#personalities');
    if (!box) return;
    if (box.dataset.done) return;
    box.dataset.done = '1';
    var all = DATA.personalities || [];
    var rows = '';
    for (var i = 0; i < all.length; i += 2) {
      rows += '<tr>' + personalityHalf(all[i], i) + personalityHalf(all[i + 1], i + 1) + '</tr>';
    }
    var head = '<th>性格</th>' + PERSONALITY_ATTR.map(function (n) { return '<th>' + n + '</th>'; }).join('') +
      '<th>性格</th>' + PERSONALITY_ATTR.map(function (n) { return '<th>' + n + '</th>'; }).join('');
    box.innerHTML = '<table class="data data--psy"><thead><tr>' + head +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    bindRowPop(box, all, function (p) { return '性格 · ' + p.名称; }, personalityPopBody, true);
  }

  /* ---------------------------- 状态效果 ---------------------------- */

  var STATUS_TYPE = { 1: '增益', 2: '减益' };
  var STATUS_RULE = {
    refresh: '刷新时长',
    stack: '可叠加',
    reject: '已有则拒绝',
    extend: '延长持续',
    replaceStronger: '更强替换'
  };

  function statusPopBody(s) {
    return '<p class="infopop__desc">' + renderDesc(s.描述) + '</p>' + dl([
      ['编号', '#' + s.id],
      ['类型', (STATUS_TYPE[s.类型] || '未知') + '（' + s.类型 + '）'],
      ['结算规则', STATUS_RULE[s.叠加规则] || s.叠加规则 || '—'],
      ['最大层数', s.最大层数],
      ['数值规则', s.数值规则 || '—'],
      ['受击特效', s.受击特效 || '—'],
      ['命中特效', s.命中特效 || '—'],
      ['图标', s.图标 || '—'],
    ]);
  }

  function renderStatusEffects() {
    var box = $('#statuses');
    if (!box) return;
    if (box.dataset.done) return;
    box.dataset.done = '1';
    var all = DATA.statusEffects || [];
    var rows = all.map(function (s, i) {
      return '<tr data-i="' + i + '" class="' + (s.类型 === 1 ? 'row--buff' : 'row--debuff') + '">' +
        '<td><b>' + esc(s.名称) + '</b></td>' +
        '<td>' + esc(STATUS_TYPE[s.类型] || '—') + '</td>' +
        '<td>' + esc(STATUS_RULE[s.叠加规则] || s.叠加规则 || '—') + '</td>' +
        '<td>' + esc(String(s.最大层数)) + '</td>' +
        '<td class="desc desc--wide">' + renderDesc(s.描述) + '</td>' +
      '</tr>';
    }).join('');
    box.innerHTML = '<table class="data"><thead><tr>' +
      '<th>名称</th><th>类型</th><th>结算规则</th><th>最大层数</th><th>效果</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    bindRowPop(box, all, function (s) { return s.名称; }, statusPopBody);
  }

  /* ---------------------------- 基础属性成长表 ---------------------------- */

  // 引擎 s_SumoAttrNames = {ATK, HLP, DEF, CRT, SPD, KBF, CTD, ATR}
  // GetSumoAttributes: ATK=attackValue, HLP=healthValue, DEF=defenseRatio(%), CRT=criticalChance,
  //                    SPD=speedValue(移速), KBF=knockRatio(%), CTD=criticalDamageRatio(%), ATR=attackRatio(速度,%)
  var ATTR_COLS = [
    ['attackValue', '攻击', 'ATK', ''],
    ['defenseRatio', '防御', 'DEF', '%'],
    ['healthValue', '生命', 'HLP', ''],
    ['criticalChance', '暴击', 'CRT', ''],
    ['speedValue', '移速', 'SPD', ''],
    ['knockRatio', '击退', 'KBF', '%'],
    ['criticalDamageRatio', '暴击伤害', 'CTD', '%'],
    ['attackRatio', '速度', 'ATR', '%']
  ];

  // 引擎 GetSumoAttributes：性格第 i 项取哪一行 → 哪几列
  var ATTR_SOURCE = {
    attackValue: 0, defenseRatio: 1, healthValue: 2, knockRatio: 2,
    criticalChance: 3, criticalDamageRatio: 3, speedValue: 4, attackRatio: 4
  };

  function renderAttributes() {
    var box = $('#attrs');
    if (!box) return;
    if (box.dataset.done) return;
    box.dataset.done = '1';
    var rows = (DATA.attributes || []).slice().sort(function (a, b) { return a.id - b.id; });
    var head = '<tr><th>等级</th>' + ATTR_COLS.map(function (c) {
      var col = ATTR_COLOR[c[2]] || '#999';
      return '<th><span style="color:' + col + '">' + c[1] + '</span>' +
        '<small>' + c[2] + (c[3] ? ' %' : '') + '</small></th>';
    }).join('') + '</tr>';
    var body = rows.map(function (r) {
      return '<tr><td>' + r.id + '</td>' + ATTR_COLS.map(function (c) {
        return '<td class="num">' + r[c[0]] + '</td>';
      }).join('') + '</tr>';
    }).join('');
    box.innerHTML = '<table class="attr"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
      '<p class="dim" style="font-size:12px;margin:10px 4px 4px;line-height:1.7">' +
      '带 % 的列为百分比属性。性格决定的那 5 项强弱，就是在这张表里取对应等级的数值。' +
      '</p>';
  }

  /* ---------------------------- DIY 苏摩 ---------------------------- */

  // 动作中文名（值为 spine 里的动画名）
  var ANIM_LABEL = {
    attack: '攻击', await: '待机', fail: '失败', happy: '开心', hit: '受击',
    move: '移动', normal: '普通', pain: '疼痛', power: '蓄力', sad: '难过', victory: '胜利'
  };

  // 这三个部件任何情况下都不能是「无」
  var DIY_REQUIRED = ['body', 'expression', 'hand'];

  var DIYS = {
    pieces: {},              // { spinePart: petID }
    soul: 0, personality: 0, abilities: [], anim: '',
    q: '',                   // 部件搜索词
    abq: '',                 // 能力搜索词
    stop: null,              // 正在播放的动画句柄
    inited: false
  };

  // 保证 body / expression / hand 一定有值（缺了就用第一个拥有该部件的苏摩）
  function diyEnsureRequired() {
    DIY_REQUIRED.forEach(function (part) {
      if (DIYS.pieces[part]) return;
      var owners = diyPartOwners(part);
      if (owners.length) DIYS.pieces[part] = owners[0].petID;
    });
  }

  function diyPartLabel(spinePart) {
    var hit = SomuaSpine.partMap.filter(function (pp) { return pp[1] === spinePart; })[0];
    return hit ? hit[0] : spinePart;
  }

  // 该部件有哪些苏摩提供（用数据里的 部件 标志，不依赖 spine 是否加载）
  function diyPartOwners(spinePart) {
    var label = diyPartLabel(spinePart);
    var q = (DIYS.q || '').trim().toLowerCase();
    return (DATA.sumo || []).filter(function (s) {
      if (!(s.部件 && s.部件[label])) return false;
      if (!q) return true;
      return String(s.名称).toLowerCase().indexOf(q) > -1 ||
        String(s.petID).indexOf(q) > -1;
    });
  }

  function diyDefault() {
    var s = (DATA.sumo || [])[0];
    if (!s) return;
    DIYS.pieces = {};
    SomuaSpine.partMap.forEach(function (pp) {
      if (s.部件 && s.部件[pp[0]]) DIYS.pieces[pp[1]] = s.petID;
    });
    DIYS.soul = s.真魂印id || s.魂印id || 0;
    DIYS.personality = (DATA.personalities[0] || {}).id || 0;
    DIYS.abilities = [];
    DIYS.anim = '';
    DIYS.inited = true;
  }

  function diyPieces() {
    return Object.keys(DIYS.pieces)
      .filter(function (k) { return DIYS.pieces[k]; })
      .map(function (k) { return { part: k, petID: DIYS.pieces[k] }; });
  }

  function diyPaint() {
    var cv = $('#diyCanvas');
    var empty = $('#diyEmpty');
    if (!cv) return;
    var pieces = diyPieces();
    if (!pieces.length) {
      cv.width = 0; cv.height = 0; cv.style.width = '0'; cv.style.height = '0';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    if (!SomuaSpine.meta) return;           // spine 还没加载完，先不画
    if (DIYS.stop) { DIYS.stop(); DIYS.stop = null; }
    var skel = SomuaSpine.combine(pieces);
    var opt = { maxWidth: 340, maxHeight: 356, scale: 4, pad: 4, supersample: 4 };
    if (DIYS.anim) {
      cv.__spineOpt = opt;                  // play() 每帧用它重绘
      DIYS.stop = SomuaSpine.play(cv, skel, DIYS.anim);
    } else {
      SomuaSpine.render(cv, skel, Object.assign({}, opt, { anim: null, time: 0 }));
    }
  }

  var RARITY_COLOR = { 1: '#2f9e63', 2: '#2f6bee', 3: '#8b5cf6' };

  // 下拉框按所选能力的稀有度染色
  function paintAbilitySelect(sel) {
    var id = Number(sel.value) || 0;
    var a = id ? diyAbilityById(id) : null;
    var col = a && a.rarity ? (RARITY_COLOR[a.rarity] || '#94a3b8') : null;
    if (!col) {
      sel.style.background = '';
      sel.style.borderColor = '';
      sel.style.color = '';
      return;
    }
    sel.style.background = hexToRgba(col, 0.16);
    sel.style.borderColor = hexToRgba(col, 0.55);
    sel.style.color = EX.ink;
  }

  function rarityDot(rarity) {
    if (!rarity) return '';
    var c = RARITY_COLOR[rarity] || '#94a3b8';
    return '<i class="rq" style="--rq:' + c + '" title="稀有度 ' + rarity + '"></i>';
  }

  function diySoulById(id) {
    var g = DATA.soulMarks || {};
    return (g['真'] || []).concat(g['基础'] || []).filter(function (m) { return m.id === id; })[0] || null;
  }

  function diyAbilityById(id) {
    return (DATA.abilities || []).filter(function (a) { return a.id === id; })[0] || null;
  }

  // 性格 5 个数值 → 基础属性表对应等级的数值
  function diyStats(personality) {
    if (!personality) return null;
    var vals = (personality.数值 || []).slice(0, 5);
    var row = function (v) {
      return (DATA.attributes || []).filter(function (a) { return a.id === v; })[0] || null;
    };
    var r = [row(vals[0]), row(vals[1]), row(vals[2]), row(vals[3]), row(vals[4])];
    if (r.some(function (x) { return !x; })) return null;
    return [
      { k: '攻击', v: r[0].attackValue },
      { k: '防御 %', v: r[1].defenseRatio },
      { k: '生命', v: r[2].healthValue },
      { k: '击退 %', v: r[2].knockRatio },
      { k: '暴击', v: r[3].criticalChance },
      { k: '暴击伤害 %', v: r[3].criticalDamageRatio },
      { k: '移速', v: r[4].speedValue },
      { k: '速度 %', v: r[4].attackRatio }
    ];
  }

  function diyResultHtml() {
    var soul = diySoulById(DIYS.soul);
    var per = (DATA.personalities || []).filter(function (x) { return x.id === DIYS.personality; })[0];
    var abs = DIYS.abilities.map(diyAbilityById).filter(Boolean);
    var stats = diyStats(per);
    var html = '';
    if (stats) {
      html += '<h4>属性（按性格取值）</h4><div class="diy__stats">' +
        stats.map(function (s) {
          return '<div class="diy__stat"><b>' + esc(String(s.v)) + '</b><span>' + esc(s.k) + '</span></div>';
        }).join('') + '</div>';
    }
    var vars = diyAttrVars();
    if (soul) {
      html += '<div class="diy__box"><b>魂印 · ' + esc(soul.名称) + '</b><br>' +
        renderDescCalc(soul.描述, vars) + '</div>';
    }
    if (per) {
      html += '<div class="diy__box"><b>性格 · ' + esc(per.名称) + '</b>' +
        (per.流派 ? '<span class="diytag">' + esc(per.流派) + '</span>' : '') + '</div>';
    }
    if (abs.length) {
      html += '<div class="diy__box"><b>能力特性（' + abs.length + '/4）</b>' +
        '<div class="diy__abcards">' +
        abs.map(function (a) {
          var col = RARITY_COLOR[a.rarity] || '#94a3b8';
          return '<div class="diy__abcard" style="--ab:' + col + ';--ab-soft:' + hexToRgba(col, 0.12) + '">' +
            '<b>' + esc(a.名称) + '</b>' + rarityDot(a.rarity) +
            '<p>' + renderDescCalc(a.描述, vars) + '</p></div>';
        }).join('') + '</div></div>';
    } else {
      html += '<div class="diy__box dim">还没有选能力特性（最多 4 条，可以留空）</div>';
    }
    return html || '<div class="diy__box dim">先选点东西试试</div>';
  }

  function renderDiy() {
    var host = $('#diyParts');
    if (!host) return;
    if (!DIYS.inited) diyDefault();

    diyEnsureRequired();          // 身 / 表情 / 手 永远有值
    host.innerHTML = SomuaSpine.partMap.map(function (pp) {
      var owners = diyPartOwners(pp[1]);
      var cur = DIYS.pieces[pp[1]] || 0;
      var required = DIY_REQUIRED.indexOf(pp[1]) > -1;
      var opts = (required ? [] : ['<option value="0">无</option>']).concat(owners.map(function (s) {
        return '<option value="' + s.petID + '"' + (s.petID === cur ? ' selected' : '') + '>' +
          esc(s.名称) + '</option>';
      }));
      return '<label class="diy__part' + (required ? ' diy__part--must' : '') + '">' +
        '<span>' + esc(pp[0]) + (required ? '<i class="must">必选</i>' : '') + '</span>' +
        '<select data-diy-part="' + pp[1] + '">' + opts.join('') + '</select></label>';
    }).join('');

    var search = $('#diyPartSearch');
    if (search && search.value !== DIYS.q) search.value = DIYS.q;
    var abSearch = $('#diyAbilitySearch');
    if (abSearch && abSearch.value !== DIYS.abq) abSearch.value = DIYS.abq;

    var animSel = $('#diyAnim');
    if (animSel) {
      animSel.innerHTML = ['<option value="">静止</option>'].concat(
        SomuaSpine.anims.map(function (a) {
          return '<option value="' + a + '">' + esc(ANIM_LABEL[a] || a) + '</option>';
        })
      ).join('');
      animSel.value = DIYS.anim;
    }

    var soulSel = $('#diySoul');
    if (soulSel) {
      var g = DATA.soulMarks || {};
      var mk = function (list, tag) {
        return '<optgroup label="' + tag + '">' + list.map(function (m) {
          return '<option value="' + m.id + '">' + esc(m.名称) + '</option>';
        }).join('') + '</optgroup>';
      };
      soulSel.innerHTML = mk(g['真'] || [], '完美魂印') + mk(g['基础'] || [], '基础魂印');
      soulSel.value = String(DIYS.soul);
    }

    var perSel = $('#diyPersonality');
    if (perSel) {
      perSel.innerHTML = (DATA.personalities || []).map(function (x) {
        return '<option value="' + x.id + '">' + esc(x.名称) + '</option>';
      }).join('');
      perSel.value = String(DIYS.personality);
    }

    var abBox = $('#diyAbilities');
    if (abBox) {
      var abq = (DIYS.abq || '').trim().toLowerCase();
      var chosen = (DIYS.abilities || []).map(Number);
      var abOpts = ['<option value="0">（空）</option>'].concat((DATA.abilities || []).filter(function (a) {
        if (!abq) return true;
        if (chosen.indexOf(a.id) > -1) return true;          // 已选中的始终保留
        return String(a.名称).toLowerCase().indexOf(abq) > -1;
      }).map(function (a) {
        return '<option value="' + a.id + '">' + esc(a.名称) + '</option>';
      })).join('');
      abBox.innerHTML = [0, 1, 2, 3].map(function (i) {
        return '<select data-diy-ability="' + i + '">' + abOpts + '</select>';
      }).join('');
      $$('#diyAbilities select').forEach(function (sel, i) {
        sel.value = String(DIYS.abilities[i] || 0);
        paintAbilitySelect(sel);
      });
    }

    $('#diyResult').innerHTML = diyResultHtml();
    diyPaint();
  }

  // 完全随机：魂印 + 性格 + 立绘（含「无」）+ 能力（同类只取一个，且不抽「某种效果」）
  function diyAbilityGroups() {
    var groups = {};
    (DATA.abilities || []).forEach(function (a) {
      if (a.名称 === '某种效果') return;                    // 占位词条不参与
      var base = String(a.名称).replace(/(I{1,3}|IV)$/, ''); // 去掉尾部等级罗马数字
      (groups[base] = groups[base] || []).push(a);
    });
    return groups;
  }

  function diyFullRandom() {
    var rnd = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

    // 立绘：每个部件都可能为「无」
    DIYS.pieces = {};
    SomuaSpine.partMap.forEach(function (pp) {
      var owners = diyPartOwners(pp[1]);
      if (!owners.length) return;
      if (Math.random() < 0.3) return;                      // 30% 留空
      DIYS.pieces[pp[1]] = rnd(owners).petID;
    });
    diyEnsureRequired();

    // 魂印 / 性格
    var souls = ((DATA.soulMarks || {})['真'] || []).concat((DATA.soulMarks || {})['基础'] || []);
    if (souls.length) DIYS.soul = rnd(souls).id;
    var pers = DATA.personalities || [];
    if (pers.length) DIYS.personality = rnd(pers).id;

    // 能力：0~4 条，同类（去等级）只取一个
    var groups = diyAbilityGroups();
    var keys = Object.keys(groups).sort(function () { return Math.random() - 0.5; });
    var count = Math.floor(Math.random() * 5);
    var picked = keys.slice(0, count).map(function (k) { return rnd(groups[k]).id; });
    while (picked.length < 4) picked.push(0);
    DIYS.abilities = picked.slice(0, 4);

    DIYS.anim = '';
    renderDiy();
    syncFilterUI_1();
  }

  function syncFilterUI_1() { /* 占位：保持结构，随机后无需额外同步 */ }

  // ---------------- DIY：把 [公式] 代入当前属性算出数值 ----------------

  var CALC_VARS = [
    { key: 'ATK', label: '攻击', field: 'attackValue', pct: false },
    { key: 'HLP', label: '生命', field: 'healthValue', pct: false },
    { key: 'DEF', label: '防御', field: 'defenseRatio', pct: true },
    { key: 'CRT', label: '暴击', field: 'criticalChance', pct: false },
    { key: 'SPD', label: '移速', field: 'speedValue', pct: false },
    { key: 'KBF', label: '击退', field: 'knockRatio', pct: true },
    { key: 'CTD', label: '暴击伤害', field: 'criticalDamageRatio', pct: true },
    { key: 'ATR', label: '速度', field: 'attackRatio', pct: true }
  ];

  // 按性格取 8 项属性；百分比类在公式里按 /100 参与运算
  function diyAttrVars() {
    var per = (DATA.personalities || []).filter(function (x) { return x.id === DIYS.personality; })[0];
    if (!per) return null;
    var vals = (per.数值 || []).slice(0, 5);
    var row = function (v) {
      return (DATA.attributes || []).filter(function (a) { return a.id === v; })[0] || null;
    };
    var r = [row(vals[0]), row(vals[1]), row(vals[2]), row(vals[3]), row(vals[4])];
    if (r.some(function (x) { return !x; })) return null;
    var out = {};
    CALC_VARS.forEach(function (v) {
      var src = v.key === 'DEF' ? r[1]
        : v.key === 'HLP' || v.key === 'KBF' ? r[2]
        : v.key === 'CRT' || v.key === 'CTD' ? r[3]
        : v.key === 'SPD' || v.key === 'ATR' ? r[4]
        : r[0];
      var raw = Number(src[v.field]) || 0;
      out[v.key] = v.pct ? raw / 100 : raw;
    });
    return out;
  }

  // 表达式求值（数字 / % / + - * / ( ) / 属性名），失败返回 null
  function calcFormula(expr, vars) {
    var src = String(expr || '');
    var pos = 0;
    function ws() { while (pos < src.length && /\s/.test(src[pos])) pos++; }
    function num() {
      ws();
      var start = pos;
      while (pos < src.length && /[0-9.]/.test(src[pos])) pos++;
      if (start === pos) return null;
      var v = parseFloat(src.slice(start, pos));
      if (src[pos] === '%') { pos++; v = v / 100; }
      return v;
    }
    function ident() {
      ws();
      var m = /^[A-Za-z]{3}/.exec(src.slice(pos));
      if (!m) return null;
      pos += 3;
      var k = m[0].toUpperCase();
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : null;
    }
    function atom() {
      ws();
      if (src[pos] === '(') {
        pos++;
        var v = expr_add();
        ws();
        if (src[pos] === ')') pos++;
        return v;
      }
      if (src[pos] === '-') { pos++; var n = atom(); return n === null ? null : -n; }
      if (/[0-9.]/.test(src[pos])) return num();
      if (/[A-Za-z]/.test(src[pos])) return ident();
      return null;
    }
    function expr_mul() {
      var left = atom();
      if (left === null) return null;
      for (;;) {
        ws();
        var op = src[pos];
        if (op !== '*' && op !== '/') return left;
        pos++;
        var right = atom();
        if (right === null) return null;
        if (op === '*') left = left * right;
        else { if (!right) return null; left = left / right; }
      }
    }
    function expr_add() {
      var left = expr_mul();
      if (left === null) return null;
      for (;;) {
        ws();
        var op = src[pos];
        if (op !== '+' && op !== '-') return left;
        pos++;
        var right = expr_mul();
        if (right === null) return null;
        left = op === '+' ? left + right : left - right;
      }
    }
    var val = expr_add();
    ws();
    if (pos !== src.length) return null;
    return (typeof val === 'number' && isFinite(val)) ? val : null;
  }

  // 用到多个属性时，把它们的颜色取平均作为数值颜色
  function mixColors(tokens) {
    var cols = tokens.map(function (k) { return ATTR_COLOR[k]; }).filter(Boolean);
    if (!cols.length) return null;
    if (cols.length === 1) return cols[0];
    var sum = [0, 0, 0];
    cols.forEach(function (hex) {
      sum[0] += parseInt(hex.slice(1, 3), 16);
      sum[1] += parseInt(hex.slice(3, 5), 16);
      sum[2] += parseInt(hex.slice(5, 7), 16);
    });
    return '#' + sum.map(function (v) {
      var s = Math.round(v / cols.length).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function fmtCalc(v) {
    if (v === null || v === undefined) return '';
    var abs = Math.abs(v);
    var s = abs >= 100 ? v.toFixed(1) : abs >= 10 ? v.toFixed(1) : v.toFixed(2);
    s = s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    return s;
  }

  // 把描述里的 [公式] 换成算好的数值；悬停显示「公式 = 代入过程」
  function renderDescCalc(text, vars) {
    if (!vars) return renderDesc(text);
    var out = '';
    var src = String(text == null ? '' : text);
    var re = /\[([^\]]+)\]/g;
    var last = 0, m;
    while ((m = re.exec(src)) !== null) {
      out += renderDesc(src.slice(last, m.index));
      var expr = m[1];
      var val = calcFormula(expr, vars);
      if (val === null) {
        out += renderDesc(m[0]);
      } else {
        var label = expr.replace(/\b(ATK|HLP|DEF|CRT|SPD|KBF|CTD|ATR)\b/g, function (tok) {
          return ATTR_LABEL[tok] || tok;
        });
        var PCT = { DEF: 1, KBF: 1, CTD: 1, ATR: 1 };
        var used = (expr.match(/\b(ATK|HLP|DEF|CRT|SPD|KBF|CTD|ATR)\b/g) || [])
          .filter(function (v, i, a) { return a.indexOf(v) === i; });
        var subs = used.map(function (k) {
          return (ATTR_LABEL[k] || k) + '=' + fmtCalc(PCT[k] ? vars[k] * 100 : vars[k]) + (PCT[k] ? '%' : '');
        }).join('、');
        var tip = label + (subs ? '\n代入：' + subs : '') + '\n结果：' + fmtCalc(val);
        var col = mixColors(used);
        out += '<span class="calc"' + (col ? ' style="color:' + col + ';border-bottom-color:' + hexToRgba(col, 0.45) + '"' : '') +
          ' title="' + esc(tip) + '">' + esc(fmtCalc(val)) + '</span>';
      }
      last = m.index + m[0].length;
    }
    out += renderDesc(src.slice(last));
    return out;
  }

  // ---------------- DIY：导出透明动画（APNG，保留 alpha 通道） ----------------

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function be32(v) { return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }

  function pngChunk(type, data) {
    var out = new Uint8Array(12 + data.length);
    var view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    var crcBuf = out.subarray(4, 8 + data.length);
    view.setUint32(8 + data.length, crc32(crcBuf));
    return out;
  }

  // RGBA → PNG 扫描线（每行前置 filter=0）
  function rawScanlines(rgba, w, h) {
    var out = new Uint8Array(h * (1 + w * 4));
    for (var y = 0; y < h; y++) {
      out[y * (1 + w * 4)] = 0;
      out.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (1 + w * 4) + 1);
    }
    return out;
  }

  function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate')))
      .arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  function exportDiyApng() {
    if (!DIYS.anim) { toast('先在「动作」里选一个动态动作'); return; }
    if (!SomuaSpine.meta) { toast('立绘素材还没加载完'); return; }
    if (typeof CompressionStream === 'undefined') { toast('当前浏览器不支持 APNG 导出'); return; }
    var pieces = diyPieces();
    if (!pieces.length) { toast('先选部件'); return; }

    var skel = SomuaSpine.combine(pieces);
    var anim = skel.data.findAnimation(DIYS.anim);
    var dur = anim ? anim.duration : 0;
    if (!(dur > 0.06)) { toast('「' + (ANIM_LABEL[DIYS.anim] || DIYS.anim) + '」是静态动作'); return; }

    var FPS = 20;
    var count = Math.min(40, Math.max(6, Math.round(dur * FPS)));
    var FW = 480, FH = 510;
    var stage = document.createElement('canvas');
    stage.width = FW; stage.height = FH;
    var sctx = stage.getContext('2d');            // 默认带 alpha，不铺底色
    var tmp = document.createElement('canvas');
    var raws = [];

    for (var i = 0; i < count; i++) {
      var tt = dur * (i / count);
      if (!SomuaSpine.render(tmp, skel, {
        maxWidth: FW - 16, maxHeight: FH - 16, scale: 4, pad: 4,
        anim: DIYS.anim, time: tt, supersample: 3
      })) continue;
      var cssW = parseFloat(tmp.style.width) || tmp.width;
      var cssH = parseFloat(tmp.style.height) || tmp.height;
      sctx.clearRect(0, 0, FW, FH);
      sctx.drawImage(tmp, (FW - cssW) / 2, (FH - cssH) / 2, cssW, cssH);
      raws.push(sctx.getImageData(0, 0, FW, FH).data);
    }
    if (raws.length < 2) { toast('这个动作只有一帧'); return; }

    var delayNum = 1, delayDen = FPS;
    deflate(rawScanlines(raws[0], FW, FH)).then(function (first) {
      var parts = [];
      var sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      parts.push(sig);
      var ihdr = new Uint8Array(13);
      var dv = new DataView(ihdr.buffer);
      dv.setUint32(0, FW); dv.setUint32(4, FH);
      ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
      parts.push(pngChunk('IHDR', ihdr));
      var actl = new Uint8Array(8);
      var av = new DataView(actl.buffer);
      av.setUint32(0, raws.length); av.setUint32(4, 0);       // 0 = 无限循环
      parts.push(pngChunk('acTL', actl));

      var seq = 0;
      function fctl(w, h) {
        var b = new Uint8Array(26);
        var v = new DataView(b.buffer);
        v.setUint32(0, seq++); v.setUint32(4, w); v.setUint32(8, h);
        v.setUint32(12, 0); v.setUint32(16, 0);
        v.setUint16(20, delayNum); v.setUint16(22, delayDen);
        b[24] = 0; b[25] = 0;                                  // dispose=none, blend=source
        return pngChunk('fcTL', b);
      }
      parts.push(fctl(FW, FH));
      parts.push(pngChunk('IDAT', first));

      var chain = Promise.resolve();
      for (var i = 1; i < raws.length; i++) {
        (function (idx) {
          chain = chain.then(function () {
            return deflate(rawScanlines(raws[idx], FW, FH)).then(function (data) {
              if (!data) return;
              parts.push(fctl(FW, FH));
              var fdat = new Uint8Array(4 + data.length);
              new DataView(fdat.buffer).setUint32(0, seq++);
              fdat.set(data, 4);
              parts.push(pngChunk('fdAT', fdat));
            });
          });
        })(i);
      }
      return chain.then(function () {
        parts.push(pngChunk('IEND', new Uint8Array(0)));
        var total = parts.reduce(function (a, b) { return a + b.length; }, 0);
        var buf = new Uint8Array(total);
        var off = 0;
        parts.forEach(function (b) { buf.set(b, off); off += b.length; });
        var blob = new Blob([buf], { type: 'image/apng' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '苏摩DIY_' + (ANIM_LABEL[DIYS.anim] || DIYS.anim) + '_透明_' + stamp() + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
        window.__apngDebug = { frames: raws.length, w: FW, h: FH, size: blob.size };
      });
    });
  }

  // ---------------- DIY：导出动作 WebM（不透明，高清流畅） ----------------

  function exportDiyWebm() {
    if (!DIYS.anim) { toast('先在「动作」里选一个动态动作'); return; }
    if (!SomuaSpine.meta) { toast('立绘素材还没加载完'); return; }
    var pieces = diyPieces();
    if (!pieces.length) { toast('先选部件'); return; }
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      toast('当前浏览器不支持 WebM 录制，请用 Edge / Chrome，或改用「透明 · APNG」');
      return;
    }

    var skel = SomuaSpine.combine(pieces);
    var anim = skel.data.findAnimation(DIYS.anim);
    var dur = anim ? anim.duration : 0;
    if (!(dur > 0.06)) { toast('「' + (ANIM_LABEL[DIYS.anim] || DIYS.anim) + '」是静态动作'); return; }

    var FW = 560, FH = 600, FPS = 30;
    var loops = Math.max(2, Math.ceil(2.4 / dur));        // 至少录两圈
    var total = dur * loops;

    var cv = document.createElement('canvas');
    cv.width = FW;
    cv.height = FH;
    var ctx = cv.getContext('2d');
    var tmp = document.createElement('canvas');

    // 透明背景在 WebM 里会变黑，先铺页面同款浅色底
    function paintBg() {
      var g = ctx.createLinearGradient(0, 0, 0, FH);
      g.addColorStop(0, '#fdf5f8');
      g.addColorStop(1, '#f6f8fd');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, FW, FH);
    }
    function drawAt(time) {
      if (!SomuaSpine.render(tmp, skel, {
        maxWidth: FW - 30, maxHeight: FH - 30, scale: 4, pad: 6,
        anim: DIYS.anim, time: time, supersample: 3
      })) return false;
      var cssW = parseFloat(tmp.style.width) || tmp.width;
      var cssH = parseFloat(tmp.style.height) || tmp.height;
      paintBg();
      ctx.drawImage(tmp, (FW - cssW) / 2, (FH - cssH) / 2, cssW, cssH);
      return true;
    }
    drawAt(0);

    var mime = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';

    var stream = cv.captureStream(FPS);
    var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
    var chunks = [];
    var name = '苏摩DIY_' + (ANIM_LABEL[DIYS.anim] || DIYS.anim) + '_' + stamp() + '.webm';

    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var blob = new Blob(chunks, { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      window.__webmDebug = { size: blob.size, mime: mime, frames: total * FPS };
    };
    rec.start();

    var start = performance.now();
    function step(now) {
      var elapsed = (now - start) / 1000;
      if (elapsed >= total) {
        // 多录 2 帧，确保末帧收进流里
        setTimeout(function () { try { rec.stop(); } catch (e) { /* 忽略 */ } }, 120);
        return;
      }
      drawAt(elapsed % dur);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------------- DIY：导出 / 导入 ----------------

  function diySnapshot() {
    var pieces = {};
    Object.keys(DIYS.pieces).forEach(function (k) { if (DIYS.pieces[k]) pieces[k] = DIYS.pieces[k]; });
    var names = {};
    Object.keys(pieces).forEach(function (k) {
      var s = (DATA.sumo || []).filter(function (x) { return x.petID === pieces[k]; })[0];
      names[k] = s ? s.名称 : String(pieces[k]);
    });
    return {
      _说明: '苏摩 DIY 配置（外观部件 + 魂印 / 性格 / 能力）',
      _生成时间: new Date().toLocaleString('zh-CN'),
      外观: pieces,
      外观名称: names,
      魂印: DIYS.soul || 0,
      魂印名: (diySoulById(DIYS.soul) || {}).名称 || '',
      性格: DIYS.personality || 0,
      性格名: ((DATA.personalities || []).filter(function (x) { return x.id === DIYS.personality; })[0] || {}).名称 || '',
      能力: [0, 1, 2, 3].map(function (i) { return Number(DIYS.abilities[i] || 0); }),
      能力名: (DIYS.abilities || []).map(diyAbilityById).filter(Boolean).map(function (a) { return a.名称; }),
      动作: DIYS.anim || ''
    };
  }

  function exportDiyJson() {
    download('苏摩DIY_' + stamp() + '.json',
      JSON.stringify(diySnapshot(), null, 2), 'application/json;charset=utf-8');
  }

  function importDiyJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var raw;
      try { raw = JSON.parse(String(reader.result)); }
      catch (err) { toast('JSON 解析失败：' + err.message); return; }
      var pieces = raw.外观 || {};
      DIYS.pieces = {};
      SomuaSpine.partMap.forEach(function (pp) {
        var v = Number(pieces[pp[1]] || 0);
        if (v) DIYS.pieces[pp[1]] = v;
      });
      diyEnsureRequired();
      var soulId = Number(raw.魂印 || 0);
      DIYS.soul = diySoulById(soulId) ? soulId : DIYS.soul;
      var perId = Number(raw.性格 || 0);
      DIYS.personality = (DATA.personalities || []).some(function (x) { return x.id === perId; })
        ? perId : DIYS.personality;
      DIYS.abilities = [0, 1, 2, 3].map(function (i) {
        var id = Number((raw.能力 || [])[i] || 0);
        return diyAbilityById(id) ? id : 0;
      });
      DIYS.anim = String(raw.动作 || '');
      DIYS.inited = true;
      renderDiy();
      toast('已导入 DIY 配置');
    };
    reader.readAsText(file);
  }

  // 导出截图：角色立绘 + 属性 + 魂印 / 性格 / 能力 文字
  function exportDiyPng() {
    var W = 840, PAD = 32, inner = W - PAD * 2, LINE_H = 22;
    var probe = document.createElement('canvas').getContext('2d');
    probe.font = font(13.5);

    var pieces = diyPieces();
    var charCanvas = null, charW = 0, charH = 0;
    if (pieces.length && SomuaSpine.meta) {
      charCanvas = document.createElement('canvas');
      try {
        var skel = SomuaSpine.combine(pieces);
        if (SomuaSpine.render(charCanvas, skel, {
          maxWidth: 300, maxHeight: 320, scale: 4, pad: 6,
          anim: DIYS.anim || null, time: 0
        })) {
          charW = parseFloat(charCanvas.style.width) || 300;
          charH = parseFloat(charCanvas.style.height) || 320;
        } else {
          charCanvas = null;
        }
      } catch (e) { charCanvas = null; }
    }

    var soul = diySoulById(DIYS.soul);
    var per = (DATA.personalities || []).filter(function (x) { return x.id === DIYS.personality; })[0];
    var abs = (DIYS.abilities || []).map(diyAbilityById).filter(Boolean);
    var stats = diyStats(per);

    var blocks = [];
    var vars = diyAttrVars();
    // 与页面一致：把 [公式] 换成算好的数值，数字用「用到属性」的叠色
    function calcChars(text) {
      var out = [];
      var src = String(text == null ? '' : text);
      var re = /\[([^\]]+)\]/g;
      var last = 0, m;
      function pushChars(arr) { arr.forEach(function (c) { out.push(c); }); }
      while ((m = re.exec(src)) !== null) {
        if (m.index > last) pushChars(descChars(src.slice(last, m.index)));
        var expr = m[1];
        var val = calcFormula(expr, vars);
        if (val === null) {
          pushChars(descChars(m[0]));
        } else {
          var col = mixColors((expr.match(/\b(ATK|HLP|DEF|CRT|SPD|KBF|CTD|ATR)\b/g) || [])
            .filter(function (v, i, a) { return a.indexOf(v) === i; })) || EX.ink;
          fmtCalc(val).split('').forEach(function (ch) { out.push({ ch: ch, color: col }); });
        }
        last = m.index + m[0].length;
      }
      if (last < src.length) pushChars(descChars(src.slice(last)));
      return out;
    }
    function addBlock(title, text, rarity, color) {
      blocks.push({
        title: title, lines: wrapChars(probe, calcChars(text), inner),
        rarity: rarity || 0, color: color || null
      });
    }
    if (soul) addBlock('魂印 · ' + soul.名称, soul.描述);
    if (per) blocks.push({ title: '性格 · ' + per.名称, lines: [], tag: per.流派 || '' });
    abs.forEach(function (a) {
      addBlock(a.名称, a.描述, a.rarity, RARITY_COLOR[a.rarity] || '#94a3b8');
    });

    var titleH = 56;
    var charBoxH = charCanvas ? charH + 24 : 0;
    var statsH = stats ? 96 : 0;
    var blocksH = blocks.reduce(function (a, b) {
      return a + 30 + b.lines.length * LINE_H + 14 + (b.color ? 26 : 0);
    }, 0);
    var H = PAD + titleH + charBoxH + statsH + blocksH + PAD;

    var DPR = 2;
    var canvas = document.createElement('canvas');
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    var ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = EX.bg;
    ctx.fillRect(0, 0, W, H);

    var y = PAD;
    ctx.fillStyle = EX.ink;
    ctx.font = font(22, '700');
    ctx.textAlign = 'left';
    ctx.fillText('DIY 苏摩', PAD, y + 26);
    var titleW = ctx.measureText('DIY 苏摩').width;
    if (DIYS.anim) {
      ctx.font = font(12.5);
      ctx.fillStyle = EX.ink3;
      ctx.fillText('动作 · ' + (ANIM_LABEL[DIYS.anim] || DIYS.anim), PAD + titleW + 14, y + 26);
    }
    y += titleH;

    if (charCanvas) {
      var cx = PAD + (inner - charW) / 2;
      ctx.drawImage(charCanvas, cx, y, charW, charH);
      y += charH + 24;
    }

    if (stats) {
      var cellW = (inner - 3 * 10) / 4;
      stats.forEach(function (s, i) {
        var col = i % 4, row = Math.floor(i / 4);
        var bx = PAD + col * (cellW + 10);
        var by = y + row * 48;
        ctx.fillStyle = '#f8fafd';
        roundRect(ctx, bx, by, cellW, 40, 10); ctx.fill();
        ctx.fillStyle = EX.ink;
        ctx.font = font(15, '700');
        ctx.textAlign = 'left';
        ctx.fillText(String(s.v), bx + 10, by + 19);
        ctx.fillStyle = EX.ink3;
        ctx.font = font(11);
        ctx.fillText(s.k, bx + 10, by + 33);
      });
      y += statsH;
    }

    blocks.forEach(function (b) {
      if (b.color) {
        ctx.fillStyle = hexToRgba(b.color, 0.10);
        roundRect(ctx, PAD - 12, y - 8, inner + 24, 30 + b.lines.length * LINE_H + 16, 12);
        ctx.fill();
        ctx.fillStyle = b.color;
        roundRect(ctx, PAD - 12, y - 8, 3, 30 + b.lines.length * LINE_H + 16, 2);
        ctx.fill();
        y += 8;
      }
      ctx.fillStyle = EX.ink;
      ctx.font = font(13.5, '700');
      ctx.textAlign = 'left';
      ctx.fillText(b.title, PAD, y + 16);
      if (b.tag) {
        var tw0 = ctx.measureText(b.title).width;
        ctx.font = font(11.5);
        var tagW = ctx.measureText(b.tag).width + 14;
        ctx.fillStyle = 'rgba(255, 122, 152, .14)';
        roundRect(ctx, PAD + tw0 + 8, y + 2, tagW, 18, 6);
        ctx.fill();
        ctx.fillStyle = '#c2416b';
        ctx.fillText(b.tag, PAD + tw0 + 15, y + 15);
        ctx.font = font(13.5, '700');
        ctx.fillStyle = EX.ink;
      }
      if (b.rarity) {
        var tw = ctx.measureText(b.title).width;
        ctx.beginPath();
        ctx.arc(PAD + tw + 8, y + 12, 4, 0, Math.PI * 2);
        ctx.fillStyle = { 1: '#2f9e63', 2: '#2f6bee', 3: '#8b5cf6' }[b.rarity] || '#94a3b8';
        ctx.fill();
        ctx.fillStyle = EX.ink;
      }
      y += 30;
      ctx.font = font(13.5);
      b.lines.forEach(function (ln) {
        var lx = PAD;
        ln.forEach(function (ch) {
          ctx.fillStyle = ch.color || EX.ink2;
          ctx.fillText(ch.ch, lx, y + 12);
          lx += ctx.measureText(ch.ch).width;
        });
        y += LINE_H;
      });
      y += 14;
    });

    if (!charCanvas && !soul && !per && !abs.length) {
      ctx.fillStyle = EX.ink3;
      ctx.font = font(13.5);
      ctx.fillText('还没有任何 DIY 内容', PAD, y + 16);
    }

    saveCanvasPng(canvas, '苏摩DIY_' + stamp() + '.png');
  }

  /* ---------------------------- 对话图鉴（行状折叠 + 搜索 / 压缩） ---------------------------- */

  // 同一个人说同一句话只保留第一条
  function dedupeTalks(list) {
    var seen = {};
    return list.filter(function (d) {
      var key = d.who + '\u0001' + d.text;
      if (seen[key]) return false;
      seen[key] = 1;
      return true;
    });
  }

  function talkGroups() {
    var groups = {};
    DATA.dialogues.forEach(function (d) {
      var kind = talkType(d);
      var who = d.适用精灵 || (kind === '待机情绪' || kind === '特殊精灵对话' ? '通用' : '');
      (groups[kind] = groups[kind] || []).push({
        who: who, text: d.对话, 动画: d.动画, 类型: d.类型, 分类: d.分类
      });
    });
    return groups;
  }

  function renderTalks() {
    var groups = talkGroups();
    var q = talkState.q.trim().toLowerCase();
    var kept = 0, dropped = 0;

    var keys = Object.keys(groups).sort(function (a, b) {
      var ia = TALK_ORDER.indexOf(a); if (ia < 0) ia = 99;
      var ib = TALK_ORDER.indexOf(b); if (ib < 0) ib = 99;
      return ia - ib || a.localeCompare(b, 'zh-Hans-CN');
    });

    var html = keys.map(function (k) {
      var all = groups[k];
      var list = talkState.compress ? dedupeTalks(all) : all;
      dropped += all.length - list.length;
      if (q) {
        list = list.filter(function (d) {
          return (d.text + ' ' + d.who + ' ' + k).toLowerCase().indexOf(q) > -1;
        });
      }
      if (!list.length) return '';
      kept += list.length;

      var open = q ? ' is-open' : '';
      var cells = list.map(function (d) {
        return '<div class="talkitem">' +
          (d.who ? '<span class="talkitem__who">' + esc(d.who) + '</span>' : '') +
          '<span class="talkitem__text">' + esc(d.text) + '</span>' +
          '</div>';
      }).join('');

      var count = (talkState.compress && all.length !== list.length)
        ? all.length + ' → ' + list.length + ' 条'
        : list.length + ' 条';

      return '<article class="acc__item' + open + '" style="--c:#ff9db6;--c-soft:#ffe6ec">' +
        '<button class="acc__head acc__head--talk" type="button" aria-expanded="' + (q ? 'true' : 'false') + '">' +
          '<span class="acc__dot"></span>' +
          '<span class="acc__title">' + esc(k) + '</span>' +
          '<span class="acc__count">' + count + '</span>' +
          '<span class="acc__chev"></span>' +
        '</button>' +
        '<div class="acc__body"><div class="talkgrid">' + cells + '</div></div>' +
      '</article>';
    }).join('');

    $('#talks').innerHTML = html || '<article class="acc__item"><div class="acc__body" style="display:block;padding:18px"><span class="talkgroup__empty">没有匹配的台词</span></div></article>';
    $('#talkLine').innerHTML = '共 <b>' + kept + '</b> 条台词' +
      (dropped > 0 ? '（压缩掉 ' + dropped + ' 条重复）' : '') +
      (q ? ' · 搜索「' + esc(talkState.q.trim()) + '」' : '');
  }

  /* ---------------------------- 详情弹窗 ---------------------------- */

  var lastFocus = null;
  var modalTab = 'soul';
  var modalAnim = 'await';

  // 骨架里的 11 个动作（浏览器实时播放）
  var ANIM_TABS = [
    ['await', '待机'], ['move', '移动'], ['attack', '攻击'], ['hit', '受击'],
    ['happy', '开心'], ['sad', '难过'], ['power', '蓄力'], ['pain', '痛苦'],
    ['normal', '普通'], ['victory', '胜利'], ['fail', '失败']
  ];

  function slotCellHtml(x) {
    var c = geneColor(x.基因);
    var orig = isOrigSlot(x);
    var geneTxt = geneLabel(x.基因);
    var main = prefs.mode === 'gene' ? geneTxt : x.名称;
    var sub = prefs.mode === 'gene' ? x.名称 : geneTxt;
    return '<div class="scell' + (orig ? ' scell--orig' : '') + '" ' +
      'style="--c:' + c + ';--c-soft:' + hexToRgba(c, ALPHA_CELL) + '">' +
      '<span class="scell__no">' + x.slot + '</span>' +
      '<span class="scell__main">' + esc(main) + '</span>' +
      '<span class="scell__sub">' + esc(sub) + '</span>' +
      '</div>';
  }

  // 左 1-3 / 右 4-6
  function seqPanelHtml(s) {
    var seq = s.基因序列 || [];
    var btn = '<button class="btn btn--ghost seqedit__btn" type="button" data-seqedit-btn="' + s.id + '">' +
      (s.有序列 ? '修改基因序列' : '手动设置基因序列') + '</button>';
    var badge = s.手动序列 ? '<span class="seqedit__badge">手动</span>' : '';
    if (!s.有序列 || !seq.length) {
      return '<div class="seq__pending">该完美基因序列待测定' + badge + '</div>' +
        '<div class="seqedit__actions">' + btn + '</div>';
    }
    var cells = seq.map(function (x, i) {
      return '<div class="seq"><b>位 ' + (i + 1) + '</b>' + esc(geneLabel(x.基因)) + '</div>';
    }).join('');
    return '<div class="seqrow">' + cells + '</div>' +
      '<div class="seqedit__actions">' + btn + badge + '</div>';
  }

  function soulPanelHtml(s) {
    var pair = s.魂印 || {};
    return '<div class="soulrow">' +
      soulCardHtml(pair['真'], '完美魂印', 'soulcard__tag--sp') +
      soulCardHtml(pair['基础'], '基础魂印', '') +
    '</div>' +
    '<p class="dim" style="font-size:12px;margin-top:10px">' +
      '部件：' + esc(Object.keys(s.部件 || {}).filter(function (k) { return s.部件[k]; }).join(' · ') || '无') +
      ' ｜ 精灵ID ' + esc(s.petID) +
      (s.赛季 ? ' ｜ 赛季 ' + esc(s.赛季) : '') +
    '</p>';
  }

  function recipePanelHtml(s) {
    var slots = s.slots || [];
    return '<div class="mtoolbar">' +
        '<div class="seg" id="mModeSeg" role="group" aria-label="显示内容切换">' +
          '<button type="button" class="seg__btn' + (prefs.mode === 'gene' ? ' is-on' : '') + '" data-mode="gene">基因显示</button>' +
          '<button type="button" class="seg__btn' + (prefs.mode === 'feed' ? ' is-on' : '') + '" data-mode="feed">喂食显示</button>' +
        '</div>' +
        '<span class="mtoolbar__hint">左 1-3 ｜ 右 4-6</span>' +
      '</div>' +
      '<div class="slotgrid">' +
        '<div class="slotcol">' + slots.slice(0, 3).map(slotCellHtml).join('') + '</div>' +
        '<div class="slotcol">' + slots.slice(3, 6).map(slotCellHtml).join('') + '</div>' +
      '</div>' +
      '<div class="seqblock">' +
        '<div class="seqblock__head">基因序列（6 位）<span class="dim">位 1-3 属性基因 ｜ 位 4-6 颜色基因</span></div>' +
        seqPanelHtml(s) +
      '</div>';
  }

  function animPanelHtml(s) {
    function row(list) {
      return '<div class="anim__row">' + list.map(function (pair) {
        return '<button type="button" class="anim__btn' + (modalAnim === pair[0] ? ' is-on' : '') +
          '" data-anim="' + pair[0] + '">' + pair[1] + '</button>';
      }).join('') + '</div>';
    }
    // 固定两行：5 + 6，避免按钮数量变化影响布局
    var btns = row(ANIM_TABS.slice(0, 5)) + row(ANIM_TABS.slice(5));
    return '<div class="anim">' +
        '<div class="anim__stage" id="animStage">' +
          '<canvas class="anim__canvas" id="animCanvas"></canvas>' +
          '<p class="anim__none" id="animNone" hidden>骨架素材未就绪（先跑 tools/somua_spine_assets.py）</p>' +
        '</div>' +
        '<div class="anim__btns">' + btns + '</div>' +
      '</div>';
  }

  // 浏览器实时播放骨架动画（spine-canvas 4.0）
  var animStop = null;

  function mountAnim(stage, s, name) {
    if (animStop) { animStop(); animStop = null; }
    var canvas = $('#animCanvas');
    var none = $('#animNone');
    if (!canvas) return;
    $$('#modalBody .anim__btn').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-anim') === name);
    });
    SomuaSpine.load().then(function () {
      var skel = SomuaSpine.make(s.petID, s.部件);
      if (!skel.data.findAnimation(name)) {
        name = (SomuaSpine.anims[0] || 'await');
      }
      var stage = canvas.parentNode;
      var bw = (stage && stage.clientWidth) ? stage.clientWidth - 8 : 400;
      var bh = (stage && stage.clientHeight) ? stage.clientHeight - 8 : 392;
      canvas.__spineOpt = { maxWidth: bw, maxHeight: bh, scale: 3, pad: 2 };
      SomuaSpine.render(canvas, skel, Object.assign({}, canvas.__spineOpt, { anim: name, time: 0 }));
      animStop = SomuaSpine.play(canvas, skel, name);
    }).catch(function (err) {
      if (none) { none.hidden = false; none.textContent = '骨架素材未就绪：' + err.message; }
      canvas.hidden = true;
    });
  }

  function talkPanelHtml(s) {
    var talks = (s.talks || []).filter(isPrivateTalk);
    if (!talks.length) return '<p class="mtalk__none">这只苏摩没有专属台词。</p>';
    return '<div class="mtalk"><ul>' + talks.map(function (t) {
      return '<li>「' + esc(t.对话) + '」<span>' + esc(talkType(t)) + '</span></li>';
    }).join('') + '</ul></div>';
  }

  function renderModalBody(s) {
    var c = geneColor(mainGene(s));
    var talkCount = (s.talks || []).filter(isPrivateTalk).length;

    $('#modalBody').innerHTML =
      '<div class="mhead" style="--c:' + c + ';--c-soft:' + hexToRgba(c, ALPHA_CELL) + '">' +
        '<div class="mhead__art">' + artCanvasHtml(s, 'mhead__canvas') + '</div>' +
        '<div>' +
          '<div class="mhead__name">' + esc(s.名称) + '</div>' +
          '<div class="mhead__meta"><span>图鉴 #' + s.id + '</span><span>精灵ID ' + s.petID + '</span>' +
            '<span>部件 ' + (s.部件数 || 0) + '/9</span>' +
            (s.赛季 ? '<span>赛季 ' + esc(s.赛季) + '</span>' : '') +
            (s.星系 ? '<span>' + esc(s.星系) + '</span>' : '') + '</div>' +
          '<p class="mhead__desc">' + esc(s.介绍) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mtabs">' +
        '<button class="mtab' + (modalTab === 'soul' ? ' is-on' : '') + '" data-mtab="soul" type="button">魂印</button>' +
        '<button class="mtab' + (modalTab === 'recipe' ? ' is-on' : '') + '" data-mtab="recipe" type="button">配方</button>' +
        '<button class="mtab' + (modalTab === 'anim' ? ' is-on' : '') + '" data-mtab="anim" type="button">动画</button>' +
        '<button class="mtab' + (modalTab === 'talk' ? ' is-on' : '') + '" data-mtab="talk" type="button">对话' +
          (talkCount ? '（' + talkCount + '）' : '') + '</button>' +
      '</div>' +
      '<div class="mbody">' +
        '<div class="mpanel' + (modalTab === 'soul' ? ' is-on' : '') + '" data-mpanel="soul">' +
          soulPanelHtml(s) +
        '</div>' +
        '<div class="mpanel' + (modalTab === 'recipe' ? ' is-on' : '') + '" data-mpanel="recipe">' +
          recipePanelHtml(s) +
          ((s.uniqueGenes || []).length
            ? '<div class="gene-row" style="margin-top:14px">' + s.uniqueGenes.map(geneChip).join('') + '</div>'
            : '') +
          '<div class="mfoot"><button class="btn btn--accent" id="copyRecipe" type="button">复制基因序列</button></div>' +
        '</div>' +
        '<div class="mpanel' + (modalTab === 'anim' ? ' is-on' : '') + '" data-mpanel="anim">' +
          animPanelHtml(s) +
        '</div>' +
        '<div class="mpanel' + (modalTab === 'talk' ? ' is-on' : '') + '" data-mpanel="talk">' +
          talkPanelHtml(s) +
        '</div>' +
      '</div>';

    paintAllArt($('#modalBody'));
    $('#copyRecipe').addEventListener('click', function () { copyRecipe(s); });

    var animStage = $('#animStage');
    if (animStage) mountAnim(animStage, s, modalAnim);
    $$('#modalBody .anim__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modalAnim = btn.getAttribute('data-anim');
        renderModalBody(s);
      });
    });
    $$('#modalBody .mtab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modalTab = btn.getAttribute('data-mtab');
        renderModalBody(s);
        if (modalTab === 'anim') mountAnim($('#animStage'), s, modalAnim);
      });
    });
    $$('#modalBody #mModeSeg .seg__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        prefs.mode = btn.getAttribute('data-mode');
        savePrefs();
        syncModeButtons();
        renderModalBody(s);
        renderList();
      });
    });
  }

  function openModal(id) {
    var s = byId(id);
    if (!s) return;
    modalTab = 'soul';
    modalAnim = 'await';
    renderModalBody(s);
    lastFocus = document.activeElement;
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    paintAllArt($('#modalBody'));
  }

  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function recipeText(s) {
    var seq = s.基因序列 || [];
    var body = seq.length && s.有序列
      ? seq.map(function (x, i) { return (i + 1) + '.' + (x.基因 || '原始'); }).join(' / ')
      : '该完美基因序列待测定';
    return s.名称 + '（#' + s.id + ' · 精灵ID ' + s.petID + '）\n' +
      '基因序列：' + body + '\n' +
      '魂印：' + ((s.魂印 && s.魂印['基础']) ? s.魂印['基础'].名称 : '-') +
      ' ／ 真·' + ((s.魂印 && s.魂印['真']) ? s.魂印['真'].名称 : '-');
  }

  function copyRecipe(s) {
    var text = recipeText(s);
    var btn = $('#copyRecipe');
    var done = function () {
      if (!btn) return;
      btn.textContent = '已复制 ✓';
      setTimeout(function () { btn.textContent = '复制基因序列'; }, 1500);
    };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
      document.body.removeChild(ta);
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ---------------------------- 切换控件同步 ---------------------------- */

  function syncLayoutButtons() {
    $$('#layoutSeg .seg__btn').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-layout') === prefs.layout);
    });
  }

  function syncModeButtons() {
    $$('#modeSeg .seg__btn').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-mode') === prefs.mode);
    });
  }

  function syncSortControls() {
    $('#sort').value = prefs.sort;
    $('#desc').checked = prefs.desc;
  }

  /* ---------------------------- 导出 ---------------------------- */

  function stamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function exportCsv() {
    var head = ['图鉴编号', '精灵ID', '名称', '赛季'];
    for (var i = 1; i <= 6; i++) head.push('第' + i + '格基因');
    for (var j = 1; j <= 6; j++) head.push('第' + j + '格道具');
    head.push('基因种类', '专属对话数');

    var lines = [head.join(',')];
    filtered().forEach(function (s) {
      var cells = s.slots || [];
      var row = [s.id, s.petID, s.名称, s.赛季 ? ('赛季' + s.赛季) : '无赛季'];
      cells.forEach(function (x) { row.push(geneLabel(x.基因)); });
      cells.forEach(function (x) { row.push(x.名称); });
      row.push((s.uniqueGenes || []).map(geneLabel).join('+'));
      row.push((s.talks || []).filter(isPrivateTalk).length);
      lines.push(row.map(function (v) {
        var str = String(v == null ? '' : v);
        return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
      }).join(','));
    });
    download('苏摩配方_' + prefs.mode + '_' + stamp() + '.csv',
      '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  // ---------------- 图鉴面板导出（PNG / CSV） ----------------

  // 描述里的 ATK/HLP… → 中文；导出 CSV 用纯文本，导出 PNG 用彩色分段
  function descPlain(text) {
    return String(text == null ? '' : text).replace(ATTR_TOKEN, function (tok) {
      return ATTR_LABEL[tok] || tok;
    });
  }

  // → [{ch, color}] 逐字带颜色，便于折行后逐字上色
  function descChars(text) {
    var out = [];
    function push(str, color) {
      for (var i = 0; i < str.length; i++) out.push({ ch: str[i], color: color || null });
    }
    var src = String(text == null ? '' : text);
    var re = /\b(ATK|HLP|DEF|CRT|SPD|KBF|CTD|ATR)\b/g;
    var last = 0, m;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) push(src.slice(last, m.index), null);
      push(ATTR_LABEL[m[1]] || m[1], ATTR_COLOR[m[1]]);
      last = m.index + m[0].length;
    }
    if (last < src.length) push(src.slice(last), null);
    return out;
  }

  function plainChars(text) {
    var out = [];
    String(text == null ? '' : text).split('').forEach(function (ch) { out.push({ ch: ch, color: null }); });
    return out;
  }

  // 每个面板一张表：{ title, name, columns:[{label,width,align}], rows:[[...]] }
  function panelSpec(kind) {
    if (kind === 'soul') {
      var sp = (DATA.soulMarks && DATA.soulMarks['真']) || [];
      var base = (DATA.soulMarks && DATA.soulMarks['基础']) || [];
      return {
        title: '魂印图鉴', name: '魂印图鉴',
        columns: [
          { label: '档位', width: 100, align: 'center' },
          { label: '名称', width: 190, align: 'center' },
          { label: '效果', width: 700, align: 'left', rich: true }
        ],
        rows: sp.concat(base).map(function (m) {
          return [m.id >= 11000 ? '完美魂印' : '基础魂印', m.名称, m.描述];
        })
      };
    }
    if (kind === 'ability') {
      return {
        title: '能力图鉴', name: '能力图鉴',
        columns: [
          { label: '名称', width: 180, align: 'center' },
          { label: '稀有度', width: 90, align: 'center' },
          { label: '效果', width: 720, align: 'left', rich: true }
        ],
        rows: abilityList().map(function (a) {
          return [a.名称, a.rarity ? '★'.repeat(a.rarity) : '—', a.描述];
        })
      };
    }
    if (kind === 'personality') {
      return {
        title: '性格图鉴', name: '性格图鉴',
        columns: [{ label: '性格', width: 140, align: 'center' }].concat(
          PERSONALITY_ATTR.map(function (n) { return { label: n, width: 90, align: 'center' }; })),
        rows: (DATA.personalities || []).map(function (p) {
          var vals = (p.数值 || []).slice(0, 5);
          return [p.名称].concat(vals.map(function (v) { return String(v); }));
        })
      };
    }
    if (kind === 'status') {
      return {
        title: '状态效果', name: '状态效果',
        columns: [
          { label: '名称', width: 130, align: 'center' },
          { label: '类型', width: 80, align: 'center' },
          { label: '结算规则', width: 120, align: 'center' },
          { label: '最大层数', width: 90, align: 'center' },
          { label: '效果', width: 620, align: 'left', rich: true }
        ],
        rows: (DATA.statusEffects || []).map(function (s) {
          return [s.名称, STATUS_TYPE[s.类型] || '—',
                  STATUS_RULE[s.叠加规则] || s.叠加规则 || '—',
                  String(s.最大层数), s.描述];
        })
      };
    }
    return {
      title: '苏摩基础属性表', name: '基础属性表',
      columns: [{ label: '等级', width: 80, align: 'center' }].concat(
        ATTR_COLS.map(function (c) {
          return { label: c[1] + (c[3] ? ' %' : ''), width: 96, align: 'center' };
        })),
      rows: (DATA.attributes || []).slice().sort(function (a, b) { return a.id - b.id; })
        .map(function (r) {
          return [String(r.id)].concat(ATTR_COLS.map(function (c) { return String(r[c[0]]); }));
        })
    };
  }

  function panelCsv(kind) {
    var spec = panelSpec(kind);
    var lines = [spec.columns.map(function (c) { return c.label; }).join(',')];
    spec.rows.forEach(function (row) {
      lines.push(row.map(function (v, i) {
        var str = spec.columns[i] && spec.columns[i].rich ? descPlain(v) : String(v == null ? '' : v);
        return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
      }).join(','));
    });
    download(spec.name + '_' + stamp() + '.csv',
      '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  // 逐字折行：输入 [{ch,color}]，输出多行 [{ch,color}]
  function wrapChars(ctx, chars, maxWidth) {
    var lines = [];
    var line = [];
    var width = 0;
    chars.forEach(function (c) {
      if (c.ch === '\n') { lines.push(line); line = []; width = 0; return; }
      var w = ctx.measureText(c.ch).width;
      if (line.length && width + w > maxWidth) {
        lines.push(line);
        line = [];
        width = 0;
      }
      line.push(c);
      width += w;
    });
    lines.push(line);
    return lines;
  }

  // 画一行彩色文字
  function drawChars(ctx, chars, x, y, defaultColor) {
    var cx = x;
    chars.forEach(function (c) {
      ctx.fillStyle = c.color || defaultColor;
      ctx.fillText(c.ch, cx, y);
      cx += ctx.measureText(c.ch).width;
    });
  }

  function panelPng(kind) {
    var spec = panelSpec(kind);
    var PAD = 28, ROW_MIN = 34, LINE_H = 21, HEADER_H = 42, TITLE_H = 74;
    var tableW = spec.columns.reduce(function (a, c) { return a + c.width; }, 0);
    var W = tableW + PAD * 2;

    var probe = document.createElement('canvas').getContext('2d');
    probe.font = font(13);
    var layout = spec.rows.map(function (row) {
      var cells = row.map(function (v, i) {
        var c = spec.columns[i];
        var chars = c.rich ? descChars(v) : plainChars(v);
        return { lines: wrapChars(probe, chars, c.width - 20), width: c.width,
                 align: c.rich ? 'left' : 'center', rich: !!c.rich };
      });
      var maxLines = cells.reduce(function (a, c) { return Math.max(a, c.lines.length); }, 1);
      return { cells: cells, h: Math.max(ROW_MIN, maxLines * LINE_H + 14) };
    });
    var bodyH = layout.reduce(function (a, r) { return a + r.h; }, 0);
    var H = TITLE_H + HEADER_H + bodyH + 24;

    var DPR = 2;
    var canvas = document.createElement('canvas');
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    var ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);
    ctx.fillStyle = EX.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = EX.ink;
    ctx.font = font(22, '700');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(spec.title, PAD, 42);
    // 不再标注来源与日期

    var x0 = PAD, y = TITLE_H;
    ctx.fillStyle = '#fff6f9';
    roundRect(ctx, x0, y, tableW, HEADER_H, 10); ctx.fill();
    ctx.font = font(13, '600');
    ctx.fillStyle = EX.ink2;
    var cx = x0;
    spec.columns.forEach(function (c) {
      ctx.textAlign = 'center';                 // 页面表头统一居中
      ctx.fillText(c.label, cx + c.width / 2, y + HEADER_H / 2 + 5);
      cx += c.width;
    });
    y += HEADER_H;

    layout.forEach(function (r, idx) {
      if (idx % 2 === 1) {
        ctx.fillStyle = 'rgba(255, 246, 249, .55)';
        ctx.fillRect(x0, y, tableW, r.h);
      }
      ctx.font = font(13);
      var x = x0;
      r.cells.forEach(function (cell, i) {
        var base = i === 0 ? EX.ink : EX.ink2;
        var ty = y + 14;
        cell.lines.forEach(function (ln) {
          var lineW = ln.reduce(function (a, c) { return a + ctx.measureText(c.ch).width; }, 0);
          var tx = cell.align === 'center' ? x + (cell.width - lineW) / 2 : x + 10;
          ctx.textAlign = 'left';                 // 逐字绘制，需要左对齐坐标系
          var save = ctx.fillStyle;
          void save;
          drawChars(ctx, ln, tx, ty + 12, base);
          ty += LINE_H;
        });
        x += cell.width;
      });
      ctx.strokeStyle = EX.lineSoft;
      ctx.beginPath();
      ctx.moveTo(x0, y + r.h);
      ctx.lineTo(x0 + tableW, y + r.h);
      ctx.stroke();
      y += r.h;
    });

    saveCanvasPng(canvas, spec.name + '_' + stamp() + '.png');
  }

  // canvas → PNG 文件（必须走 toBlob；直接把 dataURL 当文本塞进 Blob 会得到坏文件）
  function saveCanvasPng(canvas, name) {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    }, 'image/png');
  }

  function exportPanel(kind, fmt) {
    if (fmt === 'csv') panelCsv(kind); else panelPng(kind);
  }

  // ---------------- 导出截图（PNG） ----------------
  // 导出图片按当前筛选 / 排序 / 布局重绘到 canvas，不含立绘（只留配色占位块）
  var EXPORT_FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
  var EX = {
    bg: '#f6f8fd', card: '#ffffff', line: '#e5eaf4', lineSoft: '#f2f4f9',
    ink: '#1e2432', ink2: '#5a647a', ink3: '#949db1', accent: '#ff6f91'
  };

  function font(size, weight) { return (weight ? weight + ' ' : '') + size + 'px ' + EXPORT_FONT; }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, rr); return; }
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  function softColor(hex, alpha) {
    return hexToRgba(geneColor(hex), alpha);
  }

  // 画一个格子：gene 模式是彩底 + 基因名；feed 模式是白底 + 下划线 + 道具名
  function drawCell(ctx, x, y, w, h, text, color, kind) {
    if (kind === 'feed') {
      ctx.fillStyle = '#fff';
      roundRect(ctx, x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = EX.line; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = color;
      roundRect(ctx, x + 1, y + h - 3, w - 2, 2, 1); ctx.fill();
      ctx.fillStyle = EX.ink2;
    } else if (kind === 'orig') {
      ctx.fillStyle = EX.lineSoft;
      roundRect(ctx, x, y, w, h, 8); ctx.fill();
      ctx.fillStyle = EX.ink;
    } else {
      ctx.fillStyle = softColor(color, 0.16);
      roundRect(ctx, x, y, w, h, 8); ctx.fill();
      ctx.fillStyle = EX.ink;
    }
    ctx.font = font(11.5, '600');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2, w - 8);
  }

  function drawChip(ctx, x, y, text, color) {
    ctx.font = font(11.5);
    var w = ctx.measureText(text).width + 22;
    var h = 21;
    ctx.fillStyle = softColor(color, 0.18);
    roundRect(ctx, x, y, w, h, 10.5); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x + 9, y + h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = EX.ink2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 16, y + h / 2 + 0.5);
    return w + 5;
  }

  function drawCard(ctx, s, x, y, w, h, art) {
    var gene = mainGene(s);
    var color = geneColor(gene);

    ctx.fillStyle = EX.card;
    roundRect(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = EX.line; ctx.lineWidth = 1; ctx.stroke();

    // 顶部柔和色块
    ctx.save();
    roundRect(ctx, x, y, w, h, 16); ctx.clip();
    var grad = ctx.createLinearGradient(0, y, 0, y + 74);
    grad.addColorStop(0, softColor(gene, 0.16));
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, 74);
    ctx.restore();

    var pad = 14;
    var ax = x + pad, ay = y + pad, as = 62;
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    roundRect(ctx, ax, ay, as, as, 14); ctx.fill();
    ctx.strokeStyle = EX.line; ctx.stroke();
    if (art) {
      var r = Math.min((as - 8) / art.width, (as - 8) / art.height);
      ctx.drawImage(art, ax + (as - art.width * r) / 2, ay + (as - art.height * r) / 2,
        art.width * r, art.height * r);
    } else {
      ctx.fillStyle = softColor(gene, 0.22);
      roundRect(ctx, ax + 6, ay + 6, as - 12, as - 12, 10); ctx.fill();
    }

    var tx = ax + as + 10;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = EX.ink3;
    ctx.font = font(11.5);
    ctx.fillText('#' + s.id + ' · 精灵ID ' + s.petID, tx, ay + 12, w - (tx - x) - pad);
    ctx.fillStyle = EX.ink;
    ctx.font = font(17, '700');
    ctx.fillText(s.名称, tx, ay + 33, w - (tx - x) - pad);

    var hasTalk = (s.talks || []).some(isPrivateTalk);
    if (hasTalk) {
      ctx.font = font(11);
      var tw = ctx.measureText('专属对话').width + 14;
      ctx.fillStyle = '#fff4e0';
      roundRect(ctx, tx, ay + 41, tw, 19, 6); ctx.fill();
      ctx.fillStyle = '#b7791f';
      ctx.textBaseline = 'middle';
      ctx.fillText('专属对话', tx + 7, ay + 51);
      ctx.textBaseline = 'alphabetic';
    }

    // 六格
    var top = ay + as + 10;
    var gap = 5;
    var slots = s.slots || [];
    if (prefs.mode === 'feed') {
      var cwP = (w - pad * 2 - 8) / 2;
      var chP = 30;
      slots.forEach(function (cell, i) {
        var col = i < 3 ? 0 : 1;
        var row = i % 3;
        var cx = x + pad + col * (cwP + 8);
        var cy = top + row * (chP + gap);
        drawCell(ctx, cx, cy, cwP, chP, cell.名称, geneColor(cell.基因), 'feed');
      });
    } else {
      var cw = (w - pad * 2 - gap * 2) / 3;
      var ch = 38;
      slots.forEach(function (cell, i) {
        var col = i % 3, row = Math.floor(i / 3);
        drawCell(ctx, x + pad + col * (cw + gap), top + row * (ch + gap), cw, ch,
          geneLabel(cell.基因),
          cell.基因, isOrigSlot(cell) ? 'orig' : 'gene');
      });
    }

    // 基因标签
    var chipY = y + h - pad - 21;
    var cx0 = x + pad;
    var genes = (s.uniqueGenes || []);
    if (!genes.length) genes = ['原始'];
    genes.forEach(function (g) {
      if (cx0 + 40 > x + w - pad) return;
      cx0 += drawChip(ctx, cx0, chipY, geneLabel(g), g);
    });
  }

  function drawRow(ctx, s, x, y, w, h, art) {
    var gene = mainGene(s);
    var color = geneColor(gene);

    ctx.fillStyle = EX.card;
    roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = EX.line; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = color;
    roundRect(ctx, x, y, 3, h, 1.5); ctx.fill();

    var pad = 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = EX.ink2;
    ctx.font = font(13, '700');
    ctx.fillText('#' + s.id, x + 12, y + h / 2 - 2);
    ctx.font = font(10.5);
    ctx.fillStyle = EX.ink3;
    ctx.fillText('精灵ID ' + s.petID, x + 12, y + h / 2 + 13);

    var ax = x + 74;
    ctx.fillStyle = softColor(gene, 0.16);
    roundRect(ctx, ax, y + (h - 48) / 2, 48, 48, 12); ctx.fill();
    if (art) {
      var ar = Math.min(42 / art.width, 42 / art.height);
      ctx.drawImage(art, ax + (48 - art.width * ar) / 2, y + (h - art.height * ar) / 2,
        art.width * ar, art.height * ar);
    } else {
      ctx.fillStyle = softColor(gene, 0.22);
      roundRect(ctx, ax + 6, y + (h - 48) / 2 + 6, 36, 36, 9); ctx.fill();
    }

    var nx = ax + 48 + 16;
    ctx.fillStyle = EX.ink;
    ctx.font = font(15, '700');
    ctx.fillText(s.名称, nx, y + h / 2 + 1);
    if ((s.talks || []).some(isPrivateTalk)) {
      ctx.font = font(10.5);
      ctx.fillStyle = '#b7791f';
      ctx.fillText('专属对话', nx, y + h / 2 + 16);
    }

    // 六格一行
    var cx = nx + 150;
    var cellsW = x + w - pad - cx;
    var gap = 6;
    var cw = (cellsW - gap * 5) / 6;
    var ch = 46;
    (s.slots || []).forEach(function (cell, i) {
      var px = cx + i * (cw + gap);
      if (prefs.mode === 'gene') {
        drawCell(ctx, px, y + (h - ch) / 2, cw, ch,
        geneLabel(cell.基因),
        cell.基因, isOrigSlot(cell) ? 'orig' : 'gene');
      } else {
        drawCell(ctx, px, y + (h - ch) / 2, cw, ch, cell.名称, geneColor(cell.基因), 'feed');
      }
    });
  }

  // 导出改为用骨架实时渲染的小画布（HTTP 下才能 fetch 素材）
  function canExportImages() {
    return Promise.resolve(location.protocol !== 'file:');
  }

  function loadArt(list) {
    return SomuaSpine.load().then(function () {
      var store = {};
      list.forEach(function (s) {
        var cv = document.createElement('canvas');
        var skel = SomuaSpine.make(s.petID, s.部件);
        if (SomuaSpine.render(cv, skel, { maxWidth: 96, maxHeight: 96, scale: 3, pad: 2 })) {
          store[s.id] = cv;
        }
      });
      return store;
    }).catch(function () { return null; });
  }

  function toast(msg) {
    var el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('is-on'); }, 8000);
  }

  function exportPng() {
    var list = filtered();
    if (!list.length) return;
    canExportImages().then(function (withArt) {
      if (!withArt) {
        toast('当前以 file:// 打开，浏览器不允许本地图片写进 canvas，已导出无立绘版。' +
          '要带立绘的截图：把「辅助启动.exe」放在本文件夹双击，用 http://127.0.0.1:8123/index.html 打开。');
      }
      (withArt ? loadArt(list) : Promise.resolve(null)).then(function (store) {
        drawExport(list, store);
      });
    });
  }

  function drawExport(list, store) {
    var isList = prefs.layout === 'list';
    var W = 1360, PAD = 32, GAP = 16, DPR = 2;
    var cols = 4;
    var cardW = (W - PAD * 2 - GAP * (cols - 1)) / cols;
    var cardH = prefs.mode === 'feed' ? 232 : 213;
    var rowH = 78;

    var headerH = 86;
    var counts = isList
    ? Math.ceil(list.length / 1)
    : Math.ceil(list.length / cols);
    var contentH = counts * (isList ? rowH : cardH) + (counts - 1) * (isList ? 8 : GAP);
    var footerH = 54;
    var H = headerH + contentH + footerH;

    var canvas = document.createElement('canvas');
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    var ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);
    ctx.fillStyle = EX.bg;
    ctx.fillRect(0, 0, W, H);

    // 头部
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = EX.ink;
    ctx.font = font(24, '700');
    ctx.fillText('苏摩配方', PAD, 50);

    // 内容
    list.forEach(function (s, i) {
      var art = store ? (store[s.id] || null) : null;
      if (isList) {
        drawRow(ctx, s, PAD, headerH + i * (rowH + 8), W - PAD * 2, rowH, art);
      } else {
        var col = i % cols, row = Math.floor(i / cols);
        drawCard(ctx, s, PAD + col * (cardW + GAP), headerH + row * (cardH + GAP), cardW, cardH, art);
      }
    });

    // 不再标注来源

    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '苏摩配方_' + (isList ? '列表' : '网格') + '_' + prefs.mode + '_' + stamp() + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    }, 'image/png');
  }
  function closeExportMenu() {
    $('#exportMenu').hidden = true;
    $('#exportBtn').setAttribute('aria-expanded', 'false');
  }
  /* ---------------------------- 标签切换 / 深链 ---------------------------- */

  function switchTab(name) {
    $$('#tabs .tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === name);
    });
    $$('.wrap > .panel').forEach(function (p) {
      p.classList.toggle('is-active', p.id === 'panel-' + name);
    });
    var lazy = {
      soul: renderSouls, ability: renderAbilities, personality: renderPersonalities,
      status: renderStatusEffects, attr: renderAttributes, diy: renderDiy
    };
    if (lazy[name]) lazy[name]();
  }

  function applyHash() {
    var h = (location.hash || '').replace('#', '');
    if (!h) return;
    if (h.indexOf('sumo-') === 0) {
      switchTab('sumo');
      openModal(Number(h.slice(5)));
    } else if (h.indexOf('tab-') === 0) {
      switchTab(h.slice(4));
    }
  }

  /* ---------------------------- 事件 ---------------------------- */

  function bind() {
    $('#search').addEventListener('input', function (e) {
      state.q = e.target.value;
      renderList();
    });

    $('#layoutSeg').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg__btn');
      if (!btn) return;
      prefs.layout = btn.getAttribute('data-layout');
      savePrefs();
      syncLayoutButtons();
      renderList();
    });

    $('#modeSeg').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg__btn');
      if (!btn) return;
      prefs.mode = btn.getAttribute('data-mode');
      savePrefs();
      syncModeButtons();
      renderList();
    });

    $('#sort').addEventListener('change', function (e) {
      prefs.sort = e.target.value;
      savePrefs();
      renderList();
    });

    $('#desc').addEventListener('change', function (e) {
      prefs.desc = e.target.checked;
      savePrefs();
      renderList();
    });

    $('#onlyTalk').addEventListener('change', function (e) {
      state.onlyTalk = e.target.checked;
      renderList();
    });

    $('#resetFilter').addEventListener('click', function () {
      state.q = '';
      state.genes = [];
      state.onlyTalk = false;
      prefs.sort = 'id';
      prefs.desc = false;
      savePrefs();
      $('#search').value = '';
      $('#onlyTalk').checked = false;
      syncSortControls();
      syncFilterUI();
      renderList();
    });

    // 导出菜单
    $('#exportBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = $('#exportMenu');
      var open = menu.hidden;
      menu.hidden = !open;
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('#exportMenu').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-export]');
      if (!btn) return;
      closeExportMenu();
      if (btn.getAttribute('data-export') === 'csv') exportCsv(); else exportPng();
    });
    document.addEventListener('click', function (e) {
      if ($('#exportMenu').hidden) return;
      if (!e.target.closest('#exportWrap')) closeExportMenu();
    });

    // 对话图鉴：搜索 / 压缩 / 展开
    $('#talkSearch').addEventListener('input', function (e) {
      talkState.q = e.target.value;
      renderTalks();
    });
    $('#talkCompress').checked = talkState.compress;
    $('#talkCompress').addEventListener('change', function (e) {
      talkState.compress = e.target.checked;
      prefs.talkCompress = e.target.checked;
      savePrefs();
      renderTalks();
    });
    $('#talkExpand').addEventListener('click', function () {
      var items = $$('#talks .acc__item');
      var anyClosed = items.some(function (it) { return !it.classList.contains('is-open'); });
      items.forEach(function (it) { it.classList.toggle('is-open', anyClosed); });
      this.textContent = anyClosed ? '全部收起' : '全部展开';
    });

    // 基因筛选折叠
    $('#filterFold .fold__head').addEventListener('click', function () {
      var open = $('#filterFold').classList.toggle('is-open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    var sbox = $('#seasonFilter');
    if (sbox) sbox.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      var k = btn.getAttribute('data-season');
      if (k === '__all') {
        state.seasons = [];
      } else {
        var i = state.seasons.indexOf(k);
        if (i > -1) state.seasons.splice(i, 1); else state.seasons.push(k);
      }
      syncFilterUI();
      renderList();
    });

    $('#geneFilter').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      var g = btn.getAttribute('data-gene');
      if (g === '__all') {
        state.genes = [];
      } else {
        var i = state.genes.indexOf(g);
        if (i > -1) state.genes.splice(i, 1); else state.genes.push(g);
      }
      syncFilterUI();
      renderList();
    });

    // 通用下拉（各图鉴的「导出」按钮）
    document.addEventListener('click', function (e) {
      var tg = e.target.closest('[data-dropdown-toggle]');
      var menus = $$('.dropdown__menu');
      if (tg) {
        var menu = tg.parentNode.querySelector('.dropdown__menu');
        var wasOpen = menu && !menu.hidden;
        menus.forEach(function (m) { m.hidden = true; });
        if (menu) menu.hidden = wasOpen;
        tg.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
        return;
      }
      if (!e.target.closest('.dropdown__menu')) {
        menus.forEach(function (m) { m.hidden = true; });
      }
    });

    // DIY 苏摩
    var diyPanel = $('#panel-diy');
    if (diyPanel) {
      diyPanel.addEventListener('change', function (e) {
        var part = e.target.getAttribute && e.target.getAttribute('data-diy-part');
        var abil = e.target.getAttribute && e.target.getAttribute('data-diy-ability');
        if (part) {
          var pid = Number(e.target.value);
          if (pid) DIYS.pieces[part] = pid; else delete DIYS.pieces[part];
          diyPaint();
        } else if (abil !== null && abil !== undefined && abil !== false) {
          var idx = Number(abil);
          var id = Number(e.target.value);
          DIYS.abilities[idx] = id || 0;
          DIYS.abilities = DIYS.abilities.slice(0, 4);
          paintAbilitySelect(e.target);
          $('#diyResult').innerHTML = diyResultHtml();
        } else if (e.target.id === 'diySoul') {
          DIYS.soul = Number(e.target.value);
          $('#diyResult').innerHTML = diyResultHtml();
        } else if (e.target.id === 'diyPersonality') {
          DIYS.personality = Number(e.target.value);
          $('#diyResult').innerHTML = diyResultHtml();
        } else if (e.target.id === 'diyAnim') {
          DIYS.anim = e.target.value;
          diyPaint();
        }
      });
      diyPanel.addEventListener('input', function (e) {
        if (e.target.id === 'diyPartSearch') {
          DIYS.q = e.target.value;
        } else if (e.target.id === 'diyAbilitySearch') {
          DIYS.abq = e.target.value;
        } else {
          return;
        }
        clearTimeout(DIYS.timer);
        DIYS.timer = setTimeout(function () { renderDiy(); }, 160);
      });

      diyPanel.addEventListener('click', function (e) {
        if (e.target.id === 'diyRandom') {
          var s = (DATA.sumo || [])[Math.floor(Math.random() * (DATA.sumo || []).length)];
          if (!s) return;
          DIYS.pieces = {};
          SomuaSpine.partMap.forEach(function (pp) {
            if (s.部件 && s.部件[pp[0]]) DIYS.pieces[pp[1]] = s.petID;
          });
          DIYS.soul = s.真魂印id || s.魂印id || DIYS.soul;
          renderDiy();
        } else if (e.target.id === 'diyFullRandom') {
          diyFullRandom();
        } else if (e.target.id === 'diyClear') {
          DIYS.pieces = {};
          diyEnsureRequired();
          renderDiy();
        }
      });
    }

    var af = $('#abilityFilter');
    if (af) af.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      var r = btn.getAttribute('data-rarity');
      if (r === '__all') {
        state.rarity = [];
      } else {
        var v = Number(r);
        var i = state.rarity.indexOf(v);
        if (i > -1) state.rarity.splice(i, 1); else state.rarity.push(v);
      }
      renderAbilities();
    });

    $$('[data-seq]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-seq') === 'export') {
          exportSeqOverride();
        } else {
          var fi = $('#seqImportFile');
          if (fi) fi.click();
        }
        closeExportMenu();
      });
    });

    // DIY 导出 / 导入
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-diy-export]');
      if (!btn) return;
      var kind = btn.getAttribute('data-diy-export');
      if (kind === 'png') exportDiyPng();
      else if (kind === 'apng') exportDiyApng();
      else if (kind === 'webm') exportDiyWebm();
      else if (kind === 'json') exportDiyJson();
      else {
        var fi = $('#diyImportFile');
        if (fi) fi.click();
      }
      $$('.dropdown__menu').forEach(function (m) { m.hidden = true; });
      $$('[data-dropdown-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    });

    var diyFile = $('#diyImportFile');
    if (diyFile) diyFile.addEventListener('change', function () {
      if (diyFile.files && diyFile.files[0]) importDiyJson(diyFile.files[0]);
      diyFile.value = '';
    });

    var seqFile = $('#seqImportFile');
    if (seqFile) seqFile.addEventListener('change', function () {
      if (seqFile.files && seqFile.files[0]) importSeqOverride(seqFile.files[0]);
      seqFile.value = '';
    });

    document.addEventListener('click', function (e) {
      var pbtn = e.target.closest('[data-panel-export]');
      if (!pbtn) return;
      exportPanel(pbtn.getAttribute('data-panel-export'), pbtn.getAttribute('data-fmt'));
      $$('.dropdown__menu').forEach(function (m) { m.hidden = true; });
      $$('[data-dropdown-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    });

    $('#tabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (tab) switchTab(tab.getAttribute('data-tab'));
    });

    // 网格 / 列表共用同一套交互
    ['#cards', '#rows'].forEach(function (sel) {
      var box = $(sel);
      box.addEventListener('click', function (e) {
        var item = e.target.closest('[data-id]');
        if (item) openModal(Number(item.getAttribute('data-id')));
      });
      box.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var item = e.target.closest('[data-id]');
        if (item) { e.preventDefault(); openModal(Number(item.getAttribute('data-id'))); }
      });
    });

    // 行状折叠：基因索引 / 对话图鉴
    ['#genes', '#talks'].forEach(function (sel) {
      $(sel).addEventListener('click', function (e) {
        var jump = e.target.closest('[data-jump]');
        if (jump) { openModal(Number(jump.getAttribute('data-jump'))); return; }
        var head = e.target.closest('.acc__head');
        if (!head) return;
        var open = head.parentElement.classList.toggle('is-open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    $('#modal').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#modal').hidden) closeModal();
        closeExportMenu();
      }
      if (e.key === '/' && document.activeElement !== $('#search')) {
        e.preventDefault();
        switchTab('sumo');
        $('#search').focus();
      }
    });
  }

  /* ---------------------------- 基因序列手动覆盖（localStorage） ---------------------------- */

  var SEQ_KEY = 'sumo.seqOverride.v1';
  var SEQ_OVERRIDE = {};
  var SEQ_ORDER = ['宝宝', '可爱', '正义', '邪恶', '庆典', '王者',
    '黑色', '白色', '蓝色', '绿色', '黄色', '紫色', '红色'];

  function loadSeqOverride() {
    try {
      var raw = localStorage.getItem(SEQ_KEY);
      SEQ_OVERRIDE = raw ? JSON.parse(raw) || {} : {};
    } catch (e) { SEQ_OVERRIDE = {}; }
  }

  function saveSeqOverride() {
    try {
      localStorage.setItem(SEQ_KEY, JSON.stringify(SEQ_OVERRIDE));
    } catch (e) { /* 忽略（隐私模式等） */ }
  }

  function geneItemOf(name) {
    var hit = (DATA.genes || []).filter(function (g) { return g.基因 === name; })[0];
    return hit || null;
  }

  // 把 6 个基因名变成和旧版一致的 slots 结构，让卡片/配方格直接渲染
  function buildSlotsFromSeq(names) {
    return (names || []).map(function (name, i) {
      var empty = !name || name === '原始';
      var it = empty ? null : geneItemOf(name);
      return {
        slot: i + 1,
        id: it ? it.id : 0,
       名称: empty ? '返祖药丸' : (it && it.道具 ? it.道具 : ''),
        基因: empty ? '宝宝' : name,
        占位: empty
      };
    });
  }

  function applyOneOverride(s, names) {
    if (!names || !names.length) return;
    s.基因序列 = names.map(function (n) {
      var g = (!n || n === '原始') ? null : geneItemOf(n);
      return { 基因: (!n || n === '原始') ? '原始' : n, 基因id: g ? g.id : 0 };
    });
    s.有序列 = true;
    s.手动序列 = true;
    s.slots = buildSlotsFromSeq(names);
    s.genes = names.filter(function (n) { return n && n !== '原始'; });
    s.uniqueGenes = s.genes.filter(function (n, i) { return s.genes.indexOf(n) === i; });
  }

  function applySeqOverrides() {
    (DATA.sumo || []).forEach(function (s) {
      var names = SEQ_OVERRIDE[s.id];
      if (names) applyOneOverride(s, names);
    });
  }

  // 编辑面板：6 个格位 + 悬浮选基因（点格位 → 弹出基因面板）
  function seqEditorHtml(s) {
    var cur = (s.基因序列 || []).map(function (x) {
      var n = x.基因 || '宝宝';
      return (n === '原始' || n === '突变') ? '宝宝' : n;
    });
    var cells = '';
    for (var i = 0; i < 6; i++) {
      var v = cur[i] || '原始';
      var c = geneColor(v);
      cells += '<button class="seqpick" type="button" data-seqslot="' + i + '" ' +
        'style="--c:' + c + ';--c-soft:' + hexToRgba(c, ALPHA_CELL) + '">' +
        '<b>位 ' + (i + 1) + '</b><span>' + esc(geneLabel(v)) + '</span></button>';
    }
    return '<div class="seqedit" data-seqedit="' + s.id + '" data-cur="' + esc(cur.join('|')) + '">' +
      '<div class="seqedit__head">手动设置基因序列<span class="dim">（保存在本机浏览器，仅影响本站显示）</span></div>' +
      '<div class="seqedit__cells">' + cells + '</div>' +
      '<div class="seqpickbar" hidden>' +
        '<div class="seqpickbar__head">选择基因</div>' +
        '<div class="seqpickbar__list">' +
          SEQ_ORDER.map(function (n) {
            var cc = geneColor(n);
            return '<button class="pickchip" type="button" data-pick="' + n + '" ' +
              'style="--c:' + cc + ';--c-soft:' + hexToRgba(cc, ALPHA_CELL) + '">' +
              geneLabel(n) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="seqedit__foot">' +
        '<button class="btn btn--accent" type="button" data-seqsave="' + s.id + '">保存</button>' +
        '<button class="btn btn--ghost" type="button" data-seqclear="' + s.id + '">清除手动数据</button>' +
        '<button class="btn btn--ghost" type="button" data-seqcancel="1">取消</button>' +
      '</div>' +
    '</div>';
  }

  // 当前编辑中的 6 个值
  function seqEditorValues() {
    var wrap = document.querySelector('#seqEditorBox .seqedit');
    if (!wrap) return null;
    return (wrap.getAttribute('data-cur') || '').split('|');
  }

  function setSeqEditorSlot(idx, gene) {
    var wrap = document.querySelector('#seqEditorBox .seqedit');
    if (!wrap) return;
    var vals = seqEditorValues();
    vals[idx] = gene;
    wrap.setAttribute('data-cur', vals.join('|'));
    var btn = wrap.querySelector('[data-seqslot="' + idx + '"]');
    if (btn) {
      var c = geneColor(gene);
      btn.style.setProperty('--c', c);
      btn.style.setProperty('--c-soft', hexToRgba(c, ALPHA_CELL));
      btn.querySelector('span').textContent = geneLabel(gene);
    }
  }

  function togglePickBar(show, idx) {
    var wrap = document.querySelector('#seqEditorBox .seqedit');
    if (!wrap) return;
    var bar = wrap.querySelector('.seqpickbar');
    if (!bar) return;
    if (show) {
      wrap.setAttribute('data-slot', String(idx));
      bar.hidden = false;
      bar.querySelector('.seqpickbar__head').textContent = '选择位 ' + (idx + 1) + ' 的基因';
    } else {
      bar.hidden = true;
    }
  }

  function openSeqEditor(s) {
    var box = $('#seqEditorBox');
    if (!box) return;
    box.innerHTML = seqEditorHtml(s);
    box.hidden = false;
  }

  function closeSeqEditor() {
    var box = $('#seqEditorBox');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }

  // 自定义配方（手动序列）导出 / 导入
  function exportSeqOverride() {
    var keys = Object.keys(SEQ_OVERRIDE);
    if (!keys.length) { toast('还没有任何手动序列'); return; }
    var data = {
      _说明: '苏摩自定义配方（手动基因序列）。导入后写入浏览器 localStorage。',
      _格式: { '<苏摩 id>': ['位1', '位2', '位3', '位4', '位5', '位6'] },
      _生成时间: new Date().toLocaleString('zh-CN'),
      序列: {}
    };
    keys.forEach(function (id) {
      var s = byId(Number(id));
      data.序列[id] = { 名称: s ? s.名称 : '', 序列: SEQ_OVERRIDE[id] };
    });
    download('苏摩自定义配方_' + stamp() + '.json',
      JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
  }

  function importSeqOverride(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var raw;
      try {
        raw = JSON.parse(String(reader.result));
      } catch (err) {
        toast('JSON 解析失败：' + err.message);
        return;
      }
      var src = raw.序列 || raw;
      var n = 0;
      Object.keys(src).forEach(function (key) {
        var id = Number(key);
        if (!id) return;
        var item = src[key];
        var names = Array.isArray(item) ? item : (item && item.序列);
        if (!Array.isArray(names) || names.length !== 6) return;
        SEQ_OVERRIDE[id] = names;
        var s = byId(id);
        if (s) applyOneOverride(s, names);
        n++;
      });
      saveSeqOverride();
      computeGeneUsage();
      renderFilters();
      syncFilterUI();
      renderList();
      renderGenes();
      renderHeroStats();
      toast('已导入 ' + n + ' 只自定义配方');
    };
    reader.readAsText(file);
  }

  function refreshAfterSeqChange(s) {
    renderList();
    renderGenes();
    renderHeroStats();
    if (s) renderModalBody(s);
  }

  function bindSeqEditor() {
    document.addEventListener('click', function (e) {
      var save = e.target.closest('[data-seqsave]');
      if (save) {
        var id = Number(save.getAttribute('data-seqsave'));
        var s = byId(id);
        var wrap = save.closest('.seqedit');
        var names = (wrap.getAttribute('data-cur') || '').split('|');
        if (names.length < 6) names = ['原始', '原始', '原始', '原始', '原始', '原始'];
        SEQ_OVERRIDE[id] = names;
        saveSeqOverride();
        applyOneOverride(s, names);
        closeSeqEditor();
        computeGeneUsage();
        renderFilters();
        syncFilterUI();
        refreshAfterSeqChange(s);
        return;
      }
      var clr = e.target.closest('[data-seqclear]');
      if (clr) {
        var cid = Number(clr.getAttribute('data-seqclear'));
        delete SEQ_OVERRIDE[cid];
        saveSeqOverride();
        closeSeqEditor();
        // 回到数据文件里的原始状态
        location.reload();
        return;
      }
      if (e.target.closest('[data-seqcancel]')) { closeSeqEditor(); return; }
      var pick = e.target.closest('[data-pick]');
      if (pick) {
        var wrap2 = document.querySelector('#seqEditorBox .seqedit');
        var slot = wrap2 ? Number(wrap2.getAttribute('data-slot')) : 0;
        setSeqEditorSlot(slot, pick.getAttribute('data-pick'));
        togglePickBar(false);
        return;
      }
      var slotBtn = e.target.closest('#seqEditorBox [data-seqslot]');
      if (slotBtn) {
        togglePickBar(true, Number(slotBtn.getAttribute('data-seqslot')));
        return;
      }
      var edit = e.target.closest('[data-seqedit-btn]');
      if (edit) {
        var es = byId(Number(edit.getAttribute('data-seqedit-btn')));
        if (es) openSeqEditor(es);
      }
    });
  }

  // spine 素材就绪后，若 DIY 面板已渲染过，补画一次（深链直达 #tab-diy 时也能出图）
  if (window.SomuaSpine && SomuaSpine.load) {
    SomuaSpine.load().then(function () {
      if (DIYS.inited && $('#diyCanvas')) { try { diyPaint(); } catch (e) { /* 忽略 */ } }
    }).catch(function () { /* 素材缺失时静默 */ });
  }

  /* ---------------------------- 启动 ---------------------------- */

  loadPrefs();
  loadSeqOverride();
  applySeqOverrides();
  computeGeneUsage();
  renderHeroStats();
  renderFilters();
  syncFilterUI();
  syncLayoutButtons();
  syncModeButtons();
  syncSortControls();
  renderList();
  renderGenes();
  renderAbilityFilter();
  renderTalks();
  bind();
  bindSeqEditor();
  applyHash();
  window.addEventListener('hashchange', applyHash);
})();
