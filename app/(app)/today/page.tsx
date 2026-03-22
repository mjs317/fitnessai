import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import TodayClient from './TodayClient';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = format(new Date(), 'yyyy-MM-dd');

  // Parallel data fetching
  const [
    metricsResult,
    workoutsResult,
    templatesResult,
    nutritionResult,
    aiBriefResult,
    settingsResult,
  ] = await Promise.allSettled([
    supabase
      .from('health_metrics')
      .select('hrv, sleep_score, sleep_hours, body_battery_start, resting_hr, weight_lbs, steps, active_calories, date')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('scheduled_workouts')
      .select(`
        id, workout_id, scheduled_date, status, source,
        external_title, external_description, external_type,
        workouts(id, name, type, estimated_duration_min)
      `)
      .eq('user_id', user.id)
      .eq('scheduled_date', today)
      .order('created_at'),

    supabase
      .from('meal_templates')
      .select('id, name, calories, protein_g, carbs_g, fat_g, category, is_meal_prep, sort_order')
      .eq('user_id', user.id)
      .order('is_meal_prep', { ascending: false })
      .order('sort_order'),

    supabase
      .from('meal_logs')
      .select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', user.id)
      .eq('date', today),

    supabase
      .from('ai_recommendations')
      .select('verdict, content')
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('recommendation_type', 'daily_brief')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('user_settings')
      .select('daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value.data : null;
  const workouts = workoutsResult.status === 'fulfilled' ? (workoutsResult.value.data ?? []) : [];
  const templates = templatesResult.status === 'fulfilled' ? (templatesResult.value.data ?? []) : [];
  const mealLogs = nutritionResult.status === 'fulfilled' ? (nutritionResult.value.data ?? []) : [];
  const aiBrief = aiBriefResult.status === 'fulfilled' ? aiBriefResult.value.data : null;
  const settings = settingsResult.status === 'fulfilled' ? settingsResult.value.data : null;

  const nutrition = mealLogs.reduce(
    (acc: { calories: number; protein_g: number; carbs_g: number; fat_g: number }, log: any) => ({
      calories: acc.calories + (log.calories || 0),
      protein_g: acc.protein_g + (log.protein_g || 0),
      carbs_g: acc.carbs_g + (log.carbs_g || 0),
      fat_g: acc.fat_g + (log.fat_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  const goals = {
    daily_calories: settings?.daily_calories ?? 2800,
    daily_protein_g: settings?.daily_protein_g ?? 200,
    daily_carbs_g: settings?.daily_carbs_g ?? 300,
    daily_fat_g: settings?.daily_fat_g ?? 80,
  };

  return (
    <TodayClient
      initialMetrics={metrics}
      initialWorkouts={workouts}
      initialMealTemplates={templates}
      initialNutrition={nutrition}
      initialAIBrief={aiBrief ? { verdict: aiBrief.verdict as any, content: aiBrief.content } : null}
      goals={goals}
    />
  );
}
