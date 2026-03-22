-- ============================================================
-- FITNESS AI — SUPABASE SCHEMA
-- Run this entire block in your Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/jsnfhksxwohptkysdkii/sql/new
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: user_settings
-- One row per user. Stores goals, integration credentials,
-- notification prefs, and sync timestamps.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Nutrition goals
  daily_calories              INTEGER DEFAULT 2800,
  daily_protein_g             INTEGER DEFAULT 200,
  daily_carbs_g               INTEGER DEFAULT 300,
  daily_fat_g                 INTEGER DEFAULT 80,

  -- Body goals
  weight_goal_lbs             NUMERIC(5,1),
  body_fat_goal_pct           NUMERIC(4,1),

  -- Garmin credentials (password stored AES-256 encrypted)
  garmin_email                TEXT,
  garmin_password_encrypted   TEXT,
  garmin_last_sync            TIMESTAMPTZ,
  garmin_last_activity_sync   TIMESTAMPTZ,
  garmin_historical_seeded    BOOLEAN DEFAULT FALSE,

  -- Withings OAuth tokens
  withings_access_token       TEXT,
  withings_refresh_token      TEXT,
  withings_token_expires_at   TIMESTAMPTZ,
  withings_user_id            TEXT,
  withings_last_sync          TIMESTAMPTZ,

  -- TrainingPeaks
  trainingpeaks_ics_url       TEXT,
  trainingpeaks_last_sync     TIMESTAMPTZ,

  -- Apple Health (via Health Auto Export webhook)
  apple_health_webhook_token  TEXT UNIQUE,
  apple_health_last_sync      TIMESTAMPTZ,

  -- Preferences
  timezone                    TEXT DEFAULT 'America/New_York',
  units                       TEXT DEFAULT 'imperial',   -- 'imperial' | 'metric'

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: health_metrics
-- One row per user per date. Stores daily readiness data from
-- Garmin, Withings, or manual entry.
-- ============================================================
CREATE TABLE IF NOT EXISTS health_metrics (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                DATE NOT NULL,

  -- Readiness
  hrv                 INTEGER,           -- ms
  sleep_score         INTEGER,           -- 0-100
  sleep_hours         NUMERIC(4,1),
  body_battery_start  INTEGER,           -- 0-100 (start of day)
  resting_hr          INTEGER,           -- bpm
  stress_avg          INTEGER,           -- 0-100

  -- Activity
  steps               INTEGER,
  active_calories     INTEGER,
  training_load       NUMERIC(6,1),

  -- Body composition
  weight_lbs          NUMERIC(5,1),
  body_fat_pct        NUMERIC(4,1),

  -- Source tracking
  source              TEXT DEFAULT 'manual',   -- 'garmin' | 'withings' | 'manual'

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, date)
);

-- ============================================================
-- TABLE: meal_templates
-- Saved meals / food items in the user's meal library.
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other',  -- 'breakfast'|'lunch'|'dinner'|'snack'|'supplement'|'other'
  calories      INTEGER NOT NULL DEFAULT 0,
  protein_g     NUMERIC(6,1) NOT NULL DEFAULT 0,
  carbs_g       NUMERIC(6,1) NOT NULL DEFAULT 0,
  fat_g         NUMERIC(6,1) NOT NULL DEFAULT 0,
  fiber_g       NUMERIC(6,1),
  serving_size  TEXT,                           -- e.g. "1 cup", "100g"
  is_meal_prep  BOOLEAN DEFAULT FALSE,          -- bulk-prepped meal
  notes         TEXT,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: meal_logs
