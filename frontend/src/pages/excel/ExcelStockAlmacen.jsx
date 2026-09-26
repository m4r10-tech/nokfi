import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelStockAlmacen() {
  return (
    <ExcelSubModule
      moduleId="stock"
      chartType="bar"
      promptBase="Eres un consultor de gestión de inventario para pymes españolas. Analiza los datos de stock/almacén que se han subido: cantidades por producto, posibles excesos o roturas de stock, y rotación."
    />
  );
}
