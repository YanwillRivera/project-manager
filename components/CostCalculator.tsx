"use client";

/*
  Calculadora independiente:
  estima costos sin guardar el resultado en un proyecto.
*/

import { useState } from "react";

type CalculatorMaterial = {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
};

export default function CostCalculator() {
  const [materialName, setMaterialName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");

  /* Lista temporal de materiales solo para esta estimación. */
  const [calculatorMaterials, setCalculatorMaterials] = useState<
    CalculatorMaterial[]
  >([]);

  /* Añade una línea a la estimación y limpia los inputs. */
  function addMaterial() {
    const newMaterial: CalculatorMaterial = {
      id: Date.now(),
      name: materialName,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
    };

    setCalculatorMaterials([
      ...calculatorMaterials,
      newMaterial,
    ]);

    // Clear inputs after adding
    setMaterialName("");
    setQuantity("");
    setUnitPrice("");
  }

  const totalCost = calculatorMaterials.reduce(
    (total, material) =>
      total + material.quantity * material.unitPrice,
    0
  );

  return (
    <div className="rounded-xl border border-[#292e37] bg-[#191d24] p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold">
          Project Cost Calculator
        </h2>

        <p className="mt-2 text-sm text-gray-400">
          Add materials to estimate the total cost of a project.
        </p>
      </div>

      {/* Inputs */}
      <div className="grid gap-4 md:grid-cols-4">
        <input
          type="text"
          placeholder="Material name"
          value={materialName}
          onChange={(e) => setMaterialName(e.target.value)}
          className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
        />

        <input
          type="number"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
        />

        <input
          type="number"
          placeholder="Unit price"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
        />

        <button
          onClick={addMaterial}
          className="rounded-lg bg-[#e5a82b] px-4 py-3 font-semibold text-black transition hover:bg-[#f0b83d]"
        >
          + Add Material
        </button>
      </div>

      {/* Empty State */}
      {calculatorMaterials.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-[#292e37] p-8 text-center text-sm text-gray-500">
          Add materials above to start calculating your project cost.
        </div>
      ) : (
        <>
          {/* Calculator Table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#292e37] text-gray-400">
                <tr>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Unit Price</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>

              <tbody>
                {calculatorMaterials.map((material) => {
                  const materialTotal =
                    material.quantity * material.unitPrice;

                  return (
                    <tr
                      key={material.id}
                      className="border-b border-[#292e37]"
                    >
                      <td className="px-4 py-4 font-medium">
                        {material.name}
                      </td>

                      <td className="px-4 py-4">
                        {material.quantity}
                      </td>

                      <td className="px-4 py-4">
                        ${material.unitPrice.toFixed(2)}
                      </td>

                      <td className="px-4 py-4 font-semibold text-[#e5a82b]">
                        ${materialTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="mt-6 flex items-center justify-between rounded-lg border border-[#292e37] bg-[#15181e] p-5">
            <span className="font-semibold text-gray-400">
              Total Project Cost
            </span>

            <span className="text-2xl font-bold text-[#e5a82b]">
              ${totalCost.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}