import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelSalidaServicios() {
  return (
    <ExcelSubModule
      moduleId="servicios"
      chartType="pie"
      promptBase="Eres un consultor de operaciones para pymes españolas. Analiza qué parte del almacén se ha destinado a servicios: distribución por tipo de servicio y eficiencia de uso."
    />
  );
}
