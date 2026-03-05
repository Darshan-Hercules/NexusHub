-- 7. Fix Message Deletion Broadcast
ALTER TABLE messages REPLICA IDENTITY FULL;
-- This script fixes any "Column missing" errors and reloads the API cache.

-- 1. Ensure 'email' column exists in 'profiles'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public.profiles'::regclass AND attname = 'email') THEN
        ALTER TABLE profiles ADD COLUMN email TEXT;
    END IF;
END $$;

-- 2. Ensure 'channel_id' exists in 'tasks'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public.tasks'::regclass AND attname = 'channel_id') THEN
        ALTER TABLE tasks ADD COLUMN channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Ensure 'metadata' exists in 'messages'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public.messages'::regclass AND attname = 'metadata') THEN
        ALTER TABLE messages ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 4. Repair Missing Profiles (The "Hammer" fix)
INSERT INTO public.profiles (id, username, display_name, email, color)
SELECT 
    u.id, 
    LOWER(COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1))), 
    COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)), 
    u.email,
    '#7c6ff7'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 4. Sync existing emails
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 5. FORCE SCHEMA RELOAD (Fixes PostgREST "Column not found" error)
NOTIFY pgrst, 'reload schema';

-- 6. Final verification check
SELECT count(*) as total_users, 
       (SELECT count(*) FROM profiles) as total_profiles 
FROM auth.users;
