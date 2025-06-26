// app.js — must be ES Module (because of import)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
console.log("✅ app.js loaded");

const SUPABASE_URL = "https://oyuqmsfifmlrxawsrtwl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dXFtc2ZpZm1scnhhd3NydHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MzA0NzcsImV4cCI6MjA2NjUwNjQ3N30.MhKu34EGcP6h7afU066a_haib7JfTxurrYz4cDPviYc";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("✅ Supabase client created");

const gameDiv = document.getElementById('game');

gameDiv.innerHTML = `
  <h2>Join Bhabhi Game</h2>
  <input id="name" placeholder="Enter your name" />
  <input id="room" placeholder="Room name (e.g. bhabhi123)" />
  <button id="joinBtn">Join Game</button>
  <div id="status"></div>
`;

async function waitForPlayers(room) {
  const checkPlayers = async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room', room);

    console.log("Current players in room:", data);
    if (data.length >= 3) {
      document.getElementById('status').innerText = `🎮 3 players joined! Starting game...`;
      startGame(data);
    }
  };

  // Listen for new players joining
  supabase
    .channel('players-room-sub')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'players',
        filter: `room=eq.${room}`,
      },
      () => {
        checkPlayers();
      }
    )
    .subscribe();

  // Initial check in case 3 already joined
  checkPlayers();
}

document.getElementById('joinBtn').onclick = async () => {
  console.log("🟢 Join button clicked");
  const name = document.getElementById('name').value.trim();
  const room = document.getElementById('room').value.trim();
  const status = document.getElementById('status');

  if (!name || !room) {
    status.innerText = "❌ Please enter name and room.";
    return;
  }

  // Check current players count in the room
  const { data: playersInRoom, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact' })
    .eq('room', room);

  if (countError) {
    status.innerText = "❌ Error checking room players: " + countError.message;
    return;
  }

  if (playersInRoom.length >= 3) {
    status.innerText = "❌ Room full! Maximum 3 players allowed.";
    return;
  }

  // If below limit, insert the new player
  const { data, error } = await supabase.from('players').insert([{ name, room }]);
  console.log("Insert result:", { data, error });

  if (error) {
    status.innerText = "❌ Failed to join: " + error.message;
  } else {
    status.innerText = "✅ Joined room! Waiting for other players...";
    waitForPlayers(room);
  }
};

function showHand(cards) {
  const handDiv = document.createElement('div');
  handDiv.innerHTML = `<h3>Your Cards:</h3><div>${cards.map(c => `${c.rank}${c.suit}`).join(' ')}</div>`;
  document.getElementById('game').appendChild(handDiv);
}

function renderGameState() {
  const room = document.getElementById('room').value;

  // Subscribe to changes on the `games` table for this room
  supabase
    .channel('room-game-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `room=eq.${room}`,
      },
      (payload) => {
        console.log("📡 Game updated via realtime:", payload);
        updateUI(payload.new);
      }
    )
    .subscribe();

  // Also fetch current state once
  const loadGame = async () => {
    const { data } = await supabase
      .from('games')
      .select('*')
      .eq('room', room)
      .single();

    if (data) updateUI(data);
  };

  loadGame();
}

let gameStarted = false;

async function startGame(players) {
  if (gameStarted) return;
  gameStarted = true;

  console.log("🚀 Starting game with players:", players);

  // Build deck and shuffle
  const SUITS = ['♠','♥','♦','♣'], RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  let fullDeck = SUITS.flatMap(s => RANKS.map(r => ({ suit: s, rank: r })));
  fullDeck = fullDeck.sort(() => Math.random() - .5);

  // Deal cards evenly
  const hands = {}, numPlayers = players.length;
  players.forEach(p => hands[p.id] = []);
  fullDeck.forEach((card, i) => hands[players[i % numPlayers].id].push(card));

  // Find Ace♠ starter
  const starterIndex = players.findIndex(p =>
    hands[p.id].some(c => c.rank === 'A' && c.suit === '♠')
  );
  const turnOrder = players
    .slice(starterIndex)
    .concat(players.slice(0, starterIndex))
    .map(p => p.id);

  const room = players[0].room;
  const playerNames = {};
  players.forEach(p => {
    playerNames[p.id] = p.name;
  });

  // Upsert game state
  const { error } = await supabase
    .from('games')
    .upsert([{
      room,
      deck: fullDeck,
      hands,
      turn_order: turnOrder,
      current_turn: 0,
      pile: [],
      started: true,
      player_names: playerNames
    }], { onConflict: 'room' });

  if (error) {
    console.error("❌ Error upserting game:", error.message);
    return;
  }
  console.log("✅ Game started and saved");

  renderGameState();
}

function updateUI(game) {
  document.getElementById('game').querySelectorAll('.hand').forEach(n => n.remove());
  document.getElementById('game').querySelectorAll('.pile').forEach(n => n.remove());

  const myName = document.getElementById('name').value;
  const myPlayer = game.turn_order.find(pid => game.player_names?.[pid] === myName);
  const isMyTurn = game.turn_order[game.current_turn] === myPlayer;

  // Render hand
  const cards = game.hands[myId] || [];
  const handDiv = document.createElement('div');
  handDiv.className = 'hand';
  handDiv.innerHTML = `<h3>Your Cards (${cards.length})</h3>`;
  cards.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.innerText = `${c.rank}${c.suit}`;
    btn.disabled = !isMyTurn;
    btn.onclick = () => playCard(c, game);
    handDiv.appendChild(btn);
  });
  document.getElementById('game').appendChild(handDiv);

  // Render pile
  const pileDiv = document.createElement('div');
  pileDiv.className = 'pile';
  pileDiv.innerHTML = `<h3>Pile:</h3>${game.pile.map(pc => `${pc.card.rank}${pc.card.suit} (${pc.player})`).join(' ')}`;
  document.getElementById('game').appendChild(pileDiv);

  document.getElementById('status').innerText =
    isMyTurn ? "🟢 Your turn! Play a card." : `Waiting: Player ${game.turn_order[game.current_turn]}`;
}

async function playCard(card, game) {
  const myName = document.getElementById('name').value;
  const myPlayer = game.turn_order.find(pid => game.player_names?.[pid] === myName);
  if (!myPlayer) return;
  
  const newHands = { ...game.hands };
  newHands[myId] = newHands[myId].filter(c => c.suit !== card.suit || c.rank !== card.rank);

  const newPile = [...game.pile, { player: myId, card }];
  const nextTurn = (game.current_turn + 1) % game.turn_order.length;

  const { error } = await supabase.from('games').upsert([{
    room: game.room,
    hands: newHands,
    pile: newPile,
    current_turn: nextTurn
  }], { onConflict: 'room' });

  if (error) console.error("❌ Failed to play:", error);
}

