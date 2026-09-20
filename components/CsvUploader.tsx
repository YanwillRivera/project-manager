"use client";

/*
  Importa materiales desde un archivo CSV.

  Columnas esperadas:
  material, category, unit, quantity, unit_price
*/

import { useState } from "react";
import Papa from "papaparse";

/* Estructura de un material dentro de un proyecto. */
export type Material = {
  material: string;
  category: string;
  unit: string;
  quantity: number;
  unit_price: number;
};

type CsvUploaderProps = {
  /* Recibe las filas parseadas para sumarlas al proyecto. */
  onMaterialsLoaded: (materials: Material[]) => void;
  /* Materiales actuales para evitar volver a importar filas existentes. */
  existingMaterials: Material[];
};

const REQUIRED_COLUMNS = [
  /* El encabezado se normaliza antes de compararlo para tolerar espacios y BOM. */
  "material",
  "category",
  "unit",
  "quantity",
  "unit_price",
] as const;

type CsvError = {
  row?: number;
  message: string;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/* Firma estable para comparar materiales importados y manuales. */
export function getMaterialSignature(material: Material) {
  return JSON.stringify([
    normalizeText(material.material),
    normalizeText(material.category),
    normalizeText(material.unit),
    material.quantity,
    material.unit_price,
  ]);
}

export default function CsvUploader({
  onMaterialsLoaded,
  existingMaterials,
}: CsvUploaderProps) {
  /* Estado de feedback de archivo; los materiales definitivos viven en Home. */
  const [fileName, setFileName] = useState("");
  const [isImported, setIsImported] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [errors, setErrors] = useState<CsvError[]>([]);

  /* Lee, valida y avisa al padre solo de las filas válidas. */
  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setFileName(file.name);
    setIsImported(false);
    setImportedCount(0);
    setErrors([]);

    Papa.parse<Record<string, string | string[]>>(file, {
      /* Papa Parse conserva encabezados para validar y mapear columnas por nombre. */
      header: true,
      skipEmptyLines: true,

      complete: (results) => {
        const validationErrors: CsvError[] = results.errors.map((error) => ({
          row: typeof error.row === "number" ? error.row + 2 : undefined,
          message: error.message,
        }));
        const fields = results.meta.fields ?? [];
        /* El mapa permite aceptar encabezados con mayúsculas, espacios o BOM. */
        const columnNames = new Map(
          fields.map((field) => [normalizeText(field.replace(/^\uFEFF/, "")), field])
        );
        const missingColumns = REQUIRED_COLUMNS.filter(
          (column) => !columnNames.has(column)
        );

        if (missingColumns.length > 0) {
          setErrors([
            ...validationErrors,
            {
              message: `Missing required column(s): ${missingColumns.join(", ")}.`,
            },
          ]);
          return;
        }

        const existingSignatures = new Set(
          existingMaterials.map(getMaterialSignature)
        );
        const importedSignatures = new Set(existingSignatures);
        const validMaterials: Material[] = [];

        results.data.forEach((row, index) => {
          /* Cada fila se valida de forma independiente para importar las válidas. */
          const rowNumber = index + 2;
          const valueFor = (column: (typeof REQUIRED_COLUMNS)[number]) =>
            row[columnNames.get(column) ?? ""];
          const material = String(valueFor("material") ?? "").trim();
          const category = String(valueFor("category") ?? "").trim();
          const unit = String(valueFor("unit") ?? "").trim();
          const quantityText = String(valueFor("quantity") ?? "").trim();
          const unitPriceText = String(valueFor("unit_price") ?? "").trim();
          const quantity = Number(quantityText);
          const unitPrice = Number(unitPriceText);
          const rowMessages: string[] = [];

          if (!material) rowMessages.push("material is required");
          if (!category) rowMessages.push("category is required");
          if (!unit) rowMessages.push("unit is required");
          if (!quantityText || !Number.isFinite(quantity) || quantity <= 0) {
            rowMessages.push("quantity must be a positive number");
          }
          if (
            !unitPriceText ||
            !Number.isFinite(unitPrice) ||
            unitPrice < 0
          ) {
            rowMessages.push("unit_price must be a nonnegative number");
          }

          if (rowMessages.length > 0) {
            validationErrors.push({
              row: rowNumber,
              message: rowMessages.join("; "),
            });
            return;
          }

          const parsedMaterial = {
            material,
            category,
            unit,
            quantity,
            unit_price: unitPrice,
          };
          const signature = getMaterialSignature(parsedMaterial);

          if (importedSignatures.has(signature)) {
            validationErrors.push({
              row: rowNumber,
              message: existingSignatures.has(signature)
                ? "material is already in this project"
                : "duplicate material row in this file",
            });
            return;
          }

          importedSignatures.add(signature);
          validMaterials.push(parsedMaterial);
        });

        if (validMaterials.length > 0) {
          onMaterialsLoaded(validMaterials);
          setImportedCount(validMaterials.length);
          setIsImported(true);
        } else if (validationErrors.length === 0) {
          validationErrors.push({
            message: "The CSV does not contain any material rows.",
          });
        }

        setErrors(validationErrors);
      },
      error: (error) => {
        setErrors([
          {
            message: `Could not read the CSV file: ${error.message}`,
          },
        ]);
      },
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-[#3a414d] bg-[#191d24] px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="shrink-0">
          <label className="block text-sm font-medium">
            Import Materials
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Upload a CSV file containing your project materials.
          </p>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3 sm:justify-end">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block min-w-0 max-w-xl text-sm text-gray-400
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
      </div>

      {isImported ? (
        <div className="mt-3 flex items-center gap-2 border-t border-[#292e37] pt-3 text-sm">
          <span className="text-gray-400">{fileName}</span>
          <span className="font-medium text-green-400">
            ✓ Imported successfully ({importedCount}{" "}
            {importedCount === 1 ? "material" : "materials"})
          </span>
        </div>
      ) : null}

      {errors.length > 0 && (
        <div
          role="alert"
          className="mt-3 border-t border-red-500/20 pt-3 text-sm text-red-300"
        >
          <p className="font-medium">Some CSV rows could not be imported:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {errors.map((error, index) => (
              <li key={`${error.row ?? "file"}-${index}`}>
                {error.row ? `Row ${error.row}: ` : ""}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
