/* -*- coding: utf-8 -*- */
/* 苏摩立绘：浏览器端实时解析 spine 4.0（共享骨架 + 70 页图集）
 *
 * 素材由 tools/somua_spine_assets.py 解包到 data/spine/：
 *   somua.skel / somua.atlas / pages/*.png / assets.json
 * 运行时（spine-canvas.min.js）属于前端 JS：js/vendor/
 *
 * 对外：
 *   SomuaSpine.load()                     → Promise（runtime + skel + atlas + 贴图）
 *   SomuaSpine.make(petID, parts)         → Skeleton（default + <petID>/<部件> 合并皮肤）
 *   SomuaSpine.combine(pieces)            → Skeleton（跨苏摩自由拼部件）
 *   SomuaSpine.partsOf(petID)             → 该苏摩实际拥有的部件后缀数组
 *   SomuaSpine.render(canvas, skel, opt)  → 画到 canvas（自适应尺寸，透明背景）
 *   SomuaSpine.play(canvas, skel, name)   → 播放动画，返回 stop()
 *   SomuaSpine.anims                      → 动画名列表
 */
(function () {
  'use strict';

  var BASE = 'data/spine/';
  var PART_MAP = [['背', 'back'], ['身', 'body'], ['耳', 'ear'], ['表情', 'expression'],
                  ['头', 'hair'], ['手', 'hand'], ['环绕', 'surrounding'],
                  ['尾', 'tail'], ['上衣', 'topwear']];

  var state = { loaded: null, data: null, atlas: null, meta: null, textures: {} };
  var skinCache = {};

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('加载失败 ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('贴图加载失败 ' + src)); };
      img.src = src;
    });
  }

  function load() {
    if (state.loaded) return state.loaded;
    state.loaded = (async function () {
      var metaResp = await fetch(BASE + 'assets.json');
      if (!metaResp.ok) throw new Error('缺少 data/spine/assets.json（先跑一键更新或 tools/somua_spine_assets.py）');
      var meta = await metaResp.json();
      state.meta = meta;

      await loadScript(meta.runtime || 'js/vendor/spine-canvas.min.js');
      var spine = window.spine;
      if (!spine) throw new Error('spine 运行时未就绪');

      var [atlasText, skelBuf] = await Promise.all([
        fetch(BASE + meta.atlas).then(function (r) { return r.text(); }),
        fetch(BASE + meta.skel).then(function (r) { return r.arrayBuffer(); })
      ]);

      var imgs = await Promise.all(meta.pages.map(function (n) {
        return loadImage(BASE + 'pages/' + n).then(function (img) {
          state.textures[n] = new spine.CanvasTexture(img);
        });
      }));
      void imgs;

      var atlas = new spine.TextureAtlas(atlasText);
      atlas.setTextures({
        get: function (name) {
          return state.textures[name] || state.textures[name + '.png'] ||
            state.textures[Object.keys(state.textures)[0]];
        }
      });
      state.atlas = atlas;
      var loader = new spine.AtlasAttachmentLoader(atlas);
      state.data = new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(skelBuf));
      return state.data;
    })();
    return state.loaded;
  }

  function skinFor(petID, parts) {
    var key = petID + '|' + PART_MAP.map(function (p) { return (parts || {})[p[0]] ? 1 : 0; }).join('');
    if (skinCache[key]) return skinCache[key];
    var spine = window.spine;
    var combo = new spine.Skin('combo_' + petID);
    if (state.data.defaultSkin) combo.addSkin(state.data.defaultSkin);
    PART_MAP.forEach(function (p) {
      if (!(parts || {})[p[0]]) return;
      var sk = state.data.findSkin(petID + '/' + p[1]);
      if (sk) combo.addSkin(sk);
    });
    skinCache[key] = combo;
    return combo;
  }

  // 自由拼接：pieces = [{petID, part}]（part 用 spine 后缀：back/body/ear/expression/hair/hand/surrounding/tail/topwear）
  function skinForPieces(pieces) {
    var key = pieces.map(function (p) { return p.petID + '/' + p.part; }).join('|');
    if (skinCache[key]) return skinCache[key];
    var spine = window.spine;
    var combo = new spine.Skin('combo_diy');
    if (state.data.defaultSkin) combo.addSkin(state.data.defaultSkin);
    pieces.forEach(function (p) {
      var sk = state.data.findSkin(p.petID + '/' + p.part);
      if (sk) combo.addSkin(sk);
    });
    skinCache[key] = combo;
    return combo;
  }

  function combine(pieces) {
    var spine = window.spine;
    var skel = new spine.Skeleton(state.data);
    skel.setSkin(skinForPieces(pieces));
    skel.setToSetupPose();
    skel.updateWorldTransform();
    return skel;
  }

  // 某个苏摩实际拥有的部件（用于 DIY 里的可选项）
  function partsOf(petID) {
    var out = [];
    PART_MAP.forEach(function (p) {
      if (state.data.findSkin(petID + '/' + p[1])) out.push(p[1]);
    });
    return out;
  }

  function make(petID, parts) {
    var spine = window.spine;
    var skel = new spine.Skeleton(state.data);
    skel.setSkin(skinFor(petID, parts));
    skel.setToSetupPose();
    skel.updateWorldTransform();
    return skel;
  }

  function poseAt(skel, animName, t) {
    skel.setToSetupPose();
    if (animName) {
      var st = new window.spine.AnimationState(new window.spine.AnimationStateData(skel.data));
      st.setAnimation(0, animName, false);
      st.apply(skel);
      if (t > 0) { st.update(t); st.apply(skel); }
    }
    skel.updateWorldTransform();
  }

  function render(canvas, skel, opt) {
    opt = opt || {};
    var spine = window.spine;
    var scale = opt.scale || 1;
    var pad = opt.pad === undefined ? 2 : opt.pad;
    var anim = opt.anim || null;
    var time = opt.time || 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2) * (opt.supersample || 4);

    poseAt(skel, anim, time);

    var bounds = new spine.Vector2(), size = new spine.Vector2();
    skel.getBounds(bounds, size);
    if (!(size.x > 0 && size.y > 0)) return false;

    var fitW = opt.maxWidth || 0;
    var fitH = opt.maxHeight || 0;
    var s = scale;
    if (fitW || fitH) {
      var sx = fitW ? fitW / size.x : Infinity;
      var sy = fitH ? fitH / size.y : Infinity;
      s = Math.min(scale, sx, sy);
    }

    var cssW = Math.max(1, Math.round(size.x * s) + pad * 2);
    var cssH = Math.max(1, Math.round(size.y * s) + pad * 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(pad, pad + size.y * s);
    ctx.scale(s, -s);
    ctx.translate(-bounds.x, -bounds.y);
    var renderer = new spine.SkeletonRenderer(ctx);
    // 图集是 pma:true（预乘 alpha），按预乘绘制
    renderer.premultipliedAlpha = true;
    // spine-canvas 的网格只能逐三角形绘制（关掉会整片消失）；
    // 共享边重叠半像素导致双次 alpha 混合 → 细三角接缝，用超采样 + 缩放平均削弱
    renderer.triangleRendering = true;
    renderer.draw(skel);
    ctx.restore();
    return true;
  }

  /* 播放动画：一帧一帧按真实时长推进 */
  function play(canvas, skel, animName) {
    var spine = window.spine;
    var anim = skel.data.findAnimation(animName);
    if (!anim) return function () {};
    var duration = anim.duration || 1;
    var start = performance.now();
    var running = true;

    function frame(now) {
      if (!running) return;
      var t = ((now - start) / 1000) % duration;
      var opt = canvas.__spineOpt || { maxWidth: 400, maxHeight: 392, scale: 3, pad: 2 };
      render(canvas, skel, Object.assign({}, opt, { anim: animName, time: t }));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return function stop() { running = false; };
  }

  window.SomuaSpine = {
    load: load,
    make: make,
    combine: combine,
    partsOf: partsOf,
    render: render,
    play: play,
    partMap: PART_MAP,
    get meta() { return state.meta; },
    get anims() { return (state.meta && state.meta.动画) || []; }
  };
})();
