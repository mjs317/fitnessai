import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { format, subDays } from 'date-fns';
import NutritionClient from './NutritionClient';

export default async function NutritionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = format(new Date(), 'yyyy-MM-dd');
  const fourteenDaysAgo = format(subDays(new Date(), 14), 'yyyy-MM-dd');

  const [logsRes, templatesRes, metricsRes, mealHistRes, settingsRes] = await Promise.allSettled([
    supabase
      .from('meal_logs')
      .select('id, meal_name, calories, protein_g, carbs_g, fat_g, logged_at')
      .eq('user_id', user.id)
      .eq('date', today)
      .order('logged_at', { ascending: false }),

    supabase
      .from('meal_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('is_meal_prep', { ascending: false })
      .order('sort_order'),

    supabase
      .from('health_metrics')
      .select('date, weight_lbs')
      .eq('user_id', user.id)
      .gte('date', fourteenDaysAgo)
      .order('date'),

    supabase
      .from('meal_logs')
      .select('date, calories, protein_g, carbs_g, fat_g')
      .eq('user_id', user.id)
      .gte('date', fourteenDaysAgo)
      .order('date'),

    supabase
      .from('user_settings')
      .select('daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, weight_goal_lbs, body_fat_goal_pct')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const todayLogs = logsRes.status === 'fulfilled' ? (logsRes.value.data ?? []) : [];
  const templates = templatesRes.status === 'fulfilled' ? (templatesRes.value.data ?? []) : [];
  const metrics = metricsRes.status === 'fulfilled' ? (metricsRes.value.data ?? []) : [];
  const mealHist = mealHistRes.status === 'fulfilled' ? (mealHistRes.value.data ?? []) : [];
  const settings = settingsRes.status === 'fulfilled' ? settingsRes.value.data : null;

  // Build daily aggregates for the last 14 days
  const dailyMap = new Map<string, { protein_g: number; carbs_g: number; fat_g: number; calories: number; weight_lbs: number | null }>();

  // Initialize all dates
  for (let i = 13; i >= 0; i--) {
    const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
    dailyMap.set(d, { protein_g: 0, carbs_g: 0, fat_g: 0, calories: 0, weight_lbs: null });
  }

  // Aggregate meal logs
  mealHist.forEach((log: any) => {
    const existing = dailyMap.get(log.date);
    if (existing) {
      existing.protein_g += log.protein_g || 0;
      existing.carbs_g += log.carbs_g || 0;
      existing.fat_g += log.fat_g || 0;
      existing.calories += log.calories || 0;
    }
  });

  // Add weight data
  metrics.forEach((m: any) => {
    const existing = dailyMap.get(m.date);
    if (existing && m.weight_lbs) existing.weight_lbs = m.weight_lbs;
  });

  const weeklyData = Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data }));

  const goals = {
    daily_calories: settings?.daily_calories ?? 2800,
    daily_protein_g: settings?.daily_protein_g ?? 200,
    daily_carbs_g: settings?.daily_carbs_g ?? 300,
    daily_fat_g: settings?.daily_fat_g ?? 80,
    weight_goal_lbs: settings?.weight_goal_lbs ?? null,
    body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
  };

  return (
    <NutritionClient
      todayLogs={todayLogs as any}
      templates={templates as any}
      weeklyData={weeklyData}
      goals={goals}
    />
  );
}
