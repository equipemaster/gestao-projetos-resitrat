// Check if supabase object is available from CDN
if (typeof supabase === 'undefined') {
    console.error('Supabase client library not loaded. Make sure to include the CDN link.');
} else {
    // Initialize Supabase client
    // @ts-ignore
    var _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized');
}
