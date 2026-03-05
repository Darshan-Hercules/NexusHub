-- NEXUSHUB DATABASE SCHEMA (POSTGRESQL / SUPABASE)
-- Using IF NOT EXISTS to prevent errors if running multiple times.

-- 1. Profiles (extending Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#7c6ff7',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- 2. Spaces
CREATE TABLE IF NOT EXISTS spaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🚀',
  color TEXT DEFAULT '#7c6ff7',
  invite_code TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Space Members
CREATE TABLE IF NOT EXISTS space_members (
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'admin' or 'member'
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (space_id, user_id)
);

-- 4. Channels
CREATE TABLE IF NOT EXISTS channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'discussion',
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT channels_type_check CHECK (type IN ('discussion', 'announcement', 'task', 'qa', 'voice', 'video'))
);

-- 5. Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  status TEXT DEFAULT 'todo', -- 'todo', 'in-progress', 'done'
  due_date DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'mention', 'task', 'announcement', 'system'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ENABLE REALTIME
-- Note: You can also do this in the Supabase Dashboard Dashboard -> Realtime -> Select Tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'channels') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE channels;
  END IF;
END $$;

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- POLICIES (Using DO blocks to skip if already exists, or just DROP and CREATE)
-- Profiles
DROP POLICY IF EXISTS "Public Read" ON profiles;
CREATE POLICY "Public Read" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public Insert" ON profiles;
CREATE POLICY "Public Insert" ON profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public Update" ON profiles;
CREATE POLICY "Public Update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Spaces
DROP POLICY IF EXISTS "Allow All Auth" ON spaces;
CREATE POLICY "Allow All Auth" ON spaces FOR ALL USING (auth.role() = 'authenticated');

-- Space Members
DROP POLICY IF EXISTS "Allow All Auth" ON space_members;
CREATE POLICY "Allow All Auth" ON space_members FOR ALL USING (auth.role() = 'authenticated');

-- Channels
DROP POLICY IF EXISTS "Allow All Auth" ON channels;
CREATE POLICY "Allow All Auth" ON channels FOR ALL USING (auth.role() = 'authenticated');

-- Messages
DROP POLICY IF EXISTS "Allow All Auth" ON messages;
CREATE POLICY "Allow All Auth" ON messages FOR ALL USING (auth.role() = 'authenticated');

-- Tasks
DROP POLICY IF EXISTS "Allow All Auth" ON tasks;
CREATE POLICY "Allow All Auth" ON tasks FOR ALL USING (auth.role() = 'authenticated');

-- Notifications
DROP POLICY IF EXISTS "Allow All Auth" ON notifications;
CREATE POLICY "Allow All Auth" ON notifications FOR ALL USING (auth.role() = 'authenticated');
