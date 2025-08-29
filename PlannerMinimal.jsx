function PlannerMinimal({ state, setState, activeShowId, setActiveShowId }) {
  const activeShow = state.shows.find((s) => s.id === activeShowId) || state.shows[0];

  // Sketches voor de huidige show (root-model met showId)
  const showSketches = (state.sketches || [])
    .filter((s) => s.showId === activeShow?.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const addSketch = () => {
    if (!activeShow) return;
    setState((prev) => {
      const newSketch = {
        id: uid(),
        showId: activeShow.id,
        title: "Nieuwe sketch",
        order: (showSketches.at(-1)?.order || 0) + 1,
        durationMin: 5,
        script: "",
        performers: [],
        mics: [],
        roles: [],
        props: [],
        costumes: [],
        attachments: [],
      };
      return { ...prev, sketches: [...(prev.sketches || []), newSketch] };
    });
  };

  const updateSketch = (id, u) =>
    setState((prev) => ({
      ...prev,
      sketches: prev.sketches.map((sk) => (sk.id === id ? { ...sk, ...u } : sk)),
    }));

  const removeSketch = (id) =>
    setState((prev) => ({
      ...prev,
      sketches: prev.sketches.filter((sk) => sk.id !== id),
    }));

  // Nieuwe show aanmaken (naam kun je meteen intypen in het veld eronder)
  const addShow = () => {
    const newId = uid();
    const newShow = {
      id: newId,
      name: "Nieuwe show",
      // geen date/startTime velden meer — we tonen/editen alleen naam
    };
    setState((prev) => ({
      ...prev,
      shows: [...prev.shows, newShow],
    }));
    setActiveShowId(newId);
  };

  // Show-naam wijzigen
  const updateShow = (patch) =>
    setState((prev) => ({
      ...prev,
      shows: prev.shows.map((s) => (s.id === activeShow.id ? { ...s, ...patch } : s)),
    }));

  // Show verwijderen met bevestiging + gerelateerde data opruimen
  const removeShow = () => {
    if (!activeShow) return;
    if (state.shows.length <= 1) return; // minimaal 1 show houden

    const ok = confirm(
      `Weet je zeker dat je de show “${activeShow.name || "zonder naam"}” wilt verwijderen?\n` +
      `Alle bijbehorende data (sketches/cast/mics/repetities) wordt ook verwijderd.`
    );
    if (!ok) return;

    setState((prev) => {
      const restShows = prev.shows.filter((s) => s.id !== activeShow.id);
      // alle root-data met showId opruimen
      const keepByShow = (arr = []) => arr.filter((x) => x.showId !== activeShow.id);
      const next = {
        ...prev,
        shows: restShows,
        sketches: keepByShow(prev.sketches),
        people: keepByShow(prev.people),
        mics: keepByShow(prev.mics),
        rehearsals: keepByShow(prev.rehearsals),
      };
      // active show omschakelen naar de eerste overgebleven
      const newActive = restShows[0]?.id || null;
      setActiveShowId(newActive);
      return next;
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="rounded-2xl border p-4">
        <h3 className="mb-2 font-semibold">Show</h3>

        {/* Dropdown met ALLEEN de naam (geen datum) */}
        <select
          className="rounded border px-3 py-2 w-full"
          value={activeShow?.id}
          onChange={(e) => setActiveShowId(e.target.value)}
        >
          {state.shows.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || "Zonder naam"}
            </option>
          ))}
        </select>

        {/* Show beheren */}
        {activeShow && (
          <div className="mt-3 space-y-2">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Naam</label>
              <input
                className="w-full rounded border px-2 py-1"
                value={activeShow.name || ""}
                onChange={(e) => updateShow({ name: e.target.value })}
                placeholder="Naam van de show"
              />
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl border px-3 py-2 bg-gray-100 hover:bg-gray-200"
                onClick={addShow}
              >
                + Nieuwe show
              </button>
              <button
                className="flex-1 rounded-xl border px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700"
                onClick={removeShow}
                disabled={state.shows.length <= 1}
                title={state.shows.length <= 1 ? "Minimaal 1 show nodig" : "Verwijder deze show"}
              >
                🗑️ Verwijder
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="md:col-span-2 rounded-2xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Sketches</h3>
          <button
            className="rounded-xl border px-3 py-2"
            onClick={addSketch}
            disabled={!activeShow}
          >
            + Sketch
          </button>
        </div>
        <ul className="space-y-2">
          {showSketches.map((s) => (
            <li
              key={s.id}
              className="rounded-xl bg-gray-50 p-3 flex items-center gap-2"
            >
              <input
                className="w-16 rounded border px-2 py-1"
                type="number"
                value={s.order}
                onChange={(e) =>
                  updateSketch(s.id, { order: parseInt(e.target.value || 0, 10) })
                }
              />
              <input
                className="flex-1 rounded border px-2 py-1"
                value={s.title}
                onChange={(e) => updateSketch(s.id, { title: e.target.value })}
              />
              <input
                className="w-20 rounded border px-2 py-1"
                type="number"
                value={s.durationMin || 0}
                onChange={(e) =>
                  updateSketch(s.id, {
                    durationMin: parseInt(e.target.value || 0, 10),
                  })
                }
              />
              <button
                className="rounded-full border px-3 py-1"
                onClick={() => removeSketch(s.id)}
              >
                x
              </button>
            </li>
          ))}
          {showSketches.length === 0 && (
            <li className="text-sm text-gray-500">Nog geen sketches.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
