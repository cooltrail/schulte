(function () {
  'use strict';

  var SIZE_KEY = 'schulte-size';
  var THEME_KEY = 'schulte-theme';
  var MODE_KEY = 'schulte-mode';
  var BEST_KEY = 'schulte-best';
  var BG_KEY = 'schulte-bg';
  var GRID_KEY = 'schulte-grid';
  var HIT_KEY = 'schulte-hit';
  var MENU_KEY = 'schulte-menu';
  var ALPHA_KEY = 'schulte-grid-alpha';

  var sizeButtons = document.getElementById('size-buttons');
  var board = document.getElementById('board');
  var nextEl = document.getElementById('next');
  var timeEl = document.getElementById('time');
  var timeLabel = document.getElementById('time-label');
  var timeStat = document.getElementById('time-stat');
  var bestEl = document.getElementById('best');
  var doneEl = document.getElementById('done');
  var doneCopy = document.getElementById('done-copy');
  var againBtn = document.getElementById('again-btn');
  var shuffleBtn = document.getElementById('shuffle-btn');
  var themeBtn = document.getElementById('theme-btn');
  var tagline = document.getElementById('tagline');
  var modeBtns = document.querySelectorAll('[data-mode]');
  var bgInput = document.getElementById('bg-color');
  var gridInput = document.getElementById('grid-color');
  var hitInput = document.getElementById('hit-color');
  var menuInput = document.getElementById('menu-color');
  var alphaInput = document.getElementById('grid-alpha');

  var INSPECT_SEC = 10;
  var size = clampSize(parseInt(localStorage.getItem(SIZE_KEY), 10) || 5);
  var mode = localStorage.getItem(MODE_KEY) === 'prime' ? 'prime' : 'classic';
  var sequence = [];
  var nextIndex = 0;
  var started = false;
  var finished = false;
  var inspecting = false;
  var t0 = 0;
  var inspectT0 = 0;
  var raf = 0;
  var audioCtx = null;
  var noiseBuf = null;

  function clampSize(n) {
    if (n < 2) return 2;
    if (n > 10) return 10;
    return n;
  }

  function bestMap() {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function bestKey() {
    return mode + '-' + size;
  }

  function readBest() {
    var v = bestMap()[bestKey()];
    return typeof v === 'number' ? v : null;
  }

  function writeBest(seconds) {
    var map = bestMap();
    var key = bestKey();
    var prev = map[key];
    if (typeof prev !== 'number' || seconds < prev) {
      map[key] = seconds;
      localStorage.setItem(BEST_KEY, JSON.stringify(map));
      return true;
    }
    return false;
  }

  function fmt(seconds) {
    return seconds.toFixed(2);
  }

  function showBest() {
    var best = readBest();
    bestEl.textContent = best == null ? '—' : fmt(best);
  }

  function themeOn() {
    var light = document.documentElement.classList.contains('light');
    themeBtn.textContent = light ? 'Dark' : 'Light';
  }

  function hexOk(v) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  }

  function readHex(key) {
    var v = localStorage.getItem(key);
    return hexOk(v) ? v.toLowerCase() : null;
  }

  var customBg = readHex(BG_KEY);
  var customGrid = readHex(GRID_KEY);
  var customHit = readHex(HIT_KEY);
  var customMenu = readHex(MENU_KEY);

  function readAlpha() {
    var n = parseInt(localStorage.getItem(ALPHA_KEY), 10);
    if (isNaN(n)) return 100;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  var customAlpha = readAlpha();

  function themeColors() {
    return document.documentElement.classList.contains('light')
      ? { bg: '#f7f1e6', grid: '#1a1916', hit: '#5dba86', menu: '#efe6d4' }
      : { bg: '#111114', grid: '#f4e7d0', hit: '#2f6f4e', menu: '#1c1b19' };
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function rgbToHex(r, g, b) {
    function h(n) {
      var v = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return v.length === 1 ? '0' + v : v;
    }
    return '#' + h(r) + h(g) + h(b);
  }

  function mix(a, b, t) {
    var A = hexToRgb(a);
    var B = hexToRgb(b);
    return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
  }

  function luma(hex) {
    var c = hexToRgb(hex);
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  }

  function contrastInk(hex) {
    return luma(hex) > 0.55 ? '#111114' : '#f4e7d0';
  }

  function hexAlpha(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + a + ')';
  }

  function applyColors() {
    var theme = themeColors();
    var bg = customBg || theme.bg;
    var grid = customGrid || theme.grid;
    var hit = customHit || theme.hit;
    var menu = customMenu || theme.menu;
    var shade = customAlpha / 100;
    var fg = contrastInk(bg);
    var cellInk = contrastInk(grid);
    var hitInk = contrastInk(hit);
    var menuInk = contrastInk(menu);
    var line = mix(grid, cellInk, 0.26);
    var root = document.documentElement.style;
    root.setProperty('--bg', bg);
    root.setProperty('--fg', fg);
    root.setProperty('--grid', hexAlpha(grid, shade));
    root.setProperty('--grid-2', hexAlpha(mix(grid, cellInk, 0.1), shade));
    root.setProperty('--grid-line', line);
    root.setProperty('--cell-ink', cellInk);
    root.setProperty('--hud', menu);
    root.setProperty('--menu', menu);
    root.setProperty('--menu-ink', menuInk);
    root.setProperty('--menu-mist', mix(menuInk, menu, 0.4));
    root.setProperty('--mist', mix(fg, bg, 0.4));
    root.setProperty('--rule', line);
    root.setProperty('--hit', hit);
    root.setProperty('--hit-ink', hitInk);
    root.setProperty('--good', hit);
    root.setProperty('--found', hitInk);
    bgInput.value = bg;
    gridInput.value = grid;
    hitInput.value = hit;
    menuInput.value = menu;
    alphaInput.value = String(customAlpha);
  }

  function ensureAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!noiseBuf) {
      var len = Math.floor(audioCtx.sampleRate * 0.25);
      noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      var b0 = 0;
      var b1 = 0;
      var b2 = 0;
      var i;
      for (i = 0; i < len; i++) {
        var white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.35;
      }
    }
    return audioCtx;
  }

  function outNode(when, panAmt) {
    var c = audioCtx;
    if (typeof c.createStereoPanner !== 'function') return c.destination;
    var pan = c.createStereoPanner();
    pan.pan.setValueAtTime(panAmt, when);
    pan.connect(c.destination);
    return pan;
  }

  function noiseBurst(when, dur, freq, q, gain, panAmt) {
    var src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, when);
    filter.Q.setValueAtTime(q, when);
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(Math.max(gain, 0.0001), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(outNode(when, panAmt));
    src.start(when, Math.random() * 0.15, dur + 0.02);
  }

  function tone(when, freq, dur, gain, panAmt) {
    var osc = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(Math.max(gain, 0.0001), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(outNode(when, panAmt));
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function tapSound(kind) {
    try {
      if (!ensureAudio()) return;
      var t = audioCtx.currentTime;
      var j = Math.random() - 0.5;
      var pan = j * 0.28;
      if (kind === 'hit') {
        noiseBurst(t, 0.016, 1280 + j * 220, 3.2, 0.32, pan);
        tone(t, 168 + j * 16, 0.032, 0.05, pan);
        noiseBurst(t + 0.034, 0.01, 4600 + j * 380, 8.5, 0.22, pan * 0.7);
        tone(t + 0.032, 2050 + j * 140, 0.02, 0.032, pan * 0.7);
      } else if (kind === 'miss') {
        noiseBurst(t, 0.05, 360 + j * 40, 1.3, 0.18, pan * 0.4);
        tone(t, 92, 0.08, 0.038, pan * 0.4);
      } else if (kind === 'done') {
        noiseBurst(t, 0.018, 2100, 5, 0.2, -0.12);
        tone(t, 540, 0.07, 0.036, -0.12);
        noiseBurst(t + 0.11, 0.02, 2900, 6, 0.18, 0.04);
        tone(t + 0.11, 760, 0.09, 0.04, 0.04);
        noiseBurst(t + 0.24, 0.022, 3400, 7, 0.16, 0.16);
        tone(t + 0.24, 980, 0.12, 0.036, 0.16);
      } else if (kind === 'ui') {
        noiseBurst(t, 0.012, 2500 + j * 220, 6, 0.12, pan * 0.5);
        tone(t, 1480 + j * 80, 0.018, 0.018, pan * 0.5);
      }
    } catch (e) {}
  }

  function firstPrimes(count) {
    var primes = [];
    var n = 2;
    while (primes.length < count) {
      var ok = true;
      var i;
      for (i = 0; i < primes.length; i++) {
        if (primes[i] * primes[i] > n) break;
        if (n % primes[i] === 0) {
          ok = false;
          break;
        }
      }
      if (ok) primes.push(n);
      n += 1;
    }
    return primes;
  }

  function range(n) {
    var list = [];
    var i;
    for (i = 1; i <= n; i++) list.push(i);
    return list;
  }

  function shuffle(list) {
    var copy = list.slice();
    var i;
    for (i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function syncMode() {
    modeBtns.forEach(function (btn) {
      btn.classList.toggle('on', btn.dataset.mode === mode);
    });
    tagline.textContent = mode === 'prime'
      ? 'Tap primes in order: 2, then 3, then 5. Eyes stay on the center.'
      : 'Tap 1, then 2, then the rest. Eyes stay on the center.';
  }

  function showTimeLabel(look) {
    timeLabel.textContent = look ? 'Look' : 'Time';
    timeStat.classList.toggle('look', look);
  }

  function tick() {
    if (!started || finished) return;
    timeEl.textContent = fmt((performance.now() - t0) / 1000);
    raf = requestAnimationFrame(tick);
  }

  function inspectTick() {
    if (!inspecting || finished) return;
    var left = INSPECT_SEC - (performance.now() - inspectT0) / 1000;
    if (left <= 0) {
      endInspect(true);
      return;
    }
    timeEl.textContent = fmt(left);
    raf = requestAnimationFrame(inspectTick);
  }

  function stopClock() {
    cancelAnimationFrame(raf);
  }

  function beginInspect() {
    inspecting = true;
    inspectT0 = performance.now();
    board.classList.add('inspecting');
    showTimeLabel(true);
    timeEl.textContent = fmt(INSPECT_SEC);
    raf = requestAnimationFrame(inspectTick);
  }

  function endInspect(beginPlay) {
    if (!inspecting) return;
    inspecting = false;
    stopClock();
    board.classList.remove('inspecting');
    showTimeLabel(false);
    if (beginPlay) {
      tapSound('ui');
      startRun();
    } else if (!started) {
      timeEl.textContent = '0.00';
    }
  }

  function startRun() {
    if (started || finished) return;
    if (inspecting) endInspect(false);
    started = true;
    t0 = performance.now();
    showTimeLabel(false);
    tick();
  }

  function buildSizes() {
    sizeButtons.innerHTML = '';
    var n;
    for (n = 2; n <= 10; n++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'size-btn' + (n === size ? ' on' : '');
      btn.textContent = n + '×' + n;
      btn.dataset.size = String(n);
      sizeButtons.appendChild(btn);
    }
  }

  function newTable() {
    stopClock();
    started = false;
    finished = false;
    inspecting = false;
    nextIndex = 0;
    sequence = mode === 'prime' ? firstPrimes(size * size) : range(size * size);
    t0 = 0;
    nextEl.textContent = String(sequence[0]);
    timeEl.textContent = fmt(INSPECT_SEC);
    doneEl.classList.add('hidden');
    showBest();
    board.classList.remove('shake', 'inspecting');
    board.style.setProperty('--n', String(size));
    board.innerHTML = '';
    shuffle(sequence).forEach(function (num) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.textContent = String(num);
      cell.dataset.n = String(num);
      board.appendChild(cell);
    });
    fitCellType();
    beginInspect();
  }

  function glyphBox(el) {
    var range = document.createRange();
    if (el.firstChild) range.selectNodeContents(el.firstChild);
    else range.selectNodeContents(el);
    return range.getBoundingClientRect();
  }

  function fitCellType() {
    var cells = board.querySelectorAll('.cell');
    if (!cells.length || cells[0].clientWidth < 4) return;
    var i;
    var pad = 4;
    function apply(px) {
      for (i = 0; i < cells.length; i++) cells[i].style.fontSize = px + 'px';
    }
    function fits(px) {
      apply(px);
      for (i = 0; i < cells.length; i++) {
        var box = glyphBox(cells[i]);
        if (box.width > cells[i].clientWidth - pad) return false;
        if (box.height > cells[i].clientHeight - pad) return false;
      }
      return true;
    }
    var hi = Math.min(cells[0].clientWidth, cells[0].clientHeight) * 0.78;
    var lo = 8;
    if (fits(hi)) return;
    var step;
    for (step = 0; step < 14; step++) {
      var mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    apply(Math.floor(lo * 10) / 10);
  }

  function finish() {
    finished = true;
    started = false;
    inspecting = false;
    showTimeLabel(false);
    stopClock();
    var seconds = (performance.now() - t0) / 1000;
    timeEl.textContent = fmt(seconds);
    var record = writeBest(seconds);
    showBest();
    doneCopy.textContent = record
      ? 'New best · ' + fmt(seconds) + 's'
      : 'Done · ' + fmt(seconds) + 's';
    doneEl.classList.remove('hidden');
    tapSound('done');
  }

  board.addEventListener('click', function (e) {
    var cell = e.target.closest('.cell');
    if (!cell || finished) return;
    var n = Number(cell.dataset.n);
    if (n !== sequence[nextIndex]) {
      cell.classList.add('miss');
      board.classList.remove('shake');
      void board.offsetWidth;
      board.classList.add('shake');
      tapSound('miss');
      setTimeout(function () { cell.classList.remove('miss'); }, 180);
      return;
    }
    startRun();
    cell.classList.add('got', 'flash');
    tapSound('hit');
    setTimeout(function () { cell.classList.remove('flash'); }, 120);
    nextIndex += 1;
    if (nextIndex >= sequence.length) {
      nextEl.textContent = '✓';
      finish();
    } else {
      nextEl.textContent = String(sequence[nextIndex]);
    }
  });

  sizeButtons.addEventListener('click', function (e) {
    var btn = e.target.closest('.size-btn');
    if (!btn) return;
    size = clampSize(Number(btn.dataset.size));
    localStorage.setItem(SIZE_KEY, String(size));
    tapSound('ui');
    buildSizes();
    newTable();
  });

  shuffleBtn.addEventListener('click', function () {
    tapSound('ui');
    newTable();
  });
  againBtn.addEventListener('click', function () {
    tapSound('ui');
    newTable();
  });

  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      mode = btn.dataset.mode === 'prime' ? 'prime' : 'classic';
      localStorage.setItem(MODE_KEY, mode);
      tapSound('ui');
      syncMode();
      newTable();
    });
  });

  themeBtn.addEventListener('click', function () {
    var light = !document.documentElement.classList.contains('light');
    document.documentElement.classList.toggle('light', light);
    localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
    tapSound('ui');
    themeOn();
    applyColors();
  });

  gridInput.addEventListener('input', function () {
    customGrid = hexOk(gridInput.value) ? gridInput.value.toLowerCase() : customGrid;
    if (customGrid) localStorage.setItem(GRID_KEY, customGrid);
    applyColors();
  });

  bgInput.addEventListener('input', function () {
    customBg = hexOk(bgInput.value) ? bgInput.value.toLowerCase() : customBg;
    if (customBg) localStorage.setItem(BG_KEY, customBg);
    applyColors();
  });

  hitInput.addEventListener('input', function () {
    customHit = hexOk(hitInput.value) ? hitInput.value.toLowerCase() : customHit;
    if (customHit) localStorage.setItem(HIT_KEY, customHit);
    applyColors();
  });

  menuInput.addEventListener('input', function () {
    customMenu = hexOk(menuInput.value) ? menuInput.value.toLowerCase() : customMenu;
    if (customMenu) localStorage.setItem(MENU_KEY, customMenu);
    applyColors();
  });

  alphaInput.addEventListener('input', function () {
    var n = parseInt(alphaInput.value, 10);
    if (isNaN(n)) n = 100;
    if (n < 0) n = 0;
    if (n > 100) n = 100;
    customAlpha = n;
    localStorage.setItem(ALPHA_KEY, String(customAlpha));
    applyColors();
  });

  document.addEventListener('pointerdown', function () {
    ensureAudio();
  }, { once: true });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(function () { fitCellType(); }).observe(board);
  } else {
    window.addEventListener('resize', fitCellType);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitCellType);
  }

  themeOn();
  applyColors();
  syncMode();
  buildSizes();
  newTable();
})();
