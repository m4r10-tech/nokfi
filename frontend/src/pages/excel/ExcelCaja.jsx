import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelCaja() {
  return (
    <ExcelSubModule
      moduleId="caja"
      chartType="line"
      promptBase="Eres un consultor financiero para pymes españolas. Analiza los movimientos de caja: evolución del saldo, entradas/salidas de efectivo y cualquier anomalía relevante."
    />
  );
}
