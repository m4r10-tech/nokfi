import { Link } from 'react-router-dom';
import { Package, ShoppingCart, Wrench, TruckIcon, Wallet, PieChart, ArrowRight, FolderOpen } from 'lucide-react';
import { useLang } from '../context/LangContext';
import PageHeader from '../components/PageHeader';

const MODULES = [
  { to: '/app/excel/excel-stock-almacen', icon: Package, id: 'stock' },
  { to: '/app/excel/excel-salida-ventas', icon: ShoppingCart, id: 'ventas' },
  { to: '/app/excel/excel-salida-servicios', icon: Wrench, id: 'servicios' },
  { to: '/app/excel/excel-entrada-productos', icon: TruckIcon, id: 'entradas' },
  { to: '/app/excel/excel-caja', icon: Wallet, id: 'caja' },
  { to: '/app/excel/excel-total', icon: PieChart, id: 'total' }
];

export default function ExcelHub() {
  const { t } = useLang();
  return (
    <div>
      <PageHeader title={t('excel.hubTitle')} description={t('excel.hubDesc')} />

      {/* F3 (sesión 4): analizar una carpeta entera con una petición libre. */}
      <Link to="/app/excel/carpeta" className="group card card-interactive anim-enter p-4 md:p-5 mb-4 flex items-center gap-4"
        style={{ borderColor: 'var(--border-strong)' }}>
        <FolderOpen size={20} className="shrink-0" style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('folder.hubTitle')}</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t('folder.hubDesc')}</p>
        </div>
        <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--text-muted)' }} />
      </Link>

      <ul className="card divide-y" style={{ borderColor: 'var(--border)' }}>
        {MODULES.map(({ to, icon: Icon, id }) => (
          <li key={to} style={{ borderColor: 'var(--border)' }}>
            <Link to={to} className="group nav-item flex items-center gap-3.5 px-4 md:px-5 py-3.5">
              <Icon size={18} className="shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t(`excelModules.${id}.title`)}</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t(`excelModules.${id}.desc`)}</p>
              </div>
              <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--text-muted)' }} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
