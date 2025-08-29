function MicMatrixView({ currentShowId, sketches = [], people = [], shows = [], setState = () => {} }) {
  // ===== Veilige data =====
  const show = Array.isArray(shows) ? shows.find((s) => s.id === currentShowId) : null;
  const safeSketches = Array.isArray(sketches) ? sketches : [];
  const safePeople = Array.isArray(people) ? people : [];

  // Alleen echte sketches (geen pauze/waerse)
  const realSketches = safeSketches
    .filter((sk) => sk && sk.kind !== "break" && sk.kind !== "waerse")
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Per-show aantallen (defaults = 0)
  const headsetCount = Number.isInteger(show?.headsetCount) ? show.headsetCount : 0;
  const handheldCount = Number.isInteger(show?.handheldCount) ? show.handheldCount : 0;

  // Kanalen
  const headsets = Array.from({ length: Math.max(0, headsetCount) }, (_, i) => ({
    key: `H${i + 1}`,
    label: `Headset ${i + 1}`,
  }));
  const handhelds = Array.from({ length: Math.max(0, handheldCount) }, (_, i) => ({
    key: `HH${i + 1}`,
    label: `Handheld ${i + 1}`,
  }));
  const channels = [...headsets, ...handhelds];

  // ===== Helpers =====
  const eligibleForSketch = (sk) => {
    const ids = (sk.roles || [])
      .filter((r) => r && r.needsMic && r.personId)
      .map((r) => r.personId);
    const uniq = [...new Set(ids)];
    return uniq
      .map((id) => safePeople.find((p) => p.id === id))
      .filter(Boolean);
  };

  const rowComplete = (sk) => {
    const requiredIds = new Set(
      (sk.roles || [])
        .filter((r) => r && r.needsMic && r.personId)
        .map((r) => r.personId)
    );
    if (requiredIds.size === 0) return false;

    const assignedIds = new Set(Object.values(sk.micAssignments || {}).filter(Boolean));
    return [...requiredIds].every((id) => assignedIds.has(id));
  };

  // ===== Mutators =====
  const updateShow = (patch) => {
    if (!show) return;
    setState((prev) => {
      const nextHeadsets =
        typeof patch.headsetCount === "number" ? Math.max(0, patch.headsetCount) : headsetCount;
      const nextHandhelds =
        typeof patch.handheldCount === "number" ? Math.max(0, patch.handheldCount) : handheldCount;

      const allowedKeys = new Set([
        ...Array.from({ length: nextHeadsets }, (_, i) => `H${i + 1}`),
        ...Array.from({ length: nextHandhelds }, (_, i) => `HH${i + 1}`),
      ]);

      return {
        ...prev,
        shows: (prev.shows || []).map((s) =>
          s.id === show.id
            ? { ...s, headsetCount: nextHeadsets, handheldCount: nextHandhelds }
            : s
        ),
        sketches: (prev.sketches || []).map((sk) => {
          if (sk.showId !== show.id) return sk;
          const a = sk.micAssignments || {};
          const trimmed = Object.fromEntries(Object.entries(a).filter(([k]) => allowedKeys.has(k)));
          return { ...sk, micAssignments: trimmed };
        }),
      };
    });
  };

  const setAssignment = (sketchId, channelKey, personId) => {
    setState((prev) => {
      const nextSketches = (prev.sketches || []).map((sk) => {
        if (sk.id !== sketchId) return sk;
        const a = { ...(sk.micAssignments || {}) };

        // Safety: geen dubbele mics voor 1 speler
        if (personId) {
          const already = Object.entries(a).some(
            ([k, v]) => k !== channelKey && v === personId
          );
          if (already) return sk;
        }

        if (!personId) delete a[channelKey];
        else a[channelKey] = personId;

        return { ...sk, micAssignments: a };
      });

      return { ...prev, sketches: nextSketches };
    });
  };

  return (
    <div className="rounded-2xl border p-4">
      <h2 className="text-lg font-semibold mb-3">Microfoon schema</h2>

      {!show ? (
        <div className="text-sm text-gray-500">Geen actieve show gevonden.</div>
      ) : (
        <>
          {/* Aantallen microfoons */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-sm text-gray-700">Aantal headsets</label>
              <input
                type="number"
                min={0}
                className="rounded border px-2 py-1 w-24"
                value={headsetCount}
                onChange={(e) =>
                  updateShow({ headsetCount: Math.max(0, parseInt(e.target.value || 0, 10)) })
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Aantal handhelds</label>
              <input
                type="number"
                min={0}
                className="rounded border px-2 py-1 w-24"
                value={handheldCount}
                onChange={(e) =>
                  updateShow({ handheldCount: Math.max(0, parseInt(e.target.value || 0, 10)) })
                }
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
                  {channels.map((ch) => (
                    <th key={ch.key} className="border px-2 py-1 text-left">
                      {ch.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {realSketches.map((sk) => {
                  const candidates = eligibleForSketch(sk);
                  const rowOk = rowComplete(sk);
                  return (
                    <tr key={sk.id} className={rowOk ? "bg-green-50" : "bg-red-50"}>
                      <td className="border px-2 py-1 font-medium">{`#${sk.order || "?"} ${
                        sk.title || ""
                      }`}</td>
                      {channels.map((ch) => {
                        const a = sk.micAssignments || {};
                        const value = a[ch.key] || "";

                        // spelers die al op andere mic zitten in deze sketch
                        const assignedOther = new Set(
                          Object.entries(a)
                            .filter(([k, v]) => k !== ch.key && v)
                            .map(([, v]) => v)
                        );

                        // filter kandidaten
                        const options = candidates.filter(
                          (p) => p.id === value || !assignedOther.has(p.id)
                        );

                        // disable lege selects als rij groen is
                        const disabledEmpty = !value && rowOk;
                        const selectClass = `rounded border px-2 py-1 w-full ${
                          disabledEmpty ? "bg-gray-100 text-gray-400" : ""
                        }`;

                        return (
                          <td key={ch.key} className="border px-2 py-1">
                            <select
                              className={selectClass}
                              value={value}
                              onChange={(e) => setAssignment(sk.id, ch.key, e.target.value)}
                              disabled={disabledEmpty}
                              title={disabledEmpty ? "Niet nodig in deze sketch" : ""}
                            >
                              <option value="">— kies speler —</option>
                              {options.map((p) => (
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
                    <td
                      className="border px-2 py-2 text-gray-500 text-center"
                      colSpan={1 + channels.length}
                    >
                      Geen sketches om te tonen. (Pauzes en “De Waerse Ku-j” worden verborgen.)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="mt-3 text-xs text-gray-600">
            <div>
              <span className="inline-block w-3 h-3 align-middle mr-1 bg-green-200 border"></span>
              Rij groen = alle spelers met mic zijn toegewezen.
            </div>
            <div>
              <span className="inline-block w-3 h-3 align-middle mr-1 bg-red-200 border"></span>
              Rij rood = er ontbreken nog toewijzingen.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
