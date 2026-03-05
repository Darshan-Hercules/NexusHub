/**
 * supabase-config.js
 * Supabase configuration and client initialization
 */

const SUPABASE_URL = 'https://tjdyduaxlqypsjyafbkz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqZHlkdWF4bHF5cHNqeWFmYmt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTg3NjYsImV4cCI6MjA4NzE3NDc2Nn0.dF9Gask_BNdWeDzs2mTNe2SbiFQ5fPlyw2CJVTKrbas';

// Initialize the Supabase client
// We use a different name initially to avoid conflict with the global 'supabase' library object
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export to global window.supabase for use in other scripts
window.supabase = sbClient;
