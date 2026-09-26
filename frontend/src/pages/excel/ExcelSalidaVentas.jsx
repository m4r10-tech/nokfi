import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelSalidaVentas() {
  return (
    <ExcelSubModule
      moduleId="ventas"
      chartType="bar"
      promptBase="Eres un consultor de ventas para pymes españolas. Analiza qué productos han salido del almacén destinados a ventas: identifica los más y menos vendidos, tendencias y oportunidades."
    />
  );
}
