import { useLang } from '../context/LangContext';

/**
 * C1 — Nota de salud financiera 0-100 (sesión 4). La calcula el BACKEND con
 * reglas fijas (utils/healthScore.js) a partir de las respuestas del
 * Cuestionario: aquí solo se pinta, con el desglose de por qué se pierden
 * puntos. Nada de cifras inventadas por la IA.
 */
export function healthTone(score) {
  if (score >= 80) return { color: 'var(--positive)', band: 'excellent' };
  if (score >= 60) return { color: 'var(--accent-text)', band: 'good' };
  if (score >= 40) return { color: 'var(--warning)', band: 'fair' };
  return { color: 'var(--negative)', band: 'poor' };
}

export function ScoreRing({ score, size = 88, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const { color } = healthTone(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${score}/100`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 900ms var(--ease-out)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.3} fontWeight="600" fill="var(--text-primary)">{score}</text>
    </svg>
  );
}

export default function HealthScore({ health, compact = false }) {
  const { t } = useLang();
  if (!health || typeof health.score !== 'number') return null;
  const { band } = healthTone(health.score);
  const lost = (health.lost || []).slice(0, compact ? 3 : 5);
  const sections = Object.entries(health.sections || {});

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={health.score} size={compact ? 72 : 88} />
        <div className="min-w-0">
          <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t(`report.health_${band}`)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('report.healthExplain')}</p>
        </div>
      </div>

      {!compact && sections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {sections.map(([key, v]) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                <span>{t(`questionnaire.sections.${key}`)}</span><span className="tabular">{v}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${v}%`, background: healthTone(v).color, transition: 'width 700ms var(--ease-out)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {lost.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>{t('report.healthLost')}</p>
          <ul className="flex flex-col gap-1.5">
            {lost.map(l => (
              <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>{t(`questionnaire.items.${l.id}`)}</span>
                <span className="tabular text-xs font-medium shrink-0" style={{ color: 'var(--negative)' }}>−{l.points}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
