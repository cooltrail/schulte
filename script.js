(function () {
  'use strict';

  var SIZE_KEY = 'schulte-size';
  var THEME_KEY = 'schulte-theme';
  var BEST_KEY = 'schulte-best';

  var sizeButtons = document.getElementById('size-buttons');
  var board = document.getElementById('board');
  var nextEl = document.getElementById('next');
  var timeEl = document.getElementById('time');
  var bestEl = document.getElementById('best');
  var doneEl = document.getElementById('done');
  var doneCopy = document.getElementById('done-copy');
  var againBtn = document.getElementById('again-btn');
  var shuffleBtn = document.getElementById('shuffle-btn');
  var themeBtn = document.getElementById('theme-btn');

  var size = clampSize(parseInt(localStorage.getItem(SIZE_KEY), 10) || 5);
  var next = 1;
  var started = false;
  var finished = false;
  var t0 = 0;
  var raf = 0;
  var audioCtx = null;

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

  function readBest() {
    var v = bestMap()[size];
    return typeof v === 'number' ? v : null;
  }

  function writeBest(seconds) {
    var map = bestMap();
    var prev = map[size];
    if (typeof prev !== 'number' || seconds < prev) {
      map[size] = seconds;
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

  function beep(freq, dur, type) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function shuffle(n) {
    var list = [];
    var i;
    for (i = 1; i <= n; i++) list.push(i);
    for (i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function tick() {
    if (!started || finished) return;
    timeEl.textContent = fmt((performance.now() - t0) / 1000);
    raf = requestAnimationFrame(tick);
  }

  function stopClock() {
    cancelAnimationFrame(raf);
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
    next = 1;
    t0 = 0;
    nextEl.textContent = '1';
    timeEl.textContent = '0.00';
    doneEl.classList.add('hidden');
    showBest();
    board.classList.remove('shake');
    board.style.gridTemplateColumns = 'repeat(' + size + ', 1fr)';
    board.innerHTML = '';
    shuffle(size * size).forEach(function (num) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.textContent = String(num);
      cell.dataset.n = String(num);
      board.appendChild(cell);
    });
  }

  function finish() {
    finished = true;
    started = false;
    stopClock();
    var seconds = (performance.now() - t0) / 1000;
    timeEl.textContent = fmt(seconds);
    var record = writeBest(seconds);
    showBest();
    doneCopy.textContent = record
      ? 'New best · ' + fmt(seconds) + 's'
      : 'Done · ' + fmt(seconds) + 's';
    doneEl.classList.remove('hidden');
    beep(520, 0.12, 'sine');
    setTimeout(function () { beep(780, 0.18, 'sine'); }, 90);
  }

  board.addEventListener('click', function (e) {
    var cell = e.target.closest('.cell');
    if (!cell || finished) return;
    var n = Number(cell.dataset.n);
    if (n !== next) {
      cell.classList.add('miss');
      board.classList.remove('shake');
      void board.offsetWidth;
      board.classList.add('shake');
      beep(140, 0.12, 'sawtooth');
      setTimeout(function () { cell.classList.remove('miss'); }, 180);
      return;
    }
    if (!started) {
      started = true;
      t0 = performance.now();
      tick();
    }
    cell.classList.add('got', 'flash');
    beep(420 + next * 8, 0.07, 'triangle');
    setTimeout(function () { cell.classList.remove('flash'); }, 120);
    next += 1;
    if (next > size * size) {
      nextEl.textContent = '✓';
      finish();
    } else {
      nextEl.textContent = String(next);
    }
  });

  sizeButtons.addEventListener('click', function (e) {
    var btn = e.target.closest('.size-btn');
    if (!btn) return;
    size = clampSize(Number(btn.dataset.size));
    localStorage.setItem(SIZE_KEY, String(size));
    buildSizes();
    newTable();
  });

  shuffleBtn.addEventListener('click', newTable);
  againBtn.addEventListener('click', newTable);

  themeBtn.addEventListener('click', function () {
    var light = !document.documentElement.classList.contains('light');
    document.documentElement.classList.toggle('light', light);
    localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
    themeOn();
  });

  themeOn();
  buildSizes();
  newTable();
})();
