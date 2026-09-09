-- YT Clipper Database Schema
-- PostgreSQL (Supabase/Neon)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== Users =====
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  credits INT DEFAULT 10, -- free: 10/bulan, pro: 100, business: 500
  credits_used INT DEFAULT 0,
  credits_reset_at TIMESTAMP DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  password_hash VARCHAR(255), -- NULL for OAuth-only users
  api_key VARCHAR(100) UNIQUE, -- untuk API v1 access
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== Projects =====
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  youtube_url TEXT NOT NULL,
  video_id VARCHAR(20),
  duration INT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'ready', 'failed')),
  total_segments INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== Clips =====
CREATE TABLE clips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  start_time INT NOT NULL,
  end_time INT NOT NULL,
  score INT DEFAULT 0,
  title VARCHAR(255),
  summary TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'exporting', 'completed', 'failed')),
  file_url TEXT,
  file_size BIGINT,
  format VARCHAR(20) DEFAULT 'landscape' CHECK (format IN ('landscape', 'portrait')),
  with_subtitles BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== Usage Log =====
CREATE TABLE usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'analyze', 'export', 'download'
  credits_used INT DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== Payments =====
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount INT NOT NULL, -- in cents
  currency VARCHAR(3) DEFAULT 'IDR',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  stripe_payment_id VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== Coupons =====
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'amount')),
  discount_value INT NOT NULL, -- percent (1-100) or amount in cents
  max_uses INT DEFAULT 0, -- 0 = unlimited
  used_count INT DEFAULT 0,
  plan_override VARCHAR(20), -- if set, coupon grants this plan
  credits_bonus INT DEFAULT 0, -- extra credits on apply
  expires_at TIMESTAMP,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== Settings (admin-configurable, DB-backed) =====
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  is_json BOOLEAN DEFAULT false,
  autoload BOOLEAN DEFAULT true,
  category VARCHAR(50) DEFAULT 'general',
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== Indexes =====
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_clips_project ON clips(project_id);
CREATE INDEX idx_clips_user ON clips(user_id);
CREATE INDEX idx_usage_user ON usage_log(user_id);
CREATE INDEX idx_usage_created ON usage_log(created_at);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe ON users(stripe_customer_id);
CREATE INDEX idx_users_api_key ON users(api_key);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_settings_key ON settings(key);

-- ===== Function: Reset monthly credits =====
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
BEGIN
  UPDATE users
  SET credits = CASE plan
    WHEN 'free' THEN 10
    WHEN 'pro' THEN 100
    WHEN 'business' THEN 500
    ELSE 10
  END,
  credits_used = 0,
  credits_reset_at = DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
  WHERE credits_reset_at <= NOW();
END;
$$ LANGUAGE plpgsql;

