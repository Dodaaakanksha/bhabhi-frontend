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

let gameStarted = false;

async function startGame(players) {
  if (gameStarted) {
    console.log("Game already started, skipping duplicate start");
    return;
  }
  gameStarted = true;
  
  console.log("🚀 Starting game with players:", players);
  
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  // Create full deck
  const fullDeck = [];
  for (let suit of SUITS) {
    for (let rank of RANKS) {
      fullDeck.push({ suit, rank });
    }
  }

  // Shuffle
  for (let i = fullDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fullDeck[i], fullDeck[j]] = [fullDeck[j], fullDeck[i]];
  }

  // Distribute cards
  const numPlayers = players.length;
  const hands = {};
  players.forEach((p) => (hands[p.id] = []));

  let turn = 0;
  while (fullDeck.length) {
    const card = fullDeck.pop();
    const player = players[turn % numPlayers];
    hands[player.id].push(card);
    turn++;
  }

  const room = players[0].room;

  // Check if game already exists for this room
  const { data: existingGame, error: selectError } = await supabase
    .from('games')
    .select('*')
    .eq('room', room)
    .single();

  if (selectError && selectError.code !== 'PGRST116') {
    // Error other than "no rows found"
    console.error("❌ Error checking existing game:", selectError.message);
    return;
  }

  if (existingGame) {
    console.log("✅ Game already exists for this room. Skipping insert.");
  } else {
    // Insert new game row
    const { error } = await supabase.from('games').insert([
      {
        room,
        deck: [],
        hands,
        started: true,
      },
    ]);

    if (error) {
      console.error("❌ Failed to start game:", error.message);
      return;
    }

    console.log("✅ Game started and hands saved to Supabase");
  }

  // Show own hand
  const myName = document.getElementById('name').value;
  const myPlayer = players.find((p) => p.name === myName);
  if (myPlayer) {
    showHand(hands[myPlayer.id]);
  } else {
    console.error("Could not find player ID for current user");
  }
  console.log("🖐 Displaying hand for:", myName, hands[myName]);
}

