import { useState } from "react";
import { Material } from "./CsvUploader";

/*
  Tabla editable de materiales del proyecto. Recibe el estado desde el padre y
  le devuelve la lista completa tras una edición o eliminación; así la tabla no
  decide cómo persistir los datos y mantiene una única fuente de verdad.
*/

type MaterialsTableProps = {
  /** Filas que se muestran y se editan en la tabla. */
  materials: Material[];
  /** Categorías disponibles para el selector de edición. */
  categories: string[];
  /** Callback que reemplaza las filas del proyecto en el estado superior. */
  onUpdate: (materials: Material[]) => void;
};

export default function MaterialsTable({
  materials,
  categories,
  onUpdate,
}: MaterialsTableProps) {
  /* Estado transitorio del editor inline: índice y copia modificable de la fila. */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Material | null>(null);

  if (materials.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-[#292e37] bg-[#191d24] p-6 text-center text-sm text-gray-500">
        No materials added yet.
      </div>
    );
  }

  const totalCost = materials.reduce(
    (total, material) =>
      total + material.quantity * material.unit_price,
    0
  );

  function startEditing(index: number) {
    setEditingIndex(index);
    setDraft({ ...materials[index] });
  }

  function saveMaterial() {
    if (!draft || editingIndex === null) return;

    if (!draft.material.trim() || !draft.category.trim()) {
      alert("Please complete the material name and category.");
      return;
    }

    if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) {
      alert("Please enter a valid quantity.");
      return;
    }

    if (!Number.isFinite(draft.unit_price) || draft.unit_price < 0) {
      alert("Please enter a valid unit price.");
      return;
    }

    onUpdate(
      materials.map((material, index) =>
        index === editingIndex
          ? {
              ...draft,
              material: draft.material.trim(),
              category: draft.category.trim(),
            }
          : material
      )
    );
    setEditingIndex(null);
    setDraft(null);
  }

  function deleteMaterial(index: number) {
    if (!window.confirm("Delete this material from the project?")) return;

    onUpdate(materials.filter((_, materialIndex) => materialIndex !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setDraft(null);
    }
  }

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-[#292e37] bg-[#191d24]">
      <div className="border-b border-[#292e37] p-5">
        <h3 className="font-semibold">Project Materials</h3>

        <p className="mt-1 text-sm text-gray-500">
          {materials.length} materials in this project
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#292e37] bg-[#16191f] text-xs uppercase text-gray-500">
            <tr>
              <th className="px-5 py-4">Material</th>
              <th className="px-5 py-4">Category</th>
              <th className="px-5 py-4">Quantity</th>
              <th className="px-5 py-4">Unit</th>
              <th className="px-5 py-4">Unit Price</th>
              <th className="px-5 py-4">Total Cost</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>

          <tbody>
            {materials.map((material, index) => {
              const materialTotal =
                material.quantity * material.unit_price;
              const isEditing = editingIndex === index && draft !== null;

              return (
                <tr
                  key={`${material.material}-${index}`}
                  className="border-b border-[#292e37] last:border-0"
                >
                  <td className="px-5 py-4 font-medium text-white">
                    {isEditing ? (
                      <input
                        value={draft.material}
                        onChange={(event) =>
                          setDraft({ ...draft, material: event.target.value })
                        }
                        className="w-full min-w-32 rounded border border-[#3a414d] bg-[#15181e] px-2 py-1 text-sm text-white outline-none focus:border-[#e5a82b]"
                      />
                    ) : (
                      material.material
                    )}
                  </td>

                  <td className="px-5 py-4 text-gray-400">
                    {isEditing ? (
                      <div className="flex max-w-xs flex-wrap gap-1.5">
                        {categories.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setDraft({ ...draft, category })}
                            className={`rounded-full border px-2 py-1 text-xs transition ${
                              draft.category === category
                                ? "border-[#e5a82b] bg-[#e5a82b] font-semibold text-black"
                                : "border-[#3a414d] bg-[#20242c] text-gray-300 hover:border-[#e5a82b]"
                            }`}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                    ) : (
                      material.category
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={draft.quantity}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            quantity: Number(event.target.value),
                          })
                        }
                        className="w-24 rounded border border-[#3a414d] bg-[#15181e] px-2 py-1 text-sm text-white outline-none focus:border-[#e5a82b]"
                      />
                    ) : (
                      material.quantity
                    )}
                  </td>

                  <td className="px-5 py-4 text-gray-400">
                    {isEditing ? (
                      <select
                        value={draft.unit}
                        onChange={(event) =>
                          setDraft({ ...draft, unit: event.target.value })
                        }
                        className="rounded border border-[#3a414d] bg-[#15181e] px-2 py-1 text-sm text-white outline-none focus:border-[#e5a82b]"
                      >
                        {["pcs", "kg", "lb", "m", "m2", "m3", "ft", "bag", "box", "gal", "L", "ton"].map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    ) : (
                      material.unit
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.unit_price}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            unit_price: Number(event.target.value),
                          })
                        }
                        className="w-28 rounded border border-[#3a414d] bg-[#15181e] px-2 py-1 text-sm text-white outline-none focus:border-[#e5a82b]"
                      />
                    ) : (
                      <>
                        $
                        {material.unit_price.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </>
                    )}
                  </td>

                  <td className="px-5 py-4 font-semibold text-[#e5a82b]">
                    $
                    {(isEditing
                      ? draft.quantity * draft.unit_price
                      : materialTotal
                    ).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveMaterial}
                            className="rounded border border-green-500/30 px-3 py-1 text-xs text-green-400 hover:bg-green-500/10"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingIndex(null);
                              setDraft(null);
                            }}
                            className="rounded border border-[#292e37] px-3 py-1 text-xs hover:bg-[#252a32]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditing(index)}
                            className="rounded border border-[#292e37] px-3 py-1 text-xs hover:bg-[#252a32]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMaterial(index)}
                            className="rounded border border-red-500/30 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot className="bg-[#16191f]">
            <tr>
              <td
                colSpan={6}
                className="px-5 py-4 text-right font-semibold"
              >
                Total Material Cost
              </td>

              <td className="px-5 py-4 font-bold text-[#e5a82b]">
                $
                {totalCost.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}