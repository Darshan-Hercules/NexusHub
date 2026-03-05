-- NEXUSHUB MASTER DATABASE & STORAGE SETUP
-- Run this in your Supabase SQL Editor to fix the "schema cache" error.

-- 1. Ensure the 'avatar_url' column exists in the profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create the 'avatars' bucket safely in storage
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('avatars', 'avatars', true);
    END IF;
END $$;

-- 3. Reset Storage Policies for the 'avatars' bucket
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow Individual Update" ON storage.objects;

CREATE POLICY "Public Access" ON storage.objects 
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Allow Authenticated Upload" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Allow Individual Update" ON storage.objects 
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid() = owner);

-- 4. FORCE REFRESH THE API CACHE
-- This command precisely fixes the "schema cache" error you are seeing.
NOTIFY pgrst, 'reload schema';
