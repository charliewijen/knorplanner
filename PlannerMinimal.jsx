function PlannerMinimal({ state, setState, activeShowId, setActiveShowId }) {
  const activeShow = state.shows.find((s) => s.id === activeShowId) || state.shows[0];

  // Alle items (sketches + pauzes) voor deze show
  const showItems = (state.sketches || [])
    .filter((s) => s.showId === activeShow?.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const nextOrder = () => (showItems.at(-1)?.order || 0) + 1;

  // ---------- Sketch ----------
  const addSketch = () => {
    if (!activeShow) return;
    setState((prev) => {
      const newSketch = {
        id: uid(),
        showId: activeShow.id,
        kind: "sketch",
        title: "Nieuwe sketch",
        order: nextOrder(),
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

  // ---------- Pauze ----------
  const addPause = () => {
    if (!activeShow) return;
    setState((prev) => {
      const pauseItem = {
        id: uid(),
        showId: activeShow.id,
        kind: "break",         // <- markeer als pauze
        title: "PAUZE",        // <- vaste benaming
        order: nextOrder(),
        durationMin: 10,       // standaard 10 min, aanpasbaar
        performers: [],
        mics: [],
      };
      return { ...prev, sketches: [...(prev.sketches || []), pauseItem] };
    });
  };

  const updateItem = (id, u) =>
    setState((prev) => ({
      ...prev,
      sketches: prev.sketches.map((sk) => (sk.id === id ? { ...sk, ...u } : sk)),
    }));

  const removeItem = (id) =>
    setState((prev) => ({
      ...prev,
      sketches: prev.sketches.filter((sk) => sk.id !== id),
    }));

  // ---------- Shows ----------
  const addShow = () => {
    const newId = uid();
    const newShow = {
      id: newId,
      name: "Nieuwe show",
    };
    setState((prev) => ({
      ...prev,
      shows: [...prev.shows, newShow],
    }));
    setActiveShowId(newId);
  };

  const updateShow = (patch) =>
    setState((prev) => ({
      ...prev,
      shows: prev.shows.map((s) => (s.id === activeShow.id ? { ...s, ...patch } : s)),
    }));

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
      const keepByShow = (arr = []) => arr.filter((x) => x.showId !== activeShow.id);
      const next = {
        ...prev,
        shows: restShows,
        sketches: keepByShow(prev.sketches),
        people: keepByShow(prev.people),
        mics: keepByShow(prev.mics),
        rehearsals: keepByShow(prev.rehearsals),
      };
      const newActive = restShows[0]?.id || null;
      setActiveShowId(newActive);
      return next;
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Show selector + beheer */}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-2 font-semibold">Show</h3>

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

      {/* Items (sketches + pauzes) */}
      <section className="md:col-span-2 rounded-2xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Show-items</h3>
          <div className="flex gap-2">
            <button className="rounded-xl border px-3 py-2" onClick={addSketch} disabled={!activeShow}>
              + Sketch
            </button>
            <button className="rounded-xl border px-3 py-2" onClick={addPause} disabled={!activeShow}>
              + Pauze
            </button>
          </div>
        </div>

        <ul className="space-y-2">
          {showItems.map((it) => {
            const isBreak = it.kind === "break";
            return (
              <li key={it.id} className="rounded-xl bg-gray-50 p-3 flex items-center gap-2">
                {/* Volgorde */}
                <input
                  className="w-16 rounded border px-2 py-1"
                  type="number"
                  value={it.order || 0}
                  onChange={(e) =>
                    updateItem(it.id, { order: parseInt(e.target.value || 0, 10) })
                  }
                  title="Volgorde"
                />

                {/* Titel: alleen editbaar voor sketches; pauze is vaste naam */}
                {isBreak ? (
                  <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 font-semibold">
                    PAUZE
                  </span>
                ) : (
                  <input
                    className="flex-1 rounded border px-2 py-1"
                    value={it.title || ""}
                    onChange={(e) => updateItem(it.id, { title: e.target.value })}
                    placeholder="Titel van sketch"
                  />
                )}

                {/* Duur in minuten */}
                <input
                  className="w-24 rounded border px-2 py-1"
                  type="number"
                  value={it.durationMin || 0}
                  onChange={(e) =>
                    updateItem(it.id, {
                      durationMin: parseInt(e.target.value || 0, 10),
                    })
                  }
                  title="Duur (min)"
                />

                {/* Verwijder */}
                <button className="rounded-full border px-3 py-1" onClick={() => removeItem(it.id)}>
                  x
                </button>
              </li>
            );
          })}
          {showItems.length === 0 && (
            <li className="text-sm text-gray-500">Nog geen items.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
