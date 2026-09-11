"use client";

// React: useState nos permite guardar información que cambia en la aplicación
import { useState } from "react";

// Componente para importar archivos CSV y tipo Material
import CsvUploader, { Material } from "../components/CsvUploader";

// Componente que muestra la tabla de materiales importados
import MaterialsTable from "../components/MaterialsTable";

// Gráficas del dashboard
import BudgetChart from "../components/BudgetChart";
import MaterialCostChart from "../components/MaterialCostChart";

// Calculadora de costos de proyectos
import CostCalculator from "../components/CostCalculator";

export default function Home() {
  // =====================================================
  // STATE / ESTADOS DE LA APLICACIÓN
  // =====================================================

  // Guarda qué vista está activa:
  // "dashboard" = Dashboard principal
  // "calculator" = Calculadora de costos
  const [activeView, setActiveView] = useState("dashboard");

  // Guarda el presupuesto del proyecto
  const [budget, setBudget] = useState(50000);

  // Guarda los materiales que vienen del archivo CSV
  const [materials, setMaterials] = useState<Material[]>([]);

  // =====================================================
  // CÁLCULOS DEL DASHBOARD
  // =====================================================

  // Calcula cuánto dinero se ha invertido en materiales
  //
  // Por cada material:
  // quantity × unit_price
  //
  // Después suma todos los materiales
  const invested = materials.reduce(
    (total, material) =>
      total + material.quantity * material.unit_price,
    0
  );

  // Calcula cuánto dinero queda del presupuesto
  const remaining = budget - invested;

  // Calcula qué porcentaje del presupuesto se ha utilizado
  const percentUsed =
    budget > 0 ? (invested / budget) * 100 : 0;

  return (
    <main className="min-h-screen bg-[#0f1115] text-white">
      <div className="flex">
        {/* =====================================================
            SIDEBAR / MENÚ LATERAL
           ===================================================== */}
        <aside className="min-h-screen w-64 border-r border-[#292e37] bg-[#15181e] p-5">

          {/* Logo y nombre de la aplicación */}
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e5a82b] font-bold text-black">
              PM
            </div>

            <div>
              <h1 className="text-sm font-bold tracking-wide">
                PROJECT MANAGER
              </h1>

              <p className="text-xs text-gray-500">
                Construction Management
              </p>
            </div>
          </div>

          {/* Navegación */}
          <nav className="space-y-2 text-sm">

            {/* Botón Dashboard */}
            <button
              onClick={() => setActiveView("dashboard")}
              className={`w-full rounded-lg px-4 py-3 text-left transition ${
                activeView === "dashboard"
                  ? "bg-[#252a32] text-white"
                  : "text-gray-400 hover:bg-[#20242c]"
              }`}
            >
              ▦ Dashboard
            </button>

            {/* Por ahora Projects todavía no tiene funcionalidad */}
            <button className="w-full rounded-lg px-4 py-3 text-left text-gray-400 hover:bg-[#20242c]">
              ▣ Projects
            </button>

            {/* Botón Cost Calculator */}
            <button
              onClick={() => setActiveView("calculator")}
              className={`w-full rounded-lg px-4 py-3 text-left transition ${
                activeView === "calculator"
                  ? "bg-[#252a32] text-white"
                  : "text-gray-400 hover:bg-[#20242c]"
              }`}
            >
              ∑ Cost Calculator
            </button>

            {/* Por ahora Materials todavía no tiene funcionalidad */}
            <button className="w-full rounded-lg px-4 py-3 text-left text-gray-400 hover:bg-[#20242c]">
              ▤ Materials
            </button>
          </nav>
        </aside>

        {/* =====================================================
            CONTENIDO PRINCIPAL
           ===================================================== */}
        <section className="flex-1 p-8">

          {/* =====================================================
              DASHBOARD
              
              Se muestra solamente cuando:
              activeView === "dashboard"
             ===================================================== */}
          {activeView === "dashboard" ? (
            <>
              {/* Título del Dashboard */}
              <header className="mb-8">
                <h2 className="text-3xl font-bold">
                  Dashboard
                </h2>

                <p className="mt-2 text-sm text-gray-400">
                  Overview of your construction projects and material costs.
                </p>
              </header>

              {/* =====================================================
                  IMPORTAR ARCHIVO CSV
                  
                  Cuando se importa el archivo:
                  CsvUploader → setMaterials → materials[]
                 ===================================================== */}
              <CsvUploader
                onMaterialsLoaded={setMaterials}
              />

              {/* =====================================================
                  PRESUPUESTO DEL PROYECTO
                 ===================================================== */}
              <div className="mb-6 max-w-xs">
                <label className="mb-2 block text-sm text-gray-400">
                  Project Budget
                </label>

                <input
                  type="number"
                  value={budget}
                  onChange={(e) =>
                    setBudget(Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-[#292e37] bg-[#191d24] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
                />
              </div>

              {/* =====================================================
                  TARJETAS DE RESUMEN
                 ===================================================== */}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

                {/* Presupuesto total */}
                <DashboardCard
                  title="Project Budget"
                  value={`$${budget.toLocaleString()}`}
                />

                {/* Total invertido en materiales */}
                <DashboardCard
                  title="Material Cost"
                  value={`$${invested.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
                />

                {/* Presupuesto restante */}
                <DashboardCard
                  title="Remaining Budget"
                  value={`$${remaining.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
                />

                {/* Porcentaje del presupuesto utilizado */}
                <DashboardCard
                  title="Budget Used"
                  value={`${percentUsed.toFixed(2)}%`}
                />
              </div>

              {/* =====================================================
                  GRÁFICAS
                  
                  En pantallas grandes:
                  [ Gráfica 1 ] [ Gráfica 2 ]
                  
                  En pantallas pequeñas:
                  [ Gráfica 1 ]
                  [ Gráfica 2 ]
                 ===================================================== */}
              <div className="mt-6 grid gap-6 xl:grid-cols-2">

                {/* Compara presupuesto vs inversión */}
                <BudgetChart
                  budget={budget}
                  invested={invested}
                />

                {/* Muestra el costo de cada material */}
                <MaterialCostChart
                  materials={materials}
                />
              </div>

              {/* =====================================================
                  TABLA DE MATERIALES
                  
                  Muestra todos los materiales importados
                  desde el archivo CSV
                 ===================================================== */}
              <MaterialsTable
                materials={materials}
              />
            </>
          ) : (
            <>
              {/* =====================================================
                  COST CALCULATOR
                  
                  Se muestra cuando:
                  activeView === "calculator"
                 ===================================================== */}
              <CostCalculator />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

// =====================================================
// COMPONENTE REUTILIZABLE PARA LAS TARJETAS DEL DASHBOARD
// =====================================================

type DashboardCardProps = {
  title: string;
  value: string;
};

function DashboardCard({
  title,
  value,
}: DashboardCardProps) {
  return (
    <div className="rounded-xl border border-[#292e37] bg-[#191d24] p-5">

      {/* Nombre de la métrica */}
      <p className="text-sm text-gray-400">
        {title}
      </p>

      {/* Valor de la métrica */}
      <p className="mt-4 text-2xl font-bold">
        {value}
      </p>
    </div>
  );
}