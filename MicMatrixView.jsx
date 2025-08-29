function MicMatrixView({ currentShowId, sketches = [], people = [], shows = [], setState = () => {} }) {
  // ===== Helpers & veilige data =====
  const show = Array.isArray(shows) ? shows.find(s => s.id === currentShowId) : null;
  const safeSketches = Array.isArray(sketches) ? sketches : [];
  const safePeople = Array.isArray(people) ? people : [];

  // Per-show: aantallen headsets/handhelds (bewaren in show)
  const headsetCount = Number.isInteger(show?.headsetCount) ? show.headsetCount : 0;
const handheldCount = Number.isInteger(show?.handheldCount) ? show.handheldCount : 0;

  // Alleen echte sketches (geen pauze/waerse)
  const realSketches = safeSketches
    .filter(sk => sk?.kind !== "break" && sk?.kind !== "waerse")
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Kanalenlijst
  const headsets = Array.from({ length: headsetCount }, (_, i) => ({ key: `H${i + 1}`, label: `Headset ${i + 1}` }));
  const handhelds = Array.from({ length: handheldCount }, (_, i) => ({ key: `HH${i + 1}`, label: `Handheld ${i + 1}` }));
  const channels = [...headsets, ...handhelds];

  // ===== Mutators =====
 // Als headsetCount/handheldCount nog niet bestaan → zet ze naar 0
if (show && typeof show.headsetCount !== "number") show.headsetCount = 0;
if (show && typeof show.handheldCount !== "number") show.handheldCount = 0;
const updateShow = (patch) => {
  if (!show) return;
  setState(prev => ({
    ...prev,
    shows: (prev.shows || []).map(s => s.id === show.id ? { ...s, ...patch } : s),
      // trim assignments die buiten nieuwe counts vallen
      sketches: (prev.sketches || []).map(sk => {
        if (sk.showId !== show.id) return sk;
        const a = sk.micAssignments || {};
        const allowedKeys = new Set([
          ...Array.from({ length: patch.headsetCount ?? headsetCount }, (_, i) => `H${i + 1}`),
          ...Array.from({ length: patch.handheldCount ?? handheldCount }, (_, i) => `HH${i + 1}`),
        ]);
        const trimmed = Object.fromEntries(Object.entries(a).filter(([k]) => allowedKeys.has(k)));
        return { ...sk, micAssignments: trimmed };
      })
    }));
  };

  const setAssignment = (sketchId, channelKey, personId) => {
    setState(prev => ({
      ...prev,
      sketches: (prev.sketches || []).map(sk => {
        if (sk.id !== sketchId) return sk;
        const a = { ...(sk.micAssignments || {}) };

        // Regel 1: één persoon per microfoon → ok (één value per channel)
        // Regel 2: dezelfde persoon mag in dezelfde sketch niet meerdere mics hebben
        const already = Object.entries(a).find(([k, v]) => v === personId && k !== channelKey);
        if (personId && already) {
          alert("Deze speler heeft in deze sketch al een microfoon. Kies iemand anders.");
          return sk;
        }

        // set / clear
        if (!personId) delete a[channelKey];
        else a[channelKey] = personId;

        return { ...sk, micAssignments: a };
      })
    }));
  };

  // Kandidaat-spelers per sketch: uit Rollen waar needsMic = true en personId gezet
  const eligibleForSketch = (sk) => {
    const ids = (sk.roles || [])
      .filter(r => r && r.needsMic && r.personId)
      .map(r => r.personId);
    // unieke volgorde houden
    const uniq = [...new Set(ids)];
    return uniq
      .map(id => safePeople.find(p => p.id === id))
      .filter(Boolean);
  };

  // Helper: is rij compleet (alle kanalen ingevuld)?
  const rowComplete = (sk) => {
    const a = sk.micAssignments || {};
    if (channels.length === 0) return false;
    return channels.every(ch => !!a[ch.key]);
  };

  return (
    <div className="rounded-2xl border p-4">
      <h2 className="text-lg font-semibold mb-3">Microfoon schema</h2>

      {/* Aantallen microfoons */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm text-gray-700">Aantal headsets</label>
          <input
            type="number"
            min={0}
            className="rounded border px-2 py-1 w-24"
            value={headsetCount}
            onChange={(e) => updateShow({ headsetCount: Math.max(0, parseInt(e.target.value || 0, 10)) })}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Aantal handhelds</label>
          <input
            type="number"
            min={0}
            className="rounded border px-2 py-1 w-24"
            value={handheldCount}
            onChange={(e) => updateShow({ handheldCount: Math.max(0, parseInt(e.target.value || 0, 10)) })}
          />
        </div>
        <div className="text-xs text-gray-500">
          Tip: Kandidaten per sketch komen uit <b>Scripts</b> → rollen met <i>Mic</i> aangevinkt.
        </div>
      </div>

      {/* Tabel */}
      <div className="overflow-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left">Sketch</th>
              {channels.map(ch => (
                <th key={ch.key} className="border px-2 py-1 text-left">{ch.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {realSketches.map(sk => {
              const candidates = eligibleForSketch(sk);
              const rowOk = rowComplete(sk);
              return (
                <tr key={sk.id} className={rowOk ? "bg-green-50" : "bg-red-50"}>
                  <td className="border px-2 py-1 font-medium">{`#${sk.order || "?"} ${sk.title || ""}`}</td>
                  {channels.map(ch => {
                    const a = sk.micAssignments || {};
                    const value = a[ch.key] || "";
                    return (
                      <td key={ch.key} className="border px-2 py-1">
                        <select
                          className="rounded border px-2 py-1 w-full"
                          value={value}
                          onChange={(e) => setAssignment(sk.id, ch.key, e.target.value)}
                        >
                          <option value="">— kies speler —</option>
                          {candidates.map(p => (
                            <option key={p.id} value={p.id}>
                              {(p.firstName || "") + " " + (p.lastName || "")}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {realSketches.length === 0 && (
              <tr>
                <td className="border px-2 py-2 text-gray-500 text-center" colSpan={1 + channels.length}>
                  Geen sketches om te tonen. (Pauzes en “De Waerse Ku-j” worden verborgen.)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="mt-3 text-xs text-gray-600">
        <div><span className="inline-block w-3 h-3 align-middle mr-1 bg-green-200 border"></span>Rij groen = alle microfoons in die sketch zijn toegewezen.</div>
        <div><span className="inline-block w-3 h-3 align-middle mr-1 bg-red-200 border"></span>Rij rood = er ontbreken nog toewijzingen.</div>
      </div>
    </div>
  );
}
