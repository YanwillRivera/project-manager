"use client";

/*
  Formulario controlado para añadir una única fila de material. El componente
  valida los campos numéricos antes de delegar la inserción al padre y reinicia
  sus controles únicamente cuando la operación se acepta.
*/

import { useMemo, useState } from "react";
import { Material } from "./CsvUploader";

type ManualMaterialFormProps = {
  /** Añade las filas aceptadas al proyecto activo. */
  onAdd: (materials: Material[]) => void;
  /** Categorías disponibles para sugerencias y selección. */
  categories: string[];
  /** Se usa para no proponer ni insertar duplicados. */
  existingMaterials: Material[];
  /** Ajusta las recomendaciones del catálogo al tipo de obra. */
  projectType: string;
};

type MaterialDraft = {
  material: string;
  category: string;
  unit: string;
  quantity: string;
  unit_price: string;
};

const MATERIAL_CATALOG = [
  ["Cement", "Concrete", "bag"],
  ["Concrete mix", "Concrete", "bag"],
  ["Concrete blocks", "Concrete", "pcs"],
  ["Gravel", "Concrete", "ton"],
  ["Sand", "Concrete", "ton"],
  ["Lumber screws", "Lumber", "box"],
  ["Plywood", "Lumber", "pcs"],
  ["Drywall screws", "Drywall", "box"],
  ['Stud 1/2"', "Drywall", "pcs"],
  ['Track 1/2"', "Drywall", "pcs"],
  ['Drywall sheet 4 x 8 x 1/2"', "Drywall", "pcs"],
  ["Drywall joint compound", "Drywall", "gal"],
  ["Drywall tape", "Drywall", "roll"],
  ["Insulation batts", "Drywall", "pcs"],
  ["Electrical wire", "Electrical", "ft"],
  ["Electrical conduit", "Electrical", "ft"],
  ["Electrical boxes", "Electrical", "pcs"],
  ["Outlets", "Electrical", "pcs"],
] as const;

const units = ["pcs", "kg", "lb", "m", "m2", "m3", "ft", "bag", "box", "gal", "L", "ton"];

