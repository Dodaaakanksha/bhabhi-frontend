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
      player_names: playerNames,
      starting_suit: null
    }], { onConflict: 'room' });

  if (error) {
    console.error("❌ Error upserting game:", error.message);
    return;
  }
  console.log("✅ Game started and saved");

  renderGameState();
}

async function playCard(card, game) {
  const myName = document.getElementById('name').value;
  const myPlayer = game.turn_order.find(pid => game.player_names?.[pid] === myName);
  if (!myPlayer) return;

  const newHands = { ...game.hands };
  newHands[myPlayer] = newHands[myPlayer].filter(c => !(c.suit === card.suit && c.rank === card.rank));

  const newPile = [...game.pile, { player: myPlayer, card }];
  let startingSuit = game.starting_suit || card.suit;
  let nextTurn = (game.current_turn + 1) % game.turn_order.length;

  const allPlayersPlayed = newPile.length === game.turn_order.length;
  let updatedPile = newPile;
  let updatedTurn = nextTurn;

  if (allPlayersPlayed) {
    const cardsOfStartingSuit = newPile.filter(pc => pc.card.suit === startingSuit);
    const suitRankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    let highest = -1;
    let roundWinnerId = null;

    for (const pc of cardsOfStartingSuit) {
      const val = suitRankOrder.indexOf(pc.card.rank);
      if (val > highest) {
        highest = val;
        roundWinnerId = pc.player;
      }
    }

    const allSameSuit = newPile.every(pc => pc.card.suit === startingSuit);

    if (allSameSuit) {
      // Discard pile
      updatedPile = [];
    } else {
      // Give all pile cards to roundWinner
      newHands[roundWinnerId] = newHands[roundWinnerId].concat(newPile.map(p => p.card));
      updatedPile = [];
    }

    startingSuit = null; // reset for next round
    updatedTurn = game.turn_order.indexOf(roundWinnerId);
    if (updatedTurn === -1) updatedTurn = 0;
  }

  // Remove players who finished cards
  let newTurnOrder = [...game.turn_order];
  let newPlayerNames = { ...game.player_names };

  for (const pid of game.turn_order) {
    if ((newHands[pid] || []).length === 0) {
      delete newHands[pid];
      delete newPlayerNames[pid];
      newTurnOrder = newTurnOrder.filter(p => p !== pid);
    }
  }

  // Determine if game ends
  let loser = null;
  if (newTurnOrder.length === 1) {
    loser = newPlayerNames[newTurnOrder[0]];
  }

  if (newTurnOrder.length === 0) {
    updatedTurn = 0;
  } else if (updatedTurn >= newTurnOrder.length) {
    updatedTurn = 0;
  }

  const { error } = await supabase.from('games').upsert([{
    room: game.room,
    hands: newHands,
    pile: updatedPile,
    turn_order: newTurnOrder,
    current_turn: updatedTurn,
    starting_suit: startingSuit,
    player_names: newPlayerNames,
    deck: game.deck,
    loser
  }], { onConflict: 'room' });

  if (error) {
    console.error("❌ Failed to play:", error);
  }
}

const SUITS_ORDER = ['♠', '♥', '♦', '♣']; // descending priority order
const RANKS_ORDER = ['A','K','Q','J','10','9','8','7','6','5','4','3','2']; // descending

function sortCardsDesc(cards) {
  return cards.slice().sort((a, b) => {
    // Compare suits first
    const suitDiff = SUITS_ORDER.indexOf(a.suit) - SUITS_ORDER.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;

    // Compare ranks
    return RANKS_ORDER.indexOf(a.rank) - RANKS_ORDER.indexOf(b.rank);
  });
}

function updateUI(game) {
  const gameDiv = document.getElementById('game');
  gameDiv.querySelectorAll('.hand').forEach(n => n.remove());
  gameDiv.querySelectorAll('.pile').forEach(n => n.remove());

  const myName = document.getElementById('name').value;
  const myPlayer = game.turn_order.find(pid => game.player_names?.[pid] === myName);
  const isMyTurn = game.turn_order[game.current_turn] === myPlayer;

  if (game.loser) {
    document.getElementById('status').innerText = `🎉 Game Over! 😢 ${game.loser} is the Bhabhi (loser).`;
    return;
  }

  if (!game.hands[myPlayer]) {
    document.getElementById('status').innerText = "✅ You've finished all your cards!";
    return;
  }

  // Sort cards by suit & descending rank
  const suitOrder = ['♠','♥','♦','♣'];
  const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const cards = (game.hands[myPlayer] || []).slice().sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    return rankOrder.indexOf(b.rank) - rankOrder.indexOf(a.rank);
  });

  // Render hand
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
  gameDiv.appendChild(handDiv);

  // Render pile
  const pileDiv = document.createElement('div');
  pileDiv.className = 'pile';
  pileDiv.innerHTML = `<h3>Pile:</h3>`;
  game.pile.forEach(pc => {
    const name = game.player_names?.[pc.player] || pc.player;
    pileDiv.innerHTML += `<div>${pc.card.rank}${pc.card.suit} (${name})</div>`;
  });
  gameDiv.appendChild(pileDiv);

  // Show current status
  const currentPlayerName = game.player_names?.[game.turn_order[game.current_turn]];
  document.getElementById('status').innerText =
    isMyTurn ? "🟢 Your turn! Play a card." : `⏳ Waiting for ${currentPlayerName}`;
}

