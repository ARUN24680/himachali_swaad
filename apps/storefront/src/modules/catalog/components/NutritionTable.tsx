import type { Nutrition } from '@pk/shared';

const ROWS: { key: keyof Nutrition; label: string; unit: string; indent?: boolean }[] = [
  { key: 'energyKcal', label: 'Energy', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'fatG', label: 'Total fat', unit: 'g' },
  { key: 'carbsG', label: 'Carbohydrate', unit: 'g' },
  { key: 'sugarG', label: 'of which sugars', unit: 'g', indent: true },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
];

const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

/** FSSAI nutrition panel, per 100 g. Scrolls inside its own box if ever too wide (Rules §1.1). */
export function NutritionTable({ nutrition }: { nutrition: Nutrition }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Nutrition information per 100 g</caption>
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-semibold text-foreground">
              Nutrient
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold text-foreground">
              Per 100 g
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ROWS.map((r) => (
            <tr key={r.key}>
              <th
                scope="row"
                className={
                  r.indent
                    ? 'py-2.5 pr-4 pl-8 text-left font-normal text-muted-foreground'
                    : 'px-4 py-2.5 text-left font-normal text-foreground'
                }
              >
                {r.label}
              </th>
              <td className="px-4 py-2.5 text-right text-foreground tabular-nums">
                {num.format(nutrition[r.key])} {r.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
