import { createServiceRoleClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';

interface CoachingSnapshot {
  date: string;
  today: {
    metrics: any;
    scheduledWorkouts: any[];
    nutritionLogged: {
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    };
  };
  trends: {
    hrv: { value: string; direction: string; avg7d: number | null };
    sleep: { value: string; direction: string; avg7d: number | null };
    weight: { value: string; direction: string; trend: string };
  };
  trainingLoad7d: number;
  recentWorkouts: any[];
  nutritionYesterday: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  goals: {
    weightGoalLbs: number | null;
    bodyFatGoalPct: number | null;
    dailyCalories: number;
    dailyProteinG: number;
    dailyCarbsG: number;
    dailyFatG: number;
  };
}

function calculateTrend(values: (number | null)[]): { direction: string; pct: number | null } {
  const valid = values.filter((v): v is number => v !== null && v !== undefined);
  if (valid.length < 2) return { direction: 'stable', pct: null };
  const recent = valid.slice(0, Math.ceil(valid.length / 2));
  const prior = valid.slice(Math.ceil(valid.length / 2));
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const pct = ((recentAvg - priorAvg) / priorAvg) * 100;
  const direction = pct > 3 ? 'up' : pct < -3 ? 'down' : 'stable';
  return { direction, pct: Math.round(pct) };
}

export async function buildCoachingSnapshot(userId: string, date: string): Promise<CoachingSnapshot> {
  const supabase = await createServiceRoleClient();
  const sevenDaysAgo = format(subDays(new Date(date), 7), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(date), 1), 'yyyy-MM-dd');

  const [metrics7dRes, todayScheduleRes, recentLogsRes, nutritionTodayRes, nutritionYestRes, settingsRes] = await Promise.allSettled([
    supabase
      .from('health_metrics')
      .select('date, hrv, sleep_score, sleep_hours, body_battery_start, resting_hr, weight_lbs, steps, active_calories, training_load')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgo)
      .lte('date', date)
      .order('date', { ascending: false }),

    supabase
      .from('scheduled_workouts')
      .select(`id, source, status, external_title, external_type, workouts(name, type, estimated_duration_min)`)
      .eq('user_id', userId)
      .eq('scheduled_date', date)
      .neq('status', 'completed'),

    supabase
      .from('workout_logs')
      .select('rpe_score, duration_min, completed_at, workout_id, workouts(name, type)')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(5),

    supabase
      .from('meal_logs')
      .select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId)
      .eq('date', date),

    supabase
      .from('meal_logs')
      .select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId)
      .eq('date', yesterday),

    supabase
      .from('user_settings')
      .select('daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, weight_goal_lbs, body_fat_goal_pct')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const metrics7d = metrics7dRes.status === 'fulfilled' ? (metrics7dRes.value.data ?? []) : [];
  const todaySchedule = todayScheduleRes.status === 'fulfilled' ? (todayScheduleRes.value.data ?? []) : [];
  const recentLogs = recentLogsRes.status === 'fulfilled' ? (recentLogsRes.value.data ?? []) : [];
  const nutritionToday = nutritionTodayRes.status === 'fulfilled' ? (nutritionTodayRes.value.data ?? []) : [];
  const nutritionYest = nutritionYestRes.status === 'fulfilled' ? (nutritionYestRes.value.data ?? []) : [];
  const settings = settingsRes.status === 'fulfilled' ? settingsRes.value.data : null;

  // Today's metrics (most recent)
  const todayMetrics = metrics7d[0] ?? null;

  // 7-day averages
  const hrv7d = metrics7d.map((m: any) => m.hrv).filter(Boolean);
  const sleep7d = metrics7d.map((m: any) => m.sleep_score).filter(Boolean);
  const weight7d = metrics7d.map((m: any) => m.weight_lbs).filter(Boolean);
  const avg7dHrv = hrv7d.length ? Math.round(hrv7d.reduce((a: number, b: number) => a + b, 0) / hrv7d.length) : null;
  const avg7dSleep = sleep7d.length ? Math.round(sleep7d.reduce((a: number, b: number) => a + b, 0) / sleep7d.length) : null;

  const hrvTrend = calculateTrend(hrv7d);
  const sleepTrend = calculateTrend(sleep7d);
  const weightTrend = calculateTrend(weight7d);

  // Training load: sum(RPE × duration) last 7 days
  const trainingLoad7d = recentLogs.reduce((sum: number, log: any) => {
    return sum + ((log.rpe_score || 5) * (log.duration_min || 45));
  }, 0);

  // Nutrition aggregation
  const sumNutrition = (logs: any[]) => logs.reduce(
    (acc, log) => ({
      calories: acc.calories + (log.calories || 0),
      protein_g: acc.protein_g + (log.protein_g || 0),
      carbs_g: acc.carbs_g + (log.carbs_g || 0),
      fat_g: acc.fat_g + (log.fat_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return {
    date,
    today: {
      metrics: todayMetrics,
      scheduledWorkouts: todaySchedule,
      nutritionLogged: sumNutrition(nutritionToday),
    },
    trends: {
      hrv: {
        value: todayMetrics?.hrv ? `${todayMetrics.hrv}ms` : 'no data',
        direction: hrvTrend.direction,
        avg7d: avg7dHrv,
      },
      sleep: {
        value: todayMetrics?.sleep_score
          ? `${todayMetrics.sleep_score}/100`
          : todayMetrics?.sleep_hours
          ? `${todayMetrics.sleep_hours}h`
          : 'no data',
        direction: sleepTrend.direction,
        avg7d: avg7dSleep,
      },
      weight: {
        value: todayMetrics?.weight_lbs ? `${todayMetrics.weight_lbs} lbs` : 'no data',
        direction: weightTrend.direction,
        trend: weight7d.length > 1 ? `${(weight7d[0] - weight7d[weight7d.length - 1]).toFixed(1)} lbs over 7 days` : 'no trend',
      },
    },
    trainingLoad7d,
    recentWorkouts: recentLogs,
    nutritionYesterday: sumNutrition(nutritionYest),
    goals: {
      weightGoalLbs: settings?.weight_goal_lbs ?? null,
      bodyFatGoalPct: settings?.body_fat_goal_pct ?? null,
      dailyCalories: settings?.daily_calories ?? 2800,
      dailyProteinG: settings?.daily_protein_g ?? 200,
      dailyCarbsG: settings?.daily_carbs_g ?? 300,
      dailyFatG: settings?.daily_fat_g ?? 80,
    },
  };
}
