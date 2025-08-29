function CastMatrixView({ sketches = [], people = [], currentShowId, setState = () => {} }) {
  const uid = window.uid;

  // ====== Helpers ======
  const norm = (s) => (s || "").trim();
  const fullName = (p) => [norm(p.firstName), norm(p.lastName || p.name)].filter(Boolean).join(" ");

  // Alleen items uit de huidige show en geen pauze/waerse
  const realSketches = (Array.isArray(sketches) ? sketches : [])
    .filter(sk => sk && sk.showId === currentShowId && sk.kind !== "break" && sk.kind !== "waerse");

  // Aantal unieke sketches per persoon (>=1 rol)
  const sketchCountByPerson = React.useMemo(() => {
    const counts = new Map(); // personId -> count
    realSketches.forEach(sk => {
      const setForSketch = new Set(
        (sk.roles || [])
          .map(r => r?.personId)
          .filter(Boolean)
      );
      // elke personId in deze sketch telt 1 (ongeacht #rollen in deze sketch)
      setForSketch.forEach(pid => {
        counts.set(pid, (counts.get(pid) || 0) + 1);
      });
    });
    return counts;
  }, [realSketches]);

  // Sorteren: spelers (achternaam A-Z), daarna dansers (achternaam A-Z)
  const lastNameOf = (p) => (p.lastName?.trim()) || (p.name?.trim()?.split(" ").slice(-1)[0] || "");
  const roleKind = (p) => ((p.role || p.type || "").toLowerCase().includes("dans") ? "danser" : "speler");

  const players = (people || []).filter(p => roleKind(p) === "speler")
    .sort((a,b)=> lastNameOf(a).localeCompare(lastNameOf(b)));
  const dancers = (people || []).filter(p => roleKind(p) === "danser")
    .sort((a,b)=> lastNameOf(a).localeCompare(lastNameOf(b)));
  const ordered = [...players, ...dancers];

  // ====== Add person ======
  const [draft, setDraft] = React.useState({ firstName: "", lastName: "", role: "speler" });
  const canAdd = norm(draft.firstName) || norm(draft.lastName);

  const addPerson = () => {
    if (!canAdd || !currentShowId) return;
    setState(prev => ({
      ...prev,
      people: [
        ...(prev.people || []),
        {
          id: uid(),
          showId: currentShowId,
          firstName: norm(draft.firstName),
          lastName: norm(draft.lastName),
          role: draft.role, // "speler" | "danser"
        }
      ]
    }));
    setDraft({ firstName: "", lastName: "", role: "speler" });
  };

  // ====== Update / Delete ======
  const updatePerson = (id, patch) => {
    setState(prev => ({
      ...prev,
      people: (prev.people || []).map(p => p.id === id ? { ...p, ...patch } : p)
    }));
  };

  const removePerson = (id) => {
    if (!confirm("Weet je zeker dat je deze persoon wilt verwijderen?")) return;
    setState(prev => ({
      ...prev,
      // Verwijder persoon
      people: (prev.people || []).filter(p => p.id !== id),
      // Haal die persoon ook uit alle sketch-rollen
      sketches: (prev.sketches || []).map(sk => {
        if (sk.showId !== currentShowId) return sk;
        const roles = (sk.roles || []).map(r => r?.personId === id ? { ...r, personId: "" } : r);
        return { ...sk, roles };
      })
    }));
  };

  return (
    <div className="rounded-2xl border p-4">
      <h2 className="text-lg font-semibold mb-3">Biggenconvent</h2>

      {/* Add form */}
      <div className="mb-4 grid grid-cols-12 gap-2 items-end">
        <div className="col-span-4">
          <label className="block text-sm text-gray-700">Voornaam</label>
          <input
            className="w-full rounded border px-2 py-1"
            value={draft.firstName}
            onChange={(e)=>setDraft(d => ({...d, firstName: e.target.value}))}
            placeholder="Voornaam"
          />
        </div>
        <div className="col-span-4">
          <label className="block text-sm text-gray-700">Achternaam</label>
          <input
            className="w-full rounded border px-2 py-1"
            value={draft.lastName}
            onChange={(e)=>setDraft(d => ({...d, lastName: e.target.value}))}
            placeholder="Achternaam"
          />
        </div>
        <div className="col-span-3">
          <label className="block text-sm text-gray-700">Type</label>
          <select
            className="w-full rounded border px-2 py-1"
            value={draft.role}
            onChange={(e)=>setDraft(d => ({...d, role: e.target.value}))}
          >
            <option value="speler">Speler</option>
            <option value="danser">Danser</option>
          </select>
        </div>
        <div className="col-span-1">
          <button
            className={`w-full rounded-xl border px-3 py-2 ${canAdd ? "bg-black text-white" : "opacity-50 cursor-not-allowed"}`}
            onClick={addPerson}
            disabled={!canAdd}
            title={canAdd ? "Voeg toe" : "Vul minimaal voor- of achternaam in"}
          >
            +
          </button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left">Naam</th>
              <th className="border px-2 py-1 text-left w-32">Type</th>
              <th className="border px-2 py-1 text-left w-40">Aantal sketches</th>
              <th className="border px-2 py-1 text-left w-40">Acties</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(p => {
              const count = sketchCountByPerson.get(p.id) || 0;
              return (
                <tr key={p.id} className="odd:bg-gray-50">
                  {/* NAAM: voor- en achternaam naast elkaar */}
                  <td className="border px-2 py-1">
                    <div className="flex gap-2">
                      <input
                        className="rounded border px-2 py-1 w-40"
                        value={p.firstName || ""}
                        onChange={(e)=>updatePerson(p.id, { firstName: e.target.value })}
                        placeholder="Voornaam"
                      />
                      <input
                        className="rounded border px-2 py-1 w-48"
                        value={p.lastName || ""}
                        onChange={(e)=>updatePerson(p.id, { lastName: e.target.value })}
                        placeholder="Achternaam"
                      />
                    </div>
                  </td>

                  {/* TYPE */}
                  <td className="border px-2 py-1">
                    <select
                      className="rounded border px-2 py-1"
                      value={roleKind(p)}
                      onChange={(e)=>updatePerson(p.id, { role: e.target.value })}
                    >
                      <option value="speler">Speler</option>
                      <option value="danser">Danser</option>
                    </select>
                  </td>

                  {/* Aantal sketches (uniek per sketch) */}
                  <td className="border px-2 py-1">
                    <span className="inline-flex items-center gap-2">
                      <span className="font-medium">{count}</span>
                      
                    </span>
                  </td>

                  {/* Acties */}
                  <td className="border px-2 py-1">
                    <button
                      className="rounded-full border px-3 py-1"
                      onClick={()=>removePerson(p.id)}
                    >
                      Verwijder
                    </button>
                  </td>
                </tr>
              );
            })}
            {ordered.length === 0 && (
              <tr>
                <td className="border px-2 py-2 text-gray-500 text-center" colSpan={4}>
                  Nog geen mensen in deze show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-600">
        • “Aantal sketches” telt per persoon het aantal unieke sketches waar hij/zij minstens één rol heeft.<br/>
        • Pauzes en “De Waerse Ku-j” tellen niet mee.
      </div>
    </div>
  );
}
