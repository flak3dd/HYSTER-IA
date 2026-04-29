-- Enable Supabase Realtime on the nodes table
-- Run this once via Supabase Dashboard SQL editor or as part of your migration.

-- Enable RLS (required for Supabase Realtime)
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read for Realtime subscriptions
-- All writes go through Prisma (server-side, bypasses RLS)
CREATE POLICY "Allow anon read for realtime" ON nodes
  FOR SELECT USING (true);

-- Add nodes table to Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE nodes;