export default function ManualMaterialForm({
  onAdd,
  categories,
  existingMaterials,
  projectType,
}: ManualMaterialFormProps) {
  /*
    Selector controlado de materiales recomendados. Mantiene selecciones y
    borradores locales hasta que todas las filas pasan la validación y se
    entregan juntas mediante onAdd.
  */
  /* Selección múltiple y borradores por nombre permiten preparar varias filas. */
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MaterialDraft>>({});

  const materialOptions = useMemo(() => {
    /* Combina catálogo fijo con materiales ya conocidos y elimina opciones repetidas. */
    const catalog = MATERIAL_CATALOG
      .filter(([, category]) => categories.includes(category))
      .map(([material, category, unit]) => ({ material, category, unit }));
    const saved = existingMaterials
      .filter((item) => item.material.trim())
      .map((item) => ({
        material: item.material.trim(),
        category: item.category,
        unit: item.unit || "pcs",
      }));
    const options = [...catalog, ...saved];

    const recommendedByType: Record<string, string[]> = {
      Residential: ["Cement", "Lumber", "Drywall", "Electrical wire"],
      Commercial: ["Concrete mix", "Rebar", "Drywall", "Electrical conduit"],
      Industrial: ["Concrete mix", "Rebar", "Electrical conduit"],
      Renovation: ["Drywall", "Drywall screws", "Drywall joint compound", "Electrical wire"],
      Infrastructure: ["Concrete mix", "Rebar", "Gravel", "Sand"],
    };
    const recommended = recommendedByType[projectType] ?? [];

    return options.filter(
      (item, index) =>
        options.findIndex(
          (candidate) =>
            candidate.material.toLowerCase() === item.material.toLowerCase()
        ) === index
    ).sort(
      (a, b) =>
        Number(recommended.includes(b.material)) -
        Number(recommended.includes(a.material))
    );
  }, [categories, existingMaterials, projectType]);

  function selectMaterial(material: string, category: string, unit: string) {
    setSelectedNames((current) =>
      current.includes(material)
        ? current.filter((name) => name !== material)
        : [...current, material]
    );
    setDrafts((current) => ({
      ...current,
      [material]: current[material] ?? {
        material,
        category: categories.includes(category) ? category : categories[0] ?? "",
        unit: units.includes(unit) ? unit : "pcs",
        quantity: "",
        unit_price: "",
      },
    }));
  }

  function updateDraft(material: string, updates: Partial<MaterialDraft>) {
    setDrafts((current) => ({
      ...current,
      [material]: { ...current[material], ...updates },
    }));
  }

  function removeSelectedMaterial(material: string) {
    setSelectedNames((current) =>
      current.filter((name) => name !== material)
    );
    setDrafts((current) => {
      const next = { ...current };
      delete next[material];
      return next;
    });
  }

  function clearSelectedMaterials() {
    setSelectedNames([]);
    setDrafts({});
  }

  function addMaterial() {
    /* Valida todas las filas antes de insertar para evitar lotes parciales. */
    if (selectedNames.length === 0) {
      alert("Select at least one material.");
      return;
    }

    const materials: Material[] = [];
    for (const name of selectedNames) {
      const draft = drafts[name];
      const quantity = Number(draft.quantity);
      const unitPrice = Number(draft.unit_price);

      if (
        !draft.category ||
        !draft.quantity ||
        quantity <= 0 ||
        !draft.unit_price ||
        unitPrice < 0
      ) {
        alert(`Complete category, quantity, and unit price for ${name}.`);
        return;
      }

      materials.push({
        material: draft.material,
        category: draft.category,
        unit: draft.unit,
        quantity,
        unit_price: unitPrice,
      });
    }

    onAdd(materials);
    setSelectedNames([]);
    setDrafts({});
  }

  return (
    <div className="rounded-xl border border-dashed border-[#3a414d] bg-[#191d24] p-5">
      <label className="mb-3 block text-sm font-medium">
        Add Materials Manually
      </label>
      <p className="mb-4 text-xs text-gray-500">
        Materials are ordered by relevance for this project type. Select one or more, then complete their quantity and unit price below.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {materialOptions.map((option) => {
          const isSelected = selectedNames.includes(option.material);
          return (
            <button
              key={option.material}
              type="button"
              onClick={() =>
                selectMaterial(option.material, option.category, option.unit)
              }
              className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition ${
                isSelected
                  ? "border-[#e5a82b] bg-[#e5a82b]/10 text-white"
                  : "border-[#292e37] bg-[#15181e] text-gray-300 hover:border-[#e5a82b]"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${
                  isSelected
                    ? "border-[#e5a82b] bg-[#e5a82b] text-black"
                    : "border-[#596273]"
                }`}
              >
                {isSelected ? "✓" : ""}
              </span>
              <span>
                <span className="block">{option.material}</span>
                <span className="block text-xs text-gray-500">
                  {option.category}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selectedNames.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-lg border border-[#292e37]">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.8fr_1fr_40px] gap-2 bg-[#15181e] px-3 py-2 text-xs text-gray-500">
              <span>Material</span>
              <span>Category</span>
              <span>Quantity</span>
              <span>Unit</span>
              <span>Unit price</span>
              <span aria-hidden="true" />
            </div>
            {selectedNames.map((name) => {
              const draft = drafts[name];
              return (
                <div
                  key={name}
                  className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.8fr_1fr_40px] gap-2 border-t border-[#292e37] px-3 py-3"
                >
                  <input
                    type="text"
                    aria-label={`Material name for ${name}`}
                    value={draft.material}
                    onChange={(event) =>
                      updateDraft(name, { material: event.target.value })
                    }
                    className="min-w-0 rounded border border-[#292e37] bg-[#15181e] px-2 py-1 text-sm text-white outline-none focus:border-[#e5a82b]"
                  />
                  <div>
                    <span className="inline-flex rounded-full border border-[#e5a82b] bg-[#e5a82b]/10 px-2 py-1 text-xs text-[#f0b83d]">
                      {draft.category || "Uncategorized"}
                    </span>
                    <span className="mt-1 block text-[10px] text-gray-500">
                      Automatically assigned
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    placeholder="Qty"
                    value={draft.quantity}
                    onChange={(event) =>
                      updateDraft(name, { quantity: event.target.value })
                    }
                    className="rounded border border-[#292e37] bg-[#15181e] px-2 py-1 text-sm text-white outline-none focus:border-[#e5a82b]"
                  />
                  <select
                    value={draft.unit}
                    onChange={(event) =>
                      updateDraft(name, { unit: event.target.value })
                    }
                    className="rounded border border-[#292e37] bg-[#15181e] px-2 py-1 text-sm text-white outline-none focus:border-[#e5a82b]"
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    placeholder="Price"
                    value={draft.unit_price}
                    onChange={(event) =>
                      updateDraft(name, { unit_price: event.target.value })
                    }
                    className="rounded border border-[#292e37] bg-[#15181e] px-2 py-1 text-sm text-white outline-none focus:border-[#e5a82b]"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${name} from selected materials`}
                    title="Remove from selection"
                    onClick={() => removeSelectedMaterial(name)}
                    className="self-center rounded px-2 py-1 text-lg leading-none text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={addMaterial}
          disabled={selectedNames.length === 0}
          className="flex-1 rounded-lg bg-[#e5a82b] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#f0b83d] disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add Selected Materials
          {selectedNames.length > 0 ? ` (${selectedNames.length})` : ""}
        </button>
        <button
          type="button"
          onClick={clearSelectedMaterials}
          disabled={selectedNames.length === 0}
          className="rounded-lg border border-[#3a414d] px-4 py-2 text-sm text-gray-300 transition hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
}
