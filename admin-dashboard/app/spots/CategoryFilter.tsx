import { PRIMARY_CATEGORIES, PRIMARY_CATEGORY_LABELS } from "@backyrd/world-knowledge-core/browser";
import { categoryFilter, type CategoryFilter as CategoryFilterValue } from "@/lib/spotListFilters";

export function CategoryFilter({ value, counts, disabled, onChange }: { value: CategoryFilterValue; counts: Record<string, number>; disabled: boolean; onChange(value: CategoryFilterValue): void }) {
  return <label><span className="sr-only">Hauptkategorie filtern</span><select aria-label="Hauptkategorie filtern" value={value} disabled={disabled} onChange={event => onChange(categoryFilter(event.target.value))}>
    <option value="all">Alle Hauptkategorien{disabled ? "" : ` (${counts.all ?? 0})`}</option>
    {PRIMARY_CATEGORIES.map(category => <option key={category} value={category}>{PRIMARY_CATEGORY_LABELS[category].de}{disabled ? "" : ` (${counts[category] ?? 0})`}</option>)}
    <option value="unassigned">Ohne Hauptkategorie{disabled ? "" : ` (${counts.unassigned ?? 0})`}</option>
  </select></label>;
}
