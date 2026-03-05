-- Migration: Add avatar_url to profiles table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_attribute 
        WHERE  attrelid = 'public.profiles'::regclass
        AND    attname = 'avatar_url'
        AND    NOT attisdropped
    ) THEN
        ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
    END IF;
END $$;
