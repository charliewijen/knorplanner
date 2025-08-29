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
    setState(prev => ({
      ...prev,
      people: [...prev.people, newPerson],
    }));
    setFirstName("");
    setLastName("");
    setRole("Speler");
  };

  // Tel hoeveel sketches een persoon heeft
  const countAssignments = (personId) => {
    return sketches.filter(sk => sk.performers?.includes(personId)).length;
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
            {sketches.map(sk => (
              <th key={sk.id} className="border px-2 py-1">{sk.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map(p => (
            <tr key={p.id} className="odd:bg-white even:bg-gray-50">
              <td className="border px-2 py-1">{p.name}</td>
              <td className="border px-2 py-1">{p.role}</td>
              <td className="border px-2 py-1 text-center">{countAssignments(p.id)}</td>
              {sketches.map(sk => (
                <td key={sk.id} className="border text-center">
                  {sk.performers?.includes(p.id) ? "🎭" : ""}
                </td>
              ))}
            </tr>
          ))}
          {people.length === 0 && (
            <tr><td className="px-2 py-3 text-gray-500 text-sm" colSpan={3 + sketches.length}>Nog geen mensen toegevoegd.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