-- Each row = one meal entry logged on a specific date.
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_template_id    UUID REFERENCES meal_templates(id) ON DELETE SET NULL,

  date                DATE NOT NULL,
  meal_name           TEXT NOT NULL,
  meal_time           TEXT,         -- 'breakfast'|'lunch'|'dinner'|'snack'

  calories            INTEGER NOT NULL DEFAULT 0,
  protein_g           NUMERIC(6,1) NOT NULL DEFAULT 0,
  carbs_g             NUMERIC(6,1) NOT NULL DEFAULT 0,
  fat_g               NUMERIC(6,1) NOT NULL DEFAULT 0,
  fiber_g             NUMERIC(6,1),

  notes               TEXT,
  logged_at           TIMESTAMPTZ DEFAULT NOW(),

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: workouts
-- Workout templates saved in the library.
-- ============================================================
CREATE TABLE IF NOT EXISTS workouts (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name                    TEXT NOT NULL,
  type                    TEXT NOT NULL DEFAULT 'strength',  -- 'strength'|'run'|'bike'|'hyrox'|'swim'|'other'
  description             TEXT,
  estimated_duration_min  INTEGER,
  blocks                  JSONB DEFAULT '[]',   -- array of workout blocks
  garmin_workout_id       TEXT,                 -- if pushed to Garmin device

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: scheduled_workouts
-- A workout planned on a specific date (from manual plan,
-- AI plan, or TrainingPeaks import).
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_workouts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id          UUID REFERENCES workouts(id) ON DELETE SET NULL,
  training_plan_id    UUID,                     -- FK added after training_plans table

  scheduled_date      DATE NOT NULL,
  source              TEXT DEFAULT 'manual',    -- 'manual'|'ai'|'trainingpeaks'|'garmin'
  status              TEXT DEFAULT 'pending',   -- 'pending'|'completed'|'skipped'|'auto-completed'

  -- For TrainingPeaks / external imports
  external_title      TEXT,
  external_type       TEXT,
  external_notes      TEXT,
  external_event_id   TEXT,

  -- Post-completion data
  rpe_score           INTEGER CHECK (rpe_score BETWEEN 1 AND 10),
  notes               TEXT,
  garmin_activity_id  BIGINT,

  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: workout_logs
-- Actual performance data from a completed workout session.
-- ============================================================
CREATE TABLE IF NOT EXISTS workout_logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id            UUID REFERENCES workouts(id) ON DELETE SET NULL,
  scheduled_workout_id  UUID REFERENCES scheduled_workouts(id) ON DELETE SET NULL,
  garmin_activity_id    BIGINT,

  duration_min          INTEGER,
  rpe_score             INTEGER CHECK (rpe_score BETWEEN 1 AND 10),
  notes                 TEXT,
  block_results         JSONB DEFAULT '[]',   -- per-set/exercise actual data
  auto_completed        BOOLEAN DEFAULT FALSE,

  completed_at          TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: training_plans
-- An AI-generated or manually created multi-week training plan.
-- ============================================================
CREATE TABLE IF NOT EXISTS training_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  sport           TEXT NOT NULL,              -- 'running'|'triathlon'|'hyrox'|'strength'|'cycling'
  race_distance   TEXT,
  race_date       DATE,
  fitness_level   TEXT,                       -- 'beginner'|'intermediate'|'advanced'
  weeks           INTEGER,
  is_active       BOOLEAN DEFAULT TRUE,
  plan_data       JSONB,                      -- full AI-generated plan JSON

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from scheduled_workouts back to training_plans
ALTER TABLE scheduled_workouts
  ADD CONSTRAINT fk_training_plan
  FOREIGN KEY (training_plan_id)
  REFERENCES training_plans(id)
  ON DELETE SET NULL;

-- ============================================================
-- TABLE: garmin_activities
-- Raw activity records synced from Garmin Connect.
-- ============================================================
CREATE TABLE IF NOT EXISTS garmin_activities (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  garmin_activity_id  BIGINT NOT NULL UNIQUE,

  activity_date       DATE NOT NULL,
  activity_type       TEXT,
  title               TEXT,
  duration_sec        INTEGER,
  distance_meters     NUMERIC(10,2),
  avg_hr              INTEGER,
  max_hr              INTEGER,
  calories            INTEGER,
  avg_pace_sec_per_km NUMERIC(8,2),
  elevation_gain_m    NUMERIC(8,2),
  raw_json            JSONB,

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: ai_recommendations
-- Cached AI-generated content (daily brief, nutrition advice).
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  date                  DATE NOT NULL,
  recommendation_type   TEXT NOT NULL DEFAULT 'daily_brief',  -- 'daily_brief'|'nutrition_advice'
  verdict               TEXT,                                  -- 'PUSH'|'MAINTAIN'|'RECOVER'
  content               TEXT NOT NULL,
  data_snapshot         JSONB,
  model                 TEXT DEFAULT 'claude-sonnet-4-6',

  created_at            TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, date, recommendation_type)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Every table locked down so users only see their own rows.
-- ============================================================

ALTER TABLE user_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE garmin_activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;

-- user_settings
CREATE POLICY "Users manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- health_metrics
CREATE POLICY "Users manage own health metrics"
  ON health_metrics FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- meal_templates
CREATE POLICY "Users manage own meal templates"
  ON meal_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- meal_logs
CREATE POLICY "Users manage own meal logs"
  ON meal_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- workouts
CREATE POLICY "Users manage own workouts"
  ON workouts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- scheduled_workouts
CREATE POLICY "Users manage own scheduled workouts"
  ON scheduled_workouts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- workout_logs
CREATE POLICY "Users manage own workout logs"
  ON workout_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- training_plans
CREATE POLICY "Users manage own training plans"
  ON training_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- garmin_activities
CREATE POLICY "Users manage own Garmin activities"
  ON garmin_activities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ai_recommendations
CREATE POLICY "Users manage own AI recommendations"
  ON ai_recommendations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- INDEXES (performance)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_health_metrics_user_date
  ON health_metrics(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date
  ON meal_logs(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_meal_templates_user_category
  ON meal_templates(user_id, category);

CREATE INDEX IF NOT EXISTS idx_workouts_user_type
  ON workouts(user_id, type);

CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_user_date
  ON scheduled_workouts(user_id, scheduled_date DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_status
  ON scheduled_workouts(user_id, status, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date
  ON workout_logs(user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_garmin_activities_user_date
  ON garmin_activities(user_id, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_user_date
  ON ai_recommendations(user_id, date DESC);

-- ============================================================
-- STORAGE BUCKET for workout screenshot imports
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('workout-images', 'workout-images', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'workout-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own screenshots"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'workout-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own screenshots"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'workout-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- Done! Schema ready.
-- ============================================================
