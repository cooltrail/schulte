(function () {
  'use strict';

  var ROUNDS = 5;
  var PREFIX = 'ctsch';
  var NAME_KEY = 'schulte-name';
  var MAX_PLAYERS = 8;

  var game = window.SchulteGame;
  if (!game) return;

  var btn = document.getElementById('mp-btn');
  var overlay = document.getElementById('mp-overlay');
  var home = document.getElementById('mp-home');
  var lobby = document.getElementById('mp-lobby');
  var finalBox = document.getElementById('mp-final');
  var closeBtn = document.getElementById('mp-close');
  var hostBtn = document.getElementById('mp-host');
  var joinBtn = document.getElementById('mp-join');
  var startBtn = document.getElementById('mp-start');
  var leaveBtn = document.getElementById('mp-leave');
  var againBtn = document.getElementById('mp-again');
  var exitBtn = document.getElementById('mp-exit');
  var nameIn = document.getElementById('mp-name');
  var codeIn = document.getElementById('mp-code-in');
  var codeOut = document.getElementById('mp-code-out');
  var errEl = document.getElementById('mp-err');
  var playersEl = document.getElementById('mp-players');
  var resultsEl = document.getElementById('mp-results');
  var rulesEl = document.getElementById('mp-rules');
  var bar = document.getElementById('mp-bar');
  var roundEl = document.getElementById('mp-round');
  var standingsEl = document.getElementById('mp-standings');

  var peer = null;
  var hostConn = null;
  var guests = {};
  var isHost = false;
  var myId = '';
  var roomCode = '';
  var pack = null;
  var round = 0;
  var started = false;
  var leaving = false;
  var leftOnPurpose = false;
  var players = [];

  nameIn.value = localStorage.getItem(NAME_KEY) || 'Player';

  function myName() {
    var n = (nameIn.value || '').replace(/\s+/g, ' ').trim();
    if (!n) n = 'Player';
    if (n.length > 12) n = n.slice(0, 12);
    localStorage.setItem(NAME_KEY, n);
    nameIn.value = n;
    return n;
  }

  function showErr(msg) {
    errEl.textContent = msg || '';
    errEl.classList.toggle('hidden', !msg);
  }

  function view(which) {
    home.classList.toggle('hidden', which !== 'home');
    lobby.classList.toggle('hidden', which !== 'lobby');
    finalBox.classList.toggle('hidden', which !== 'final');
    overlay.classList.toggle('hidden', !which);
    closeBtn.classList.toggle('hidden', which !== 'home');
  }

  function fmt(seconds) {
    return seconds.toFixed(2);
  }

  function totalOf(p) {
    var t = 0;
    var i;
    for (i = 0; i < p.times.length; i++) t += p.times[i];
    return t;
  }

  function rulesLabel(rules) {
    var r = rules || game.snapshot();
    var name = r.mode === 'prime' ? 'Prime' : r.mode === 'mix' ? 'Mix' : 'Classic';
    return name + ' · ' + r.size + '×' + r.size;
  }

  function applySharedRules(rules, rebuild) {
    if (!rules) return;
    game.applyRules(rules.mode, rules.size, rebuild);
    if (rulesEl) rulesEl.textContent = rulesLabel(rules);
  }

  function renderRules() {
    if (rulesEl) rulesEl.textContent = rulesLabel(game.snapshot());
  }

  function pushRules() {
    var rules = game.snapshot();
    broadcast({ type: 'rules', mode: rules.mode, size: rules.size });
    renderRules();
  }

  function renderPlayers() {
    playersEl.innerHTML = '';
    players.forEach(function (p) {
      var li = document.createElement('li');
      li.textContent = p.name + (p.id === myId ? ' · you' : '') + (p.id === 'host' || (isHost && p.id === myId) ? ' · host' : '');
      playersEl.appendChild(li);
    });
    startBtn.disabled = !isHost || started || players.length < 2;
    startBtn.textContent = players.length < 2 ? 'Need at least 2 players' : 'Start tournament';
  }

  function renderStandings() {
    var ranked = players.slice().sort(function (a, b) {
      var ta = a.times.length ? totalOf(a) : 1e9;
      var tb = b.times.length ? totalOf(b) : 1e9;
      return ta - tb;
    });
    standingsEl.innerHTML = '';
    ranked.forEach(function (p) {
      var span = document.createElement('span');
      var last = p.times[round];
      var tot = p.times.length ? fmt(totalOf(p)) : '—';
      span.textContent = p.name + ' ' + (last == null ? '…' : fmt(last)) + ' · ' + tot;
      standingsEl.appendChild(span);
    });
    if (pack) roundEl.textContent = 'Round ' + (round + 1) + ' / ' + pack.rounds.length;
  }

  function renderResults() {
    var ranked = players.slice().sort(function (a, b) { return totalOf(a) - totalOf(b); });
    resultsEl.innerHTML = '';
    ranked.forEach(function (p, i) {
      var li = document.createElement('li');
      li.textContent = (i + 1) + '. ' + p.name + ' · ' + fmt(totalOf(p)) + 's';
      resultsEl.appendChild(li);
    });
    againBtn.classList.toggle('hidden', !isHost);
  }

  function findPlayer(id) {
    var i;
    for (i = 0; i < players.length; i++) {
      if (players[i].id === id) return players[i];
    }
    return null;
  }

  function addPlayer(id, name) {
    if (findPlayer(id) || players.length >= MAX_PLAYERS) return;
    players.push({ id: id, name: name, times: [] });
    renderPlayers();
    renderStandings();
  }

  function dropPlayer(id) {
    players = players.filter(function (p) { return p.id !== id; });
    renderPlayers();
    renderStandings();
    if (started) maybeAdvance();
  }

  function send(conn, msg) {
    if (conn && conn.open) conn.send(msg);
  }

  function broadcast(msg) {
    Object.keys(guests).forEach(function (id) {
      send(guests[id], msg);
    });
  }

  function pushRoster() {
    broadcast({ type: 'roster', players: players });
    renderPlayers();
    renderStandings();
  }

  function allDoneThisRound() {
    return players.length > 0 && players.every(function (p) {
      return typeof p.times[round] === 'number';
    });
  }

  function playRound(i) {
    round = i;
    started = true;
    if (pack) applySharedRules({ mode: pack.mode, size: pack.size }, false);
    game.setLocked(true);
    overlay.classList.add('hidden');
    bar.classList.remove('hidden');
    var r = pack.rounds[i];
    renderStandings();
    game.playPrepared(pack.size, r.numbers, r.sequence);
  }

  function maybeAdvance() {
    if (!isHost || !started || !pack) return;
    if (!allDoneThisRound()) return;
    broadcast({ type: 'standings', players: players, round: round });
    renderStandings();
    if (round + 1 >= pack.rounds.length) {
      setTimeout(function () {
        broadcast({ type: 'final', players: players });
        showFinal();
      }, 900);
      return;
    }
    setTimeout(function () {
      broadcast({ type: 'go', round: round + 1, players: players });
      playRound(round + 1);
    }, 1400);
  }

  function showFinal() {
    game.setLocked(false);
    bar.classList.add('hidden');
    renderResults();
    view('final');
  }

  function onLocalTime(seconds) {
    var me = findPlayer(myId);
    if (!me || typeof me.times[round] === 'number') return;
    me.times[round] = seconds;
    if (isHost) {
      pushRoster();
      maybeAdvance();
    } else {
      send(hostConn, { type: 'done', id: myId, round: round, seconds: seconds });
    }
    renderStandings();
  }

  function handleMsg(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'join' && isHost) {
      addPlayer(msg.id, msg.name);
      send(guests[msg.id], {
        type: 'welcome',
        id: msg.id,
        players: players,
        rules: game.snapshot()
      });
      pushRoster();
    } else if (msg.type === 'welcome') {
      myId = msg.id;
      players = msg.players;
      applySharedRules(msg.rules, true);
      game.setLocked(true);
      renderPlayers();
    } else if (msg.type === 'rules') {
      applySharedRules(msg, !started);
      game.setLocked(true);
    } else if (msg.type === 'roster') {
      players = msg.players;
      renderPlayers();
      renderStandings();
    } else if (msg.type === 'start') {
      pack = msg.pack;
      if (pack) applySharedRules({ mode: pack.mode, size: pack.size }, false);
    } else if (msg.type === 'go') {
      if (msg.players) players = msg.players;
      playRound(msg.round);
    } else if (msg.type === 'done' && isHost) {
      var p = findPlayer(msg.id);
      if (!p || msg.round !== round) return;
      p.times[msg.round] = msg.seconds;
      pushRoster();
      maybeAdvance();
    } else if (msg.type === 'standings') {
      players = msg.players;
      round = msg.round;
      renderStandings();
    } else if (msg.type === 'final') {
      players = msg.players;
      showFinal();
    } else if (msg.type === 'end') {
      kicked('Host left. The tournament is over.');
    }
  }

  function endRoom() {
    if (!isHost) return;
    broadcast({ type: 'end', reason: 'host-left' });
  }

  function kicked(msg) {
    if (leftOnPurpose || !peer) return;
    var snap = game.snapshot();
    destroyPeer();
    game.applyRules(snap.mode, snap.size, true);
    showErr(msg || 'Host left. The tournament is over.');
    view('home');
  }

  function destroyPeer() {
    leftOnPurpose = true;
    leaving = true;
    game.setOnRoundDone(null);
    game.setOnRulesChange(null);
    game.setLocked(false);
    bar.classList.add('hidden');
    started = false;
    pack = null;
    round = 0;
    players = [];
    if (hostConn) {
      try { hostConn.close(); } catch (e) {}
      hostConn = null;
    }
    Object.keys(guests).forEach(function (id) {
      try { guests[id].close(); } catch (e2) {}
    });
    guests = {};
    if (peer) {
      try { peer.destroy(); } catch (e3) {}
      peer = null;
    }
    isHost = false;
    myId = '';
    roomCode = '';
    leaving = false;
  }

  function leave() {
    endRoom();
    destroyPeer();
    view('home');
    overlay.classList.add('hidden');
  }

  function hostRoom() {
    if (typeof window.Peer !== 'function') {
      showErr('Could not load multiplayer. Check your connection.');
      return;
    }
    destroyPeer();
    isHost = true;
    myId = 'host';
    roomCode = String(Math.floor(100000 + Math.random() * 900000));
    showErr('');
    peer = new window.Peer(PREFIX + roomCode);
    peer.on('error', function (err) {
      if (err && err.type === 'unavailable-id') {
        hostRoom();
        return;
      }
      showErr('Room failed. Try again.');
      view('home');
    });
    peer.on('open', function () {
      leftOnPurpose = false;
      players = [{ id: 'host', name: myName(), times: [] }];
      codeOut.textContent = roomCode.slice(0, 3) + ' ' + roomCode.slice(3);
      startBtn.classList.remove('hidden');
      view('lobby');
      renderPlayers();
      renderRules();
      game.setLocked(true);
      game.setOnRoundDone(onLocalTime);
      game.setOnRulesChange(function () {
        if (isHost && !started) pushRules();
      });
    });
    peer.on('connection', function (conn) {
      guests[conn.peer] = conn;
      conn.on('data', function (msg) {
        if (msg && msg.type === 'join') msg.id = conn.peer;
        if (msg && msg.type === 'done') msg.id = conn.peer;
        handleMsg(msg);
      });
      conn.on('close', function () {
        delete guests[conn.peer];
        dropPlayer(conn.peer);
        if (isHost) pushRoster();
      });
    });
  }

  function joinRoom() {
    if (typeof window.Peer !== 'function') {
      showErr('Could not load multiplayer. Check your connection.');
      return;
    }
    var code = (codeIn.value || '').replace(/\D/g, '');
    if (code.length !== 6) {
      showErr('Enter the 6-digit room code.');
      return;
    }
    destroyPeer();
    isHost = false;
    showErr('');
    peer = new window.Peer();
    peer.on('error', function () {
      showErr('Could not join. Check the code and try again.');
      view('home');
    });
    peer.on('open', function (id) {
      myId = id;
      hostConn = peer.connect(PREFIX + code, { reliable: true });
      var timer = setTimeout(function () {
        showErr('No room with that code.');
        destroyPeer();
        view('home');
      }, 8000);
      hostConn.on('open', function () {
        leftOnPurpose = false;
        clearTimeout(timer);
        send(hostConn, { type: 'join', id: myId, name: myName() });
        codeOut.textContent = code.slice(0, 3) + ' ' + code.slice(3);
        startBtn.classList.add('hidden');
        view('lobby');
        game.setOnRoundDone(onLocalTime);
        game.setLocked(true);
      });
      hostConn.on('data', handleMsg);
      hostConn.on('close', function () {
        kicked('Host left. The tournament is over.');
      });
      hostConn.on('error', function () {
        kicked('Host left. The tournament is over.');
      });
    });
  }

  function startTournament() {
    if (!isHost || players.length < 2) return;
    pack = game.makeRounds(ROUNDS);
    broadcast({ type: 'start', pack: pack });
    setTimeout(function () {
      broadcast({ type: 'go', round: 0, players: players });
      playRound(0);
    }, 400);
  }

  function newTournament() {
    if (!isHost) return;
    started = false;
    pack = null;
    round = 0;
    players.forEach(function (p) { p.times = []; });
    bar.classList.add('hidden');
    game.setLocked(false);
    pushRoster();
    pushRules();
    startBtn.classList.remove('hidden');
    view('lobby');
  }

  btn.addEventListener('click', function () {
    if (started && pack) return;
    showErr('');
    view(peer ? 'lobby' : 'home');
  });

  closeBtn.addEventListener('click', function () {
    overlay.classList.add('hidden');
  });

  hostBtn.addEventListener('click', hostRoom);
  joinBtn.addEventListener('click', joinRoom);
  startBtn.addEventListener('click', startTournament);
  leaveBtn.addEventListener('click', leave);
  againBtn.addEventListener('click', newTournament);
  exitBtn.addEventListener('click', leave);

  codeIn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') joinRoom();
  });

  window.addEventListener('pagehide', endRoom);
  window.addEventListener('beforeunload', endRoom);
})();
