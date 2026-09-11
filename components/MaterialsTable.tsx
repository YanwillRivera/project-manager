import { Material } from "./CsvUploader";

type MaterialsTableProps = {
  materials: Material[];
};

export default function MaterialsTable({
  materials,
}: MaterialsTableProps) {
  if (materials.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-[#292e37] bg-[#191d24] p-6 text-center text-sm text-gray-500">
        No materials imported yet.
      </div>
    );
  }

  const totalCost = materials.reduce(
    (total, material) =>
      total + material.quantity * material.unit_price,
    0
  );

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-[#292e37] bg-[#191d24]">
      <div className="border-b border-[#292e37] p-5">
        <h3 className="font-semibold">Imported Materials</h3>

        <p className="mt-1 text-sm text-gray-500">
          {materials.length} materials imported from CSV
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
            </tr>
          </thead>

          <tbody>
            {materials.map((material, index) => {
              const materialTotal =
                material.quantity * material.unit_price;

              return (
                <tr
                  key={`${material.material}-${index}`}
                  className="border-b border-[#292e37] last:border-0"
                >
                  <td className="px-5 py-4 font-medium text-white">
                    {material.material}
                  </td>

                  <td className="px-5 py-4 text-gray-400">
                    {material.category}
                  </td>

                  <td className="px-5 py-4">
                    {material.quantity}
                  </td>

                  <td className="px-5 py-4 text-gray-400">
                    {material.unit}
                  </td>

                  <td className="px-5 py-4">
                    $
                    {material.unit_price.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>

                  <td className="px-5 py-4 font-semibold text-[#e5a82b]">
                    $
                    {materialTotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot className="bg-[#16191f]">
            <tr>
              <td
                colSpan={5}
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