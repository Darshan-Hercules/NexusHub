-- FIX: Add missing 'email' column and Repair Missing Profiles
-- This script ensures the 'profiles' table is synced with Supabase Auth users.

-- 1. Ensure 'email' column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_attribute 
        WHERE  attrelid = 'public.profiles'::regclass
        AND    attname = 'email'
        AND    NOT attisdropped
    ) THEN
        ALTER TABLE profiles ADD COLUMN email TEXT UNIQUE;
    END IF;
END $$;

-- 2. Repair Missing Profiles
-- This inserts rows into 'profiles' for any users in 'auth.users' that don't have one.
INSERT INTO public.profiles (id, username, display_name, email, color)
SELECT 
    u.id, 
    COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)), 
    COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)), 
    u.email,
    '#7c6ff7'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Sync emails for existing profiles if they are null
UPDATE public.profiles p 
SET email = u.email 
FROM auth.users u 
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 4. Ensure email is NOT NULL now that we've synced
ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;
