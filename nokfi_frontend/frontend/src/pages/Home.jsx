import { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { X, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { useLang } from '../context/LangContext';

export default function Home() {
  const { profile, updateProfile } = useOutletContext();
  const { t } = useLang();
  const [cardVisible, setCardVisible] = useState(!profile.welcomeCardDismissed);

  const dismissCard = () => {
    setCardVisible(false);
    updateProfile({ welcomeCardDismissed: true });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Home</h1>

      {cardVisible && (
        <div className="rounded-xl p-5 flex items-start justify-between gap-4"
          style={{ background: 'var(--accent-soft)', border: '0.5px solid var(--accent)' }}>
          <div>
            <h2 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Bienvenido a Nokfi{profile.companyName ? `, ${profile.companyName}` : ''}
            </h2>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{t('home.welcomeCard')}</p>
            <div className="flex gap-2">
              <Link to="/app/cuestionario" className="text-sm font-medium rounded-lg px-4 py-2"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                {t('home.startQuestionnaire')}
              </Link>
              <Link to="/app/excel" className="text-sm font-medium rounded-lg px-4 py-2"
                style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
                {t('home.uploadData')}
              </Link>
            </div>
          </div>
          <button onClick={dismissCard} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={Activity} label={t('home.healthScore')} value="—" hint="Sin datos aún" />
        <KpiCard icon={AlertTriangle} label={t('home.activeAlerts')} value="0" hint="Todo en orden" />
        <KpiCard icon={TrendingUp} label={t('home.lastAnalysis')} value="—" hint="Ningún análisis todavía" />
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--text-muted)' }}>
        <Icon size={16} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</div>
    </div>
  );
}
