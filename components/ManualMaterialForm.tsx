"use client";

/*
  Formulario para añadir un material a mano
  (cuando no viene en el CSV).
*/

import { useState } from "react";
import { Material } from "./CsvUploader";

type ManualMaterialFormProps = {
  onAdd: (material: Material) => void;
  categories: string[];
};

const emptyForm = {
  material: "",
  category: "",
  unit: "pcs",
  quantity: "",
  unit_price: "",
};

export default function ManualMaterialForm({
  onAdd,
  categories,
}: ManualMaterialFormProps) {
  const [form, setForm] = useState(emptyForm);

  /* Valida los campos y envía el material al proyecto. */
  function addMaterial() {
    if (!form.material.trim()) {
      alert("Please enter a material name.");
      return;
    }

    if (!form.category.trim()) {
      alert("Please enter a material category.");
      return;
    }

    const quantity = Number(form.quantity);
    const unitPrice = Number(form.unit_price);

    if (!form.quantity || quantity <= 0) {
      alert("Please enter a valid quantity.");
      return;
    }

    if (!form.unit_price || unitPrice < 0) {
      alert("Please enter a valid unit price.");
      return;
    }

    onAdd({
      material: form.material.trim(),
      category: form.category.trim(),
      unit: form.unit,
      quantity,
      unit_price: unitPrice,
    });

    setForm(emptyForm);
  }

  return (
    <div className="rounded-xl border border-dashed border-[#3a414d] bg-[#191d24] p-5">
      <label className="mb-3 block text-sm font-medium">
        Add Material Manually
      </label>

      <p className="mb-4 text-xs text-gray-500">
        Use this for extra items that are not in the CSV.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          id="manual-material-name"
          type="text"
          placeholder="Material name"
          value={form.material}
          onChange={(event) =>
            setForm({ ...form, material: event.target.value })
          }
          className="rounded-lg border border-[#292e37] bg-[#15181e] px-3 py-2 text-sm text-white outline-none focus:border-[#e5a82b]"
        />

        <div className="rounded-lg border border-[#292e37] bg-[#15181e] px-3 py-2 sm:col-span-2">
          <p className="mb-2 text-sm text-gray-400">Category</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {categories.map((category) => (
              <li key={category}>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, category })}
                  className={`rounded-full border px-3 py-1.5 transition ${
                    form.category === category
                      ? "border-[#e5a82b] bg-[#e5a82b] font-semibold text-black"
                      : "border-[#3a414d] bg-[#20242c] text-gray-300 hover:border-[#e5a82b] hover:text-white"
                  }`}
                >
                  {category}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <input
          type="number"
          placeholder="Quantity"
          value={form.quantity}
          onChange={(event) =>
            setForm({ ...form, quantity: event.target.value })
          }
          className="rounded-lg border border-[#292e37] bg-[#15181e] px-3 py-2 text-sm text-white outline-none focus:border-[#e5a82b]"
        />

        <select
          value={form.unit}
          onChange={(event) =>
            setForm({ ...form, unit: event.target.value })
          }
          className="rounded-lg border border-[#292e37] bg-[#15181e] px-3 py-2 text-sm text-white outline-none focus:border-[#e5a82b]"
        >
          <option value="pcs">pcs</option>
          <option value="kg">kg</option>
          <option value="lb">lb</option>
          <option value="m">m</option>
          <option value="m2">m²</option>
          <option value="m3">m³</option>
          <option value="ft">ft</option>
          <option value="bag">bag</option>
          <option value="box">box</option>
          <option value="gal">gal</option>
          <option value="L">L</option>
          <option value="ton">ton</option>
        </select>

        <input
          type="number"
          placeholder="Unit price"
          value={form.unit_price}
          onChange={(event) =>
            setForm({ ...form, unit_price: event.target.value })
          }
          className="rounded-lg border border-[#292e37] bg-[#15181e] px-3 py-2 text-sm text-white outline-none focus:border-[#e5a82b] sm:col-span-2"
        />
      </div>

      <button
        type="button"
        onClick={addMaterial}
        className="mt-4 w-full rounded-lg bg-[#e5a82b] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#f0b83d]"
      >
        + Add Material
      </button>
    </div>
  );
}
