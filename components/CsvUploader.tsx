"use client";

import { useState } from "react";
import Papa from "papaparse";

export type Material = {
  material: string;
  category: string;
  unit: string;
  quantity: number;
  unit_price: number;
};

type CsvUploaderProps = {
  onMaterialsLoaded: (materials: Material[]) => void;
};

export default function CsvUploader({
  onMaterialsLoaded,
}: CsvUploaderProps) {
  const [fileName, setFileName] = useState("");
  const [isImported, setIsImported] = useState(false);

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setFileName(file.name);
    setIsImported(false);

    Papa.parse<Material>(file, {
      header: true,
      skipEmptyLines: true,

      complete: (results) => {
        const materials = results.data.map((material) => ({
          ...material,
          quantity: Number(material.quantity),
          unit_price: Number(material.unit_price),
        }));

        onMaterialsLoaded(materials);
        setIsImported(true);
      },
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-dashed border-[#3a414d] bg-[#191d24] p-5">
      <label className="mb-3 block text-sm font-medium">
        Import Materials
      </label>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-400
          file:mr-4 file:rounded-lg file:border-0
          file:bg-[#e5a82b] file:px-4 file:py-2
          file:font-semibold file:text-black
          hover:file:bg-[#f0b83d]"
        />

        {isImported && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-lg font-bold text-green-400">
            ✓
          </span>
        )}
      </div>

      {isImported ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-gray-400">{fileName}</span>
          <span className="font-medium text-green-400">
            ✓ Imported successfully
          </span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-500">
          Upload a CSV file containing your project materials.
        </p>
      )}
    </div>
  );
}