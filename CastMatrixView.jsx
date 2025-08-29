const CastMatrixView = ({ sketches = [], people = [], currentShowId, setState = () => {} }) => {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [role, setRole] = React.useState("Speler");

  const safePeople = Array.isArray(people) ? people : [];
  const safeSketches = Array.isArray(sketches) ? sketches : [];

  // Tel in hoeveel sketches iemand zit (alleen binnen de huidige show)
  const countAssignments = (personId) => {
    return safeSketches.filter((sk) => Array.isArray(sk.performers) && sk.performers.includes(personId)).length;
  };

  // Nieuw persoon toevoegen met showId van de actieve show
  const addPerson = () => {
    if (!currentShowId) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn && !ln) return;

    const newPerson = {
      id: uid(),
      showId: currentShowId,
      firstName: fn,
      lastName: ln,
      name: `${fn} ${ln}`.trim(),
      role,
    };

    setState((prev) => ({
      ...prev,
      people: [...(prev.people || []), newPerson],
    }));

    setFirstName("");
    setLastName("");
    setRole("Speler");
  };

  // Persoon bewerken
  const updatePerson = (id, updates) => {
    setState((prev) => ({
      ...prev,
      people: (prev.people || []).map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...updates };
        const fn = updates.firstName !== undefined ? updates.firstName : (p.firstName || "");
        const ln = updates.lastName  !== undefined ? updates.lastName  : (p.lastName  || "");
        next.name = `${fn} ${ln}`.trim();
        return next;
      }),
    }));
  };

  // Persoon verwijderen (en ook uit performers-lijsten halen)
  const removePerson = (id) => {
    setState((prev) => ({
      ...prev,
      people: (prev.people || []).filter((p) => p.id !== id),
      sketches: (prev.sketches || []).map((sk) => ({
        ...sk,
        performers: (sk.performers || []).filter((pid) => pid !== id),
      })),
    }));
  };

  return (
    <div className="rounded-2xl border p-4">
      <h2 className="text-lg font-semibold mb-4">Cast-overzicht</h2>

      {!currentShowId && (
        <div className="mb-4 rounded border bg-yellow-50 p-2 text-sm">
          Selecteer eerst een show.
        </div>
      )}

      {/* Formulier om iemand toe te voegen */}
      <div className="mb-6 flex flex-wrap gap-2 items-end">
        <input
          className="rounded border px-2 py-1"
          placeholder="Voornaam"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1"
          placeholder="Achternaam"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <select
          className="rounded border px-2 py-1"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="Speler">Speler</option>
          <option value="Danser">Danser</option>
        </select>
        <button
          className="rounded-xl border px-3 py-1 bg-gray-100 hover:bg-gray-200"
          onClick={addPerson}
          disabled={!currentShowId}
        >
          + Voeg toe
        </button>
      </div>

      {/* Tabel zonder losse sketch-kolommen */}
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
          {safePeople.map((p) => (
            <tr key={p.id} className="odd:bg-white even:bg-gray-50">
              <td className="border px-2 py-1">
                <input
                  className="w-full rounded border px-1"
                  value={p.firstName || ""}
                  onChange={(e) => updatePerson(p.id, { firstName: e.target.value })}
                  placeholder="Voornaam"
                />
                <input
                  className="w-full rounded border px-1 mt-1"
                  value={p.lastName || ""}
                  onChange={(e) => updatePerson(p.id, { lastName: e.target.value })}
                  placeholder="Achternaam"
                />
              </td>
              <td className="border px-2 py-1">
                <select
                  className="rounded border px-2 py-1 w-full"
                  value={p.role || "Speler"}
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
                  title="Verwijderen"
                >
                  ❌
                </button>
              </td>
            </tr>
          ))}
          {safePeople.length === 0 && (
            <tr>
              <td className="px-2 py-3 text-gray-500 text-sm text-center" colSpan={4}>
                Nog geen mensen toegevoegd voor deze show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
