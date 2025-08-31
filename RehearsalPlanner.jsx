function RehearsalPlanner({ rehearsals = [], people = [], onAdd, onUpdate, onRemove }) {
  // Altijd gesorteerd op datum (oud → nieuw)
  const sorted = [...(rehearsals || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const today = new Date().toISOString().slice(0, 10);

  // Locatie-opties (vast)
  const LOCATIONS = [
    "Buurthuis - Grote zaal",
    "Buurthuis - Dart ruimte",
    "Buurthuis - Vergaderruimte",
  ];

  // Type bijeenkomst opties
  const TYPES = [
    "Vergadering",
    "Evaluatie",
    "Lees Repetitie",
    "Repetitie",
    "Generale voorstelling",
    "Voorstelling",
    "Bonte Avond dag",
    "BBQ",
    "anders (zie comment)",
  ];

  // Afwezig-opties: alle spelers + vaste posten
  const crewOptions = [
    { id: "crew-tech", label: "Licht/geluid" },
    { id: "crew-director", label: "Regie" },
  ];
  const playerOptions = (Array.isArray(people) ? people : []).map(p => ({
    id: p.id,
    label: `${p.firstName || ""} ${p.lastName || p.name || ""}`.trim(),
  }));
  const ABSENCE_OPTIONS = [...playerOptions, ...crewOptions];

  const addAbsentee = (r, value) => {
    if (!value) return;
    const cur = Array.isArray(r.absentees) ? r.absentees : [];
    if (cur.includes(value)) return;
    onUpdate(r.id, { absentees: [...cur, value] });
  };
  const removeAbsentee = (r, value) => {
    const cur = Array.isArray(r.absentees) ? r.absentees : [];
    onUpdate(r.id, { absentees: cur.filter(x => x !== value) });
  };

  const nameForId = (id) => {
    const found = ABSENCE_OPTIONS.find(o => o.id === id);
    return found ? found.label : id;
  };

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex justify-between mb-3">
        <h2 className="text-lg font-semibold">Agenda</h2>
        <button className="rounded-xl border px-3 py-2" onClick={onAdd}>+ Activiteit</button>
      </div>

      <table className="min-w-full border-separate border-spacing-y-2">
        <thead>
          <tr className="text-left text-sm text-gray-600">
            <th className="px-3">Datum</th>
            <th className="px-3">Type bijeenkomst</th>
            <th className="px-3">Locatie</th>
            <th className="px-3">Afwezig</th>
            <th className="px-3">Opmerkingen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const past = (r.date || "") < today;
            const abs = Array.isArray(r.absentees) ? r.absentees : [];
            return (
              <tr key={r.id} className={`rounded-xl ${past ? "bg-gray-100 text-gray-400" : "bg-gray-50"}`}>
                {/* Datum */}
                <td className="px-3 py-2">
                  <input
                    type="date"
                    value={r.date || ""}
                    onChange={(e) => onUpdate(r.id, { date: e.target.value })}
                  />
                </td>

                {/* Type bijeenkomst */}
                <td className="px-3 py-2">
                  <select
                    className="rounded border px-2 py-1"
                    value={r.type || ""}
                    onChange={(e) => onUpdate(r.id, { type: e.target.value })}
                  >
                    <option value="">— kies type —</option>
                    {TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>

                {/* Locatie (dropdown met vaste opties) */}
                <td className="px-3 py-2">
                  <select
                    className="rounded border px-2 py-1"
                    value={r.location || ""}
                    onChange={(e) => onUpdate(r.id, { location: e.target.value })}
                  >
                    <option value="">— kies locatie —</option>
                    {LOCATIONS.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </td>

                {/* Afwezig: chips + +knop met dropdown */}
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    {abs.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5">
                        <span className="text-xs">{nameForId(id)}</span>
                        <button
                          className="text-xs px-1"
                          onClick={() => removeAbsentee(r, id)}
                          title="Verwijder"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {/* + toevoegen */}
                    <div className="flex items-center gap-1">
                      <span className="text-sm">+</span>
                      <select
                        className="rounded border px-2 py-1"
                        value=""
                        onChange={(e) => { addAbsentee(r, e.target.value); }}
                        title="Voeg afwezige toe"
                      >
                        <option value="">— voeg toe —</option>
                        {ABSENCE_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </td>

                {/* Opmerkingen */}
                <td className="px-3 py-2">
                  <input
                    className="rounded border px-2 py-1 w-full"
                    value={r.comments || ""}
                    onChange={(e) => onUpdate(r.id, { comments: e.target.value })}
                    placeholder="Comment"
                  />
                </td>

                {/* Verwijder */}
                <td className="px-3 py-2">
                  <button className="rounded-full border px-3 py-1" onClick={() => onRemove(r.id)}>x</button>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr className="rounded-xl bg-gray-50">
              <td className="px-3 py-2 text-sm text-gray-500" colSpan={6}>Nog geen repetities.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
