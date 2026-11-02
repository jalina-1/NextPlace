CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY,email text UNIQUE NOT NULL,password text NOT NULL,role text NOT NULL DEFAULT 'user',session_hash text,session_expires timestamptz,premium_until timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS projects(id text PRIMARY KEY,user_id text REFERENCES users(id) ON DELETE CASCADE,name text NOT NULL,data jsonb NOT NULL,revision integer NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS files(id text PRIMARY KEY,user_id text REFERENCES users(id) ON DELETE CASCADE,project_id text REFERENCES projects(id) ON DELETE CASCADE,name text NOT NULL,mime text NOT NULL,path text NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS jobs(id text PRIMARY KEY,project_id text REFERENCES projects(id) ON DELETE CASCADE,status text NOT NULL,progress integer DEFAULT 0,attempts integer DEFAULT 0,error text,updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS payments(id text PRIMARY KEY,user_id text REFERENCES users(id),file_id text REFERENCES files(id),status text NOT NULL DEFAULT 'pending',notes text DEFAULT '',created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS access_grants(payment_id text PRIMARY KEY REFERENCES payments(id),user_id text REFERENCES users(id),starts_at timestamptz,ends_at timestamptz);
CREATE TABLE IF NOT EXISTS audit(id text PRIMARY KEY,actor text,event text,subject text,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS settings(id text PRIMARY KEY,data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS resets(hash text PRIMARY KEY,user_id text REFERENCES users(id) ON DELETE CASCADE,expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS institutions(id text PRIMARY KEY,data jsonb NOT NULL,expires_at timestamptz);
CREATE TABLE IF NOT EXISTS finalized(id text PRIMARY KEY,project_id text REFERENCES projects(id) ON DELETE CASCADE,data jsonb NOT NULL,created_at timestamptz DEFAULT now());
INSERT INTO settings(id,data) VALUES('app','{"price":5000,"bank":"","projectLimit":3,"optionLimit":500,"lookupLimit":1000}') ON CONFLICT DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS projects_created integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS project_revisions(id text PRIMARY KEY,project_id text REFERENCES projects(id) ON DELETE CASCADE,revision integer NOT NULL,data jsonb NOT NULL,created_at timestamptz DEFAULT now());

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_token text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_until timestamptz;
