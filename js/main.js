(function () {
  'use strict';

  /* =========================================================
     可调参数
     ========================================================= */
  var CONFIG = {
    themeKey: 'dive-theme',
    water: {
      maxRings: 200,
      bubbleCount: 70,
      moveThrottle: 46,
      smooth: 0.09,
      diveBoost: 9
    },
    dive: {
      scrollFactor: 0.62,
      shiftVH: 112,
      scale: 0.26,
      fadeSpeed: 1.3,
      ease: 1.8,
      darken: 0.95
    },
    cards: {
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px'
    },
    ui: {
      navScrolledAt: 20,
      toTopAt: 0.9
    },
    scroll: {
      navOffset: 24,     // 滚动目标在导航下方留的呼吸空间
      minDuration: 420,  // 平滑滚动最短时长（ms）
      maxDuration: 1100, // 平滑滚动最长时长
      speedFactor: 0.5   // 距离 → 时长 的换算系数
    }
  };

  var TAU = Math.PI * 2;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) {
    return Array.prototype.slice.call((c || document).querySelectorAll(s));
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function rafThrottle(fn) {
    var ticking = false;
    return function () {
      if (ticking) return;
      ticking = true;
      var self = this;
      var args = arguments;
      requestAnimationFrame(function () {
        fn.apply(self, args);
        ticking = false;
      });
    };
  }

  var diveTarget = 0;
  var diveSmooth = 0;

  /* =========================================================
     1. 主题
     ========================================================= */
  function initTheme() {
    var root = document.documentElement;
    var btn = $('#themeBtn');
    var metaTheme = $('#metaTheme');
    var liveRegion = $('#liveRegion');
    var mq = window.matchMedia('(prefers-color-scheme: light)');

    function sync(announce) {
      var light = isLight();
      if (btn) {
        btn.setAttribute('aria-pressed', String(light));
        btn.setAttribute('aria-label', light ? '切换到深色主题' : '切换到浅色主题');
      }
      if (metaTheme) {
        metaTheme.setAttribute('content', light ? '#eef6fc' : '#02050a');
      }
      if (announce && liveRegion) {
        liveRegion.textContent = light ? '已切换到浅色主题' : '已切换到深色主题';
      }
    }

    if (btn) {
      btn.addEventListener('click', function () {
        var next = isLight() ? 'dark' : 'light';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem(CONFIG.themeKey, next); } catch (e) {}
        sync(true);
      });
    }

    function onSystemChange(e) {
      var stored = null;
      try { stored = localStorage.getItem(CONFIG.themeKey); } catch (err) {}
      if (stored) return;
      root.setAttribute('data-theme', e.matches ? 'light' : 'dark');
      sync(false);
    }
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);

    sync(false);
  }

  /* =========================================================
     2. 移动端抽屉菜单
     ========================================================= */
  function initNavMenu() {
    var btn = $('#menuBtn');
    var menu = $('#mobileMenu');
    var nav = $('#nav');
    if (!btn || !menu || !nav) return;

    function setOpen(open) {
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    }

    btn.addEventListener('click', function () {
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });

    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        btn.focus();
      }
    });

    document.addEventListener('click', function (e) {
      if (btn.getAttribute('aria-expanded') !== 'true') return;
      if (e.target.closest('#nav')) return;
      setOpen(false);
    });
  }

  /* =========================================================
     3. 水面场景
     ========================================================= */
  function initWaterScene() {
    var rCanvas = $('#ripple');
    var bCanvas = $('#bubbles');
    if (!rCanvas || !bCanvas) return;

    var rctx = rCanvas.getContext('2d');
    var bctx = bCanvas.getContext('2d');
    var C = CONFIG.water;

    var W = 0, H = 0, DPR = 1;
    var rings = [];
    var bubbles = [];

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;

      [rCanvas, bCanvas].forEach(function (c) {
        c.width = Math.floor(W * DPR);
        c.height = Math.floor(H * DPR);
        c.style.width = W + 'px';
        c.style.height = H + 'px';
      });
      rctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      if (reduceMotion) drawStatic();
    }

    function spawnRipple(x, y, opts) {
      opts = opts || {};
      if (rings.length > C.maxRings) rings.shift();
      rings.push({
        x: x, y: y,
        r: opts.r0 !== undefined ? opts.r0 : 0,
        maxR: opts.maxR || rand(110, 240),
        life: 0,
        speed: opts.speed || rand(1.9, 3.1),
        width: opts.width || rand(1.0, 2.4),
        alpha: opts.alpha || rand(0.32, 0.68),
        hue: opts.hue !== undefined ? opts.hue : rand(184, 232),
        wobble: rand(0, TAU)
      });
    }

    function burst(x, y) {
      spawnRipple(x, y, {
        maxR: rand(230, 380), speed: rand(2.4, 3.4),
        width: rand(1.8, 3.0), alpha: rand(0.55, 0.85), hue: rand(186, 214)
      });
      for (var i = 0; i < 3; i++) {
        var a = (TAU / 3) * i + Math.random() * 0.6;
        var d = rand(26, 62);
        spawnRipple(x + Math.cos(a) * d, y + Math.sin(a) * d, {
          maxR: rand(110, 200), speed: rand(1.6, 2.6),
          width: rand(0.9, 1.8), alpha: rand(0.3, 0.55), hue: rand(190, 235)
        });
      }
    }

    var lastMove = 0;
    var lastX = null, lastY = null;

    function onMove(x, y) {
      var now = performance.now();
      if (now - lastMove < C.moveThrottle) return;
      lastMove = now;

      var spd = 0;
      if (lastX !== null) spd = Math.hypot(x - lastX, y - lastY);
      lastX = x; lastY = y;

      var k = Math.min(spd / 60, 1);
      spawnRipple(x, y, {
        maxR: rand(46, 84) * (1 - 0.45 * k),
        speed: rand(1.4, 2.4),
        width: rand(0.8, 1.6),
        alpha: rand(0.16, 0.34) * (1 - 0.5 * k),
        hue: rand(190, 225)
      });
    }

    function makeBubble(anywhere) {
      return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : H + Math.random() * 120,
        r: 1 + Math.random() * 2.8,
        vy: 0.5 + Math.random() * 1.3,
        vx: (Math.random() - 0.5) * 0.4,
        a: 0.12 + Math.random() * 0.4,
        wob: Math.random() * TAU,
        ws: 0.012 + Math.random() * 0.03
      };
    }

    function initBubbles() {
      bubbles.length = 0;
      for (var i = 0; i < C.bubbleCount; i++) bubbles.push(makeBubble(true));
    }

    function drawStatic() {
      bctx.clearRect(0, 0, W, H);
      rctx.clearRect(0, 0, W, H);

      var light = isLight();
      var ringL = light ? 42 : 72;

      [0.28, 0.5, 0.72].forEach(function (k, idx) {
        rctx.beginPath();
        rctx.arc(W / 2, H / 2, Math.min(W, H) * k, 0, TAU);
        rctx.lineWidth = 1.4 - idx * 0.3;
        rctx.strokeStyle = 'hsla(' + (200 + idx * 12) + ', 80%, ' + ringL + '%, 0.22)';
        rctx.stroke();
      });
    }

    function drawBubbles(light) {
      var fill = light ? '20, 120, 180' : '140, 220, 255';
      var hi = light ? '255, 255, 255' : '235, 250, 255';
      var boost = 1 + diveSmooth * C.diveBoost;

      bctx.clearRect(0, 0, W, H);

      for (var i = 0; i < bubbles.length; i++) {
        var b = bubbles[i];
        b.y -= b.vy * boost;
        b.x += Math.sin(b.wob) * (0.4 + diveSmooth * 1.6) + b.vx;
        b.wob += b.ws * (1 + diveSmooth * 4);

        if (b.y < -30 || b.x < -40 || b.x > W + 40) {
          bubbles[i] = makeBubble(false);
          continue;
        }

        var a = b.a * (0.35 + diveSmooth * 0.85);
        if (a <= 0.005) continue;

        bctx.beginPath();
        bctx.arc(b.x, b.y, b.r, 0, TAU);
        bctx.fillStyle = 'rgba(' + fill + ', ' + a.toFixed(3) + ')';
        bctx.fill();

        bctx.beginPath();
        bctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.32, b.r * 0.34, 0, TAU);
        bctx.fillStyle = 'rgba(' + hi + ', ' + Math.min(1, a * 1.2).toFixed(3) + ')';
        bctx.fill();
      }

      if (diveSmooth > 0.02) {
        var n = Math.round(26 * diveSmooth);
        bctx.lineCap = 'round';
        for (var j = 0; j < n; j++) {
          var x = Math.random() * W;
          var len = 40 + Math.random() * 160 * diveSmooth;
          var y = Math.random() * H;
          bctx.beginPath();
          bctx.moveTo(x, y);
          bctx.lineTo(x, y - len);
          bctx.lineWidth = 1 + Math.random() * 1.4;
          bctx.strokeStyle = light
            ? 'rgba(20, 110, 170, ' + (0.04 + Math.random() * 0.1 * diveSmooth).toFixed(3) + ')'
            : 'rgba(150, 225, 255, ' + (0.05 + Math.random() * 0.12 * diveSmooth).toFixed(3) + ')';
          bctx.stroke();
        }
      }
    }

    function drawRings(light) {
      var ringL = light ? 42 : 72;
      var ringHiL = light ? 52 : 84;

      rctx.clearRect(0, 0, W, H);

      for (var i = rings.length - 1; i >= 0; i--) {
        var rg = rings[i];
        rg.r += rg.speed;
        rg.life += 1;

        var t = rg.r / rg.maxR;
        if (t >= 1) { rings.splice(i, 1); continue; }

        var fade = Math.pow(1 - t, 1.7);
        var alpha = rg.alpha * fade * (1 - diveSmooth * 0.85) * (light ? 1.15 : 1);
        if (alpha < 0.004) { rings.splice(i, 1); continue; }

        var wob = 1 + Math.sin(rg.life * 0.05 + rg.wobble) * 0.012 * t;

        rctx.beginPath();
        rctx.arc(rg.x, rg.y, rg.r * wob, 0, TAU);
        rctx.lineWidth = rg.width * (1 - 0.45 * t);
        rctx.strokeStyle = 'hsla(' + rg.hue + ', 85%, ' + ringL + '%, ' + alpha.toFixed(4) + ')';
        rctx.stroke();

        if (rg.maxR > 120) {
          rctx.beginPath();
          rctx.arc(rg.x, rg.y, rg.r * 0.72, 0, TAU);
          rctx.lineWidth = rg.width * 0.5;
          rctx.strokeStyle = 'hsla(' + (rg.hue + 10) + ', 85%, ' + ringHiL + '%, ' +
                             (alpha * 0.32).toFixed(4) + ')';
          rctx.stroke();
        }
      }
    }

    function frame() {
      diveSmooth += (diveTarget - diveSmooth) * C.smooth;
      var light = isLight();
      drawBubbles(light);
      drawRings(light);
      requestAnimationFrame(frame);
    }

    window.addEventListener('mousemove', function (e) {
      onMove(e.clientX, e.clientY);
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY);
    }, { passive: true });

    window.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.card, .nav, .to-top, .mobile-menu, .skip-link, .post-view, .archive')) return;
      burst(e.clientX, e.clientY);
    });

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () {
      setTimeout(resize, 120);
    });

    function startAmbient() {
      function loop() {
        if (diveSmooth <= 0.4) {
          spawnRipple(rand(W * 0.18, W * 0.82), rand(H * 0.22, H * 0.78), {
            maxR: rand(160, 320), speed: rand(1.3, 2.1),
            width: rand(1.0, 2.0), alpha: rand(0.18, 0.36), hue: rand(188, 226)
          });
        }
        setTimeout(loop, rand(900, 2200));
      }
      setTimeout(loop, 500);
    }

    resize();
    initBubbles();

    if (reduceMotion) {
      drawStatic();
    } else {
      requestAnimationFrame(frame);
      startAmbient();
    }
  }

  /* =========================================================
     4. 深潜 + 滚动 UI
     ========================================================= */
  function initScroll() {
    var hero = $('#hero');
    var diveDark = $('#diveDark');
    var nav = $('#nav');
    var progressFill = $('#progressFill');
    var toTop = $('#toTop');

    var D = CONFIG.dive;
    var U = CONFIG.ui;

    function update() {
      var vh = window.innerHeight;
      var y = window.scrollY || window.pageYOffset || 0;

      var p = Math.min(y / (vh * D.scrollFactor), 1);
      diveTarget = p;

      if (reduceMotion) {
        if (hero) {
          hero.style.opacity = '0';
          hero.style.transform = 'translate3d(0, 120vh, 0)';
        }
        if (diveDark) diveDark.style.opacity = '0.9';
      } else {
        var e = Math.pow(p, D.ease);
        if (hero) {
          var ty = e * D.shiftVH;
          var scale = 1 + e * D.scale;
          hero.style.transform =
            'translate3d(0, ' + ty.toFixed(2) + 'vh, 0) scale(' + scale.toFixed(3) + ')';
          hero.style.opacity = Math.max(0, 1 - p * D.fadeSpeed).toFixed(3);
        }
        if (diveDark) diveDark.style.opacity = (e * D.darken).toFixed(3);
      }

      if (nav) nav.classList.toggle('scrolled', y > U.navScrolledAt);

      updateProgress();

      if (toTop) toTop.classList.toggle('show', y > vh * U.toTopAt);
    }

    function updateProgress() {
      if (!progressFill) return;
      var view = $('#postView');
      var ratio = 0;

      if (view && !view.hidden) {
        var max = view.scrollHeight - view.clientHeight;
        ratio = max > 0 ? Math.min(view.scrollTop / max, 1) : 0;
      } else {
        var vh = window.innerHeight;
        var docH = document.documentElement.scrollHeight - vh;
        ratio = docH > 0 ? Math.min(window.scrollY / docH, 1) : 0;
      }
      progressFill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    }

    if (toTop) {
      toTop.addEventListener('click', function () {
        var view = $('#postView');
        if (view && !view.hidden) {
          view.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      });
    }

    var onScroll = rafThrottle(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    var view = $('#postView');
    if (view) view.addEventListener('scroll', rafThrottle(updateProgress), { passive: true });

    update();
  }

  /* =========================================================
     5. 文章：拉列表 / 归档 / 渲染 / 路由
     ========================================================= */
  function initPosts() {
    var grid = $('#grid');
    var archiveList = $('#archiveList');
    var postView = $('#postView');
    var postContent = $('#postContent');
    if (!grid || !postView || !postContent) return;

    var state = {
      posts: [],
      activeSlug: null,
      savedScrollY: 0,
      loading: false
    };
    var cardObserver = null;

    /* ---------- 骨架 ---------- */
    function renderSkeletons() {
      var html = '';
      for (var i = 0; i < 6; i++) {
        html +=
          '<div class="card skeleton" aria-hidden="true">' +
            '<div class="sk sk-tag"></div>' +
            '<div class="sk sk-title"></div>' +
            '<div class="sk sk-title short"></div>' +
            '<div class="sk sk-text"></div>' +
            '<div class="sk sk-text"></div>' +
            '<div class="sk sk-text"></div>' +
          '</div>';
      }
      grid.innerHTML = html;

      if (archiveList) {
        archiveList.innerHTML =
          '<div class="archive-skeleton" aria-hidden="true">' +
            '<div class="sk sk-text"></div>' +
            '<div class="sk sk-text"></div>' +
            '<div class="sk sk-text"></div>' +
          '</div>';
      }
    }

    function renderEmpty(message, withCode) {
      grid.innerHTML =
        '<div class="empty">' +
          (withCode
            ? '还没有文章。<br>在 <code>posts/</code> 目录下放一个 <code>.md</code> 文件，刷新页面即可看到。'
            : escapeHtml(message)) +
        '</div>';
      if (archiveList) archiveList.innerHTML = '';
    }

    /* ---------- 卡片 ---------- */
    function renderCards(posts) {
      if (!posts || !posts.length) {
        renderEmpty('', true);
        return;
      }

      grid.innerHTML = posts.map(function (p, idx) {
        var firstTag = (p.tags && p.tags[0]) || '随笔';
        var href = '#/post/' + encodeURIComponent(p.slug);
        return (
          '<article class="card" style="--i:' + idx + '" data-slug="' + escapeHtml(p.slug) + '">' +
            '<span class="tag">' + escapeHtml(firstTag) + '</span>' +
            '<h3>' + escapeHtml(p.title) + '</h3>' +
            '<p>' + escapeHtml(p.excerpt) + '</p>' +
            '<div class="meta">' +
              '<span>' + escapeHtml(p.date) + '</span>' +
              '<span class="dot"></span>' +
              '<span>' + p.readingTime + ' 分钟</span>' +
              '<a class="read-more" href="' + href + '">阅读 <span>→</span></a>' +
            '</div>' +
          '</article>'
        );
      }).join('');

      observeCards();
    }

    /* ---------- 归档 ---------- */
    function renderArchive(posts) {
      if (!archiveList) return;

      if (!posts || !posts.length) {
        archiveList.innerHTML = '';
        return;
      }

      var groups = {};
      posts.forEach(function (p) {
        var year = (p.date || '').slice(0, 4) || '未分类';
        if (!groups[year]) groups[year] = [];
        groups[year].push(p);
      });

      var years = Object.keys(groups).sort(function (a, b) {
        return String(b).localeCompare(String(a));
      });

      archiveList.innerHTML = years.map(function (year) {
        var items = groups[year].map(function (p) {
          var month = (p.date || '').slice(5, 7);
          var href = '#/post/' + encodeURIComponent(p.slug);
          return '<li>' +
            '<a href="' + href + '" data-slug="' + escapeHtml(p.slug) + '">' +
              '<span class="archive-month">' + escapeHtml(month ? month + '月' : '—') + '</span>' +
              '<span class="archive-title">' + escapeHtml(p.title) + '</span>' +
            '</a>' +
          '</li>';
        }).join('');

        return '<div class="archive-year">' +
          '<h3>' + escapeHtml(year) + '</h3>' +
          '<ul>' + items + '</ul>' +
        '</div>';
      }).join('');
    }

    function observeCards() {
      var cards = $$('.card:not(.skeleton)', grid);

      if (reduceMotion) {
        cards.forEach(function (c) { c.classList.add('in'); c.style.opacity = '1'; });
        return;
      }
      if (!('IntersectionObserver' in window)) {
        cards.forEach(function (c) { c.classList.add('in'); });
        return;
      }

      if (cardObserver) cardObserver.disconnect();
      cardObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            cardObserver.unobserve(en.target);
          }
        });
      }, {
        threshold: CONFIG.cards.threshold,
        rootMargin: CONFIG.cards.rootMargin
      });

      cards.forEach(function (c) { cardObserver.observe(c); });
    }

    /* ---------- 拉列表 ---------- */
    function loadList() {
      renderSkeletons();

      fetch('/api/posts', { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (posts) {
          state.posts = posts;
          renderCards(posts);
          renderArchive(posts);
          if (window.__refreshSpy) window.__refreshSpy();
        })
        .catch(function () {
          renderEmpty('无法加载文章列表。请确认已通过 node server.js 启动服务。', false);
        });
    }

    /* ---------- 打开文章 ---------- */
    function openPost(slug) {
      if (state.loading) return;
      state.loading = true;

      if (state.activeSlug === null) {
        state.savedScrollY = window.scrollY || 0;
      }

      postView.hidden = false;
      document.body.classList.add('locked');

      postContent.innerHTML =
        '<div class="post-loading" aria-hidden="true">' +
          '<div class="sk sk-title"></div>' +
          '<div class="sk sk-text"></div>' +
          '<div class="sk sk-text"></div>' +
          '<div class="sk sk-text"></div>' +
        '</div>';

      fetch('/api/posts/' + encodeURIComponent(slug), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('文章不存在');
          return res.json();
        })
        .then(function (post) {
          var tags = (post.tags || []).map(function (t) {
            return '<span class="tag">' + escapeHtml(t) + '</span>';
          }).join('') || '<span class="tag">随笔</span>';

          postContent.innerHTML =
            '<button class="post-back" type="button" data-back>← 返回列表</button>' +
            '<header class="post-header">' +
              '<div class="post-tags">' + tags + '</div>' +
              '<h1>' + escapeHtml(post.title) + '</h1>' +
              '<div class="post-meta">' + escapeHtml(post.date) + '</div>' +
            '</header>' +
            '<div class="prose">' + window.md.parse(post.body) + '</div>' +
            '<button class="post-back post-back-bottom" type="button" data-back>← 返回列表</button>';

          state.activeSlug = slug;
          document.title = post.title + ' · 深潜';

          postView.scrollTop = 0;
          requestAnimationFrame(function () {
            postView.classList.add('show');
          });
        })
        .catch(function (err) {
          postContent.innerHTML =
            '<button class="post-back" type="button" data-back>← 返回列表</button>' +
            '<div class="empty">' + escapeHtml(err.message || '加载失败') + '</div>';
          postView.classList.add('show');
        })
        .finally(function () {
          state.loading = false;
        });
    }

    /* ---------- 关闭文章 ---------- */
    function closePost(skipRestore) {
      if (!state.activeSlug) {
        postView.classList.remove('show');
        document.body.classList.remove('locked');
        postView.hidden = true;
        document.title = '深潜 · 博客';
        return;
      }

      state.activeSlug = null;
      postView.classList.remove('show');
      document.body.classList.remove('locked');

      if (skipRestore) {
        postView.hidden = true;
        document.title = '深潜 · 博客';
        return;
      }

      var restoreY = state.savedScrollY;
      setTimeout(function () {
        if (state.activeSlug) return;
        postView.hidden = true;
        window.scrollTo(0, restoreY);
        document.title = '深潜 · 博客';
      }, 350);
    }

    /* ---------- 路由 ---------- */
    function handleRoute() {
      var hash = location.hash || '';
      var m = /^#\/post\/(.+)$/.exec(hash);

      if (m) {
        var slug;
        try { slug = decodeURIComponent(m[1]); } catch (e) { slug = m[1]; }
        if (slug && slug !== state.activeSlug) openPost(slug);
      } else {
        if (state.activeSlug || (postView && !postView.hidden)) closePost();
      }
    }

    /* ---------- 导航点击时，立即关闭文章（由 initNavScroll 广播） ---------- */
    window.addEventListener('dive:navscroll', function () {
      if (state.activeSlug || !postView.hidden) {
        closePost(true);
        history.pushState(null, '', location.pathname + location.search);
      }
    });

    /* ---------- 事件 ---------- */
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (!card || card.classList.contains('skeleton')) return;
      if (e.target.closest('.read-more')) return;
      var slug = card.getAttribute('data-slug');
      if (slug) location.hash = '#/post/' + encodeURIComponent(slug);
    });

    if (archiveList) {
      archiveList.addEventListener('click', function (e) {
        var link = e.target.closest('a[data-slug]');
        if (!link) return;
        // 让 hash 自然变化，handleRoute 会接管
      });
    }

    postContent.addEventListener('click', function (e) {
      if (!e.target.closest('[data-back]')) return;
      e.preventDefault();
      history.pushState(null, '', location.pathname + location.search);
      handleRoute();
    });

    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('popstate', handleRoute);

    loadList();
    handleRoute();
  }

  /* =========================================================
     6. 导航平滑滚动 + scrollspy
     ========================================================= */
  function initNavScroll() {
    var nav = $('#nav');
    var S = CONFIG.scroll;

    function navHeight() {
      return nav ? nav.offsetHeight : 0;
    }
    function maxScroll() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }

    function smoothScrollTo(targetY, duration) {
      var startY = window.scrollY;
      var diff = targetY - startY;
      if (Math.abs(diff) < 2) return;

      var start = performance.now();

      function ease(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }

      function step(now) {
        var t = Math.min((now - start) / duration, 1);
        window.scrollTo(0, startY + diff * ease(t));
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function scrollToTarget(target) {
      if (!target) return;

      var top;
      if (target.id === 'top') {
        top = 0;
      } else {
        top = target.getBoundingClientRect().top + window.scrollY - navHeight() - S.navOffset;
      }
      top = Math.max(0, Math.min(top, maxScroll()));

      if (reduceMotion) {
        window.scrollTo(0, top);
        return;
      }

      var distance = Math.abs(top - window.scrollY);
      var duration = Math.min(S.maxDuration, Math.max(S.minDuration, distance * S.speedFactor));
      smoothScrollTo(top, duration);
    }

    /* ---------- 点击 data-scroll 链接 ---------- */
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[data-scroll]');
      if (!link) return;

      var href = link.getAttribute('href') || '';
      if (!href || href.charAt(0) !== '#') return;
      if (href.indexOf('#/') === 0) return; // 文章详情链接不拦截

      var id = href.slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();

      // 如果文章视图打开，先关掉
      window.dispatchEvent(new CustomEvent('dive:navscroll'));

      // 更新 hash（不影响滚动）
      if (history.pushState) {
        history.pushState(null, '', href);
      }

      // 关闭移动端菜单
      var menuBtn = $('#menuBtn');
      if (menuBtn && menuBtn.getAttribute('aria-expanded') === 'true') {
        menuBtn.click();
      }

      scrollToTarget(target);
    });

    /* ---------- scrollspy ---------- */
    var sectionIds = ['articles', 'archive', 'about'];
    var navLinks = $$('.nav-links a[data-scroll], .mobile-menu a[data-scroll]');

    function updateSpy() {
      if (document.body.classList.contains('locked')) return;

      var y = window.scrollY + navHeight() + 110;
      var current = '';

      sectionIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= y) current = id;
      });

      navLinks.forEach(function (a) {
        var href = a.getAttribute('href');
        if (href === '#' + current) {
          a.setAttribute('aria-current', 'page');
        } else {
          a.removeAttribute('aria-current');
        }
      });
    }

    window.addEventListener('scroll', rafThrottle(updateSpy), { passive: true });
    window.addEventListener('resize', rafThrottle(updateSpy));
    updateSpy();

    window.__refreshSpy = updateSpy;
  }

  /* =========================================================
     启动
     ========================================================= */
  function boot() {
    initTheme();
    initNavMenu();
    initWaterScene();
    initScroll();
    initPosts();
    initNavScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();