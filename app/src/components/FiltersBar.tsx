const FILTERS = [
  ["all", "Todos"],
  ["P1", "Urgentes"],
  ["open", "Abiertos"],
  ["confirmed", "Confirmados"],
  ["help_nearby", "Ayuda cerca"],
  ["maybe_resolved", "Posible resuelto"],
  ["resolved_owner,resolved_community", "Resueltos"]
];

export function FiltersBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="filters" aria-label="Filtros">
      {FILTERS.map(([id, label]) => (
        <button key={id} className={value === id ? "active" : ""} type="button" onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
