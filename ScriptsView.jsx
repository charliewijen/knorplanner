function ScriptsView({ sketches = [], onUpdate, people = [] }) {
  const ordered = [...sketches].sort((a, b) => (a.order || 0) - (b.order || 0));
  const [sel, setSel] = React.useState(ordered[0]?.id);
  const active = ordered.find((s) => s.id === sel);

  if (!active) {
    return <div className="text-sm text-gray-500">Geen sketch geselecteerd</div>;
  }

  // Helpers
  const update = (patch) => onUpdate(active.id, { ...active, ...patch });

  // Rollen
  const roles = active.roles || [];
  const updateRole = (idx, patch) =>
    update({ roles: roles.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  const addRoles = (count) => {
    const newRoles = Array.from({ length: count }, (_, i) => ({
      name: `Rol ${i + 1}`,
      personId: "",
    }));
    update({ roles: newRoles });
  };

  return (
    <div className="rounded-2xl border p-4">
      {/* Header met titel + duur */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{active.title}</h2>
        <span className="text-gray-600">{active.durationMin || 0} min</span>
      </div>

      {/* Locatiekeuze */}
      <div className="mb-3">
        <label className="text-sm block">Locatie</label>
        <select
          className="rounded border px-3 py-2"
          value={active.stagePlace || "podium"}
          onChange={(e) => update({ stagePlace: e.target.value })}
        >
          <option value="podium">Podium</option>
          <option value="voorgordijn">Voor de gordijn</option>
        </select>
      </div>

      {/* Rollen */}
      <div className="mb-3">
        <label className="text-sm block">Aantal rollen</label>
        <input
          type="number"
          min={0}
          className="rounded border px-3 py-2 w-24"
          value={roles.length}
          onChange={(e) => addRoles(parseInt(e.target.value || 0, 10))}
        />
      </div>
      <div className="space-y-2 mb-4">
        {roles.map((r, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              className="flex-1 rounded border px-2 py-1"
              placeholder="Naam van de rol"
              value={r.name}
              onChange={(e) => updateRole(idx, { name: e.target.value })}
            />
            <select
              className="rounded border px-2 py-1"
              value={r.personId}
              onChange={(e) => updateRole(idx, { personId: e.target.value })}
            >
              <option value="">— kies speler —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Vaste links */}
      <div className="mb-4 space-y-2">
        <div>
          <label className="text-sm block">Link naar tekst</label>
          <input
            className="w-full rounded border px-2 py-1"
            value={active.linkText || ""}
            onChange={(e) => update({ linkText: e.target.value })}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="text-sm block">Link naar licht/geluid schema</label>
          <input
            className="w-full rounded border px-2 py-1"
            value={active.linkTech || ""}
            onChange={(e) => update({ linkTech: e.target.value })}
            placeholder="https://..."
          />
        </div>
      </div>

      {/* Extra sectie voor geluiden/muziek */}
      <div className="mb-4">
        <label className="text-sm font-semibold block mb-1">Geluiden en muziek</label>
        <textarea
          className="w-full rounded border px-2 py-1"
          rows={3}
          value={active.sounds || ""}
          onChange={(e) => update({ sounds: e.target.value })}
          placeholder="Beschrijf of plak links naar geluiden/muziek"
        />
      </div>

      {/* Decor beschrijving */}
      <div className="mb-4">
        <label className="text-sm font-semibold block mb-1">Decor</label>
        <textarea
          className="w-full rounded border px-2 py-1"
          rows={3}
          value={active.decor || ""}
          onChange={(e) => update({ decor: e.target.value })}
          placeholder="Beschrijving van decor en decorstukken"
        />
      </div>
    </div>
  );
}
