window.onload = () => {
  const SUPABASE_URL = "https://oyuqmsfifmlrxawsrtwl.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dXFtc2ZpZm1scnhhd3NydHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MzA0NzcsImV4cCI6MjA2NjUwNjQ3N30.MhKu34EGcP6h7afU066a_haib7JfTxurrYz4cDPviYc";

  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  document.getElementById('game').innerHTML = '<p>Game UI will go here</p>';
};
