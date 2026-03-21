'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

interface MealTemplate {
  id: string;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  category: string;
}

interface QuickMealLogProps {
  templates: MealTemplate[];
  onLog: (template: MealTemplate) => Promise<void>;
}

const categoryOrder = ['breakfast', 'lunch', 'dinner', 'pre-workout', 'post-workout', 'snack'];
const categoryLabel: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  'pre-workout': 'Pre-Workout',
  'post-workout': 'Post-Workout',
  snack: 'Snack',
};

export default function QuickMealLog({ templates, onLog }: QuickMealLogProps) {
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);

  const grouped = categoryOrder.reduce<Record<string, MealTemplate[]>>((acc, cat) => {
    const items = templates.filter(t => t.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const handleLog = async (template: MealTemplate) => {
    setLogging(template.id);
    await onLog(template);
    setLogging(null);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--bg-elevated)',
          border: '1px dashed var(--border)',
          borderRadius: '10px',
          padding: '12px 16px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          width: '100%',
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 500,
          fontSize: '14px',
          marginTop: '8px',
        }}
      >
        <Plus size={16} color="var(--accent)" />
        <span style={{ color: 'var(--accent)' }}>Log Meal</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-elevated)',
              borderRadius: '16px 16px 0 0',
              padding: '20px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 700,
                fontSize: '18px',
                color: 'var(--text-primary)',
                margin: 0,
              }}>Log Meal</h3>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >×</button>
            </div>

            {Object.keys(grouped).length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                No meal templates yet. Add some in the Nutrition tab.
              </p>
            )}

            {categoryOrder.map(cat => {
              const items = grouped[cat];
              if (!items) return null;
              return (
                <div key={cat} style={{ marginBottom: '16px' }}>
                  <p style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontWeight: 600,
                    fontSize: '11px',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                    margin: '0 0 8px',
                  }}>{categoryLabel[cat]}</p>
                  {items.map(template => (
                    <button
                      key={template.id}
                      onClick={() => handleLog(template)}
                      disabled={logging === template.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        marginBottom: '6px',
                        cursor: logging ? 'not-allowed' : 'pointer',
                        opacity: logging === template.id ? 0.5 : 1,
                        textAlign: 'left',
                      }}
                    >
                      <span style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontWeight: 500,
                        fontSize: '14px',
                        color: 'var(--text-primary)',
                      }}>
                        {logging === template.id ? 'Logging...' : template.name}
                      </span>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        {template.protein_g != null && (
                          <span style={{
                            background: 'rgba(34,197,94,0.15)',
                            color: '#22C55E',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontFamily: 'Space Grotesk, sans-serif',
                            fontWeight: 600,
                          }}>P{Math.round(template.protein_g)}g</span>
                        )}
                        {template.calories != null && (
                          <span style={{
                            background: 'rgba(232,255,61,0.1)',
                            color: 'var(--accent)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontFamily: 'Space Grotesk, sans-serif',
                            fontWeight: 600,
                          }}>{template.calories}kcal</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
