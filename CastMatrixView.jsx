const CastMatrixView = ({ sketches, people, setState }) => {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [role, setRole] = React.useState("Speler");

  // Voeg een nieuw persoon toe
  const addPerson = () => {
    if (!firstName.trim() && !lastName.trim()) return;
    const newPerson = {
      id: uid(),
      name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
    };
    setState((prev) => ({
      ...prev,
      people: [...prev.people, newPerson],
    }));
    setFirstName("");
    setLastName("");
    setRole("Speler");
  };

  // Speler verwijderen
  const removePerson = (id) => {
    setState((prev) => ({
      ...prev,
      people: prev.people.filter((p) => p.id !== id),
      // verwijder ook uit sketches
      sketches: prev.sketches.map((sk) => ({
        ...sk,
        performers: (sk.performers || []).filter((pid) => pid !== id),
      })),
    }));
  };

  // Speler aanpassen
  const updatePerson = (id, updates) => {
    setState((prev) => ({
      ...prev,
      people: prev.people.map((p) =>
        p.id === id ? { ...p, ...updates, name: `${updates.firstName || p.firstName} ${updates.lastName || p.lastName}`.trim() } : p
      ),
    }));
  };

  // Tel hoeveel sketches een persoon heeft
  const countAssignments = (personId) => {
    return sketches.filter((sk) => sk.performers?.includes(personId)).length;
  };

  return (
    <div className="rounded-2xl border p-4">
      <h2 className="text-lg font-semibold mb-4">Cast-overzicht</h2>

      {/* Formulier om iemand toe te voegen */}
      <div className="mb-6 flex flex-wrap gap-2 items-end">
        <input
          className="rounded border px-2 py-1"
          placeholder="Voornaam"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1"
          placeholder="Achternaam"
          value={lastName}
          onChange={e => setLastName(e.target.value)}
        />
        <select
          className="rounded border px-2 py-1"
          value={role}
          onChange={e => setRole(e.target.value)}
        >
          <option value="Speler">Speler</option>
          <option value="Danser">Danser</option>
        </select>
        <button
          className="rounded-xl border px-3 py-1 bg-gray-100 hover:bg-gray-200"
          onClick={addPerson}
        >
          + Voeg toe
        </button>
      </div>

      {/* Tabel */}
      <table className="min-w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1">Naam</th>
            <th className="border px-2 py-1">Rol</th>
            <th className="border px-2 py-1">Aantal sketches</th>
            <th className="border px-2 py-1">Acties</th>
          </tr>
        </thead>
        <tbody>
          {people.map(p => (
            <tr key={p.id} className="odd:bg-white even:bg-gray-50">
              <td className="border px-2 py-1">
                <input
                  className="w-full rounded border px-1"
                  value={p.firstName}
                  onChange={(e) => updatePerson(p.id, { firstName: e.target.value })}
                  placeholder="Voornaam"
                />
                <input
                  className="w-full rounded border px-1 mt-1"
                  value={p.lastName}
                  onChange={(e) => updatePerson(p.id, { lastName: e.target.value })}
                  placeholder="Achternaam"
                />
              </td>
              <td className="border px-2 py-1">
                <select
                  className="rounded border px-2 py-1"
                  value={p.role}
                  onChange={(e) => updatePerson(p.id, { role: e.target.value })}
                >
                  <option value="Speler">Speler</option>
                  <option value="Danser">Danser</option>
                </select>
              </td>
              <td className="border px-2 py-1 text-center">
                {countAssignments(p.id)}
              </td>
              <td className="border px-2 py-1 text-center">
                <button
                  className="rounded-full border px-2 py-1 text-red-600"
                  onClick={() => removePerson(p.id)}
                >
                  ❌
                </button>
              </td>
            </tr>
          ))}
          {people.length === 0 && (
            <tr>
              <td className="px-2 py-3 text-gray-500 text-sm text-center" colSpan={4}>
                Nog geen mensen toegevoegd.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
