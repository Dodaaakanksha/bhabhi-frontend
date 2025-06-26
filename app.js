// app.js — must be ES Module (because of import)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://oyuqmsfifmlrxawsrtwl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dXFtc2ZpZm1scnhhd3NydHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MzA0NzcsImV4cCI6MjA2NjUwNjQ3N30.MhKu34EGcP6h7afU066a_haib7JfTxurrYz4cDPviYc";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
      startGame(data); // call your start game logic here
    }
  };

  // Listen for new players joining
  supabase
    .channel('players-room-sub')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'players', filter: `room=eq.${room}` },
      () => {
        checkPlayers(); // re-check players on new insert
      }
    )
    .subscribe();

  // Initial check in case 3 already joined
  checkPlayers();
}

document.getElementById('joinBtn').onclick = async () => {
  const name = document.getElementById('name').value;
  const room = document.getElementById('room').value;
  const status = document.getElementById('status');

  if (!name || !room) {
    status.innerText = "❌ Please enter name and room.";
    return;
  }

  const { data, error } = await supabase.from('players').insert([{ name, room }]);

  if (error) {
    status.innerText = "❌ Failed to join: " + error.message;
  } else {
    status.innerText = "✅ Joined room! Waiting for other players...";
    waitForPlayers(room); // we'll build this next
  }
};

  checkPlayers();
}


