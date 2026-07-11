import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelCaja() {
  return (
    <ExcelSubModule
      title="Caja"
      description="Sube los movimientos de caja para analizar la evolución del saldo y detectar anomalías."
      chartType="line"
      promptBase="Eres un consultor financiero para pymes españolas. Analiza los movimientos de caja: evolución del saldo, entradas/salidas de efectivo y cualquier anomalía relevante."
    />
  );
}
