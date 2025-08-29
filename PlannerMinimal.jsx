function PlannerMinimal({ state, setState, activeShowId, setActiveShowId }) {
  const activeShow = state.shows.find((s) => s.id === activeShowId) || state.shows[0];

  const showSketches = (activeShow?.sketches || []).sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );

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
      return {
        ...prev,
        shows: prev.shows.map((s) =>
          s.id === activeShow.id
            ? { ...s, sketches: [...(s.sketches || []), newSketch] }
            : s
        ),
      };
    });
  };

  const updateSketch = (id, u) =>
    setState((prev) => ({
      ...prev,
      shows: prev.shows.map((s) =>
        s.id === activeShow.id
          ? {
              ...s,
              sketches: s.sketches.map((sk) =>
                sk.id === id ? { ...sk, ...u } : sk
              ),
            }
          : s
      ),
    }));

  const removeSketch = (id) =>
    setState((prev) => ({
      ...prev,
      shows: prev.shows.map((s) =>
        s.id === activeShow.id
          ? {
              ...s,
              sketches: s.sketches.filter((sk) => sk.id !== id),
            }
          : s
      ),
    }));

  const addShow = () => {
    const newId = uid();
    const newShow = {
      id: newId,
      name: "Nieuwe show",
      date: new Date().toISOString().slice(0, 10),
      startTime: "19:30",
      people: [],
      mics: [],
      sketches: [],
      rehearsals: [],
    };
    setState((prev) => ({
      ...prev,
      shows: [...prev.shows, newShow],
    }));
    setActiveShowId(newId);
  };

  const updateShow = (updates) => {
    if (!activeShow) return;
    setState((prev) => ({
      ...prev,
      shows: prev.shows.map((s) =>
        s.id === activeShow.id ? { ...s, ...updates } : s
      ),
    }));
  };

  const removeShow = () => {
    if (!activeShow) return;
    setState((prev) => {
      if (prev.shows.length <= 1) return prev; // minimaal 1 show houden
      const filtered = prev.shows.filter((s) => s.id !== activeShow.id);
      return {
        ...prev,
        shows: filtered,
      };
    });
    // nieuwe actieve show pakken (eerste in lijst)
    const firstRemaining = state.shows.find((s) => s.id !== activeShow.id);
    if (firstRemaining) setActiveShowId(firstRemaining.id);
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="rounded-2xl border p-4">
        <h3 className="mb-2 font-semibold">Show</h3>
        <select
          className="rounded border px-3 py-2 w-full"
          value={activeShow?.id}
          onChange={(e) => setActiveShowId(e.target.value)}
        >
          {state.shows.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} – {s.date}
            </option>
          ))}
        </select>

        {activeShow && (
          <div className="mt-3 space-y-2">
            <input
              className="rounded border px-2 py-1 w-full"
              value={activeShow.name}
              onChange={(e) => updateShow({ name: e.target.value })}
              placeholder="Naam van de show"
            />
            <input
              className="rounded border px-2 py-1 w-full"
              type="date"
              value={activeShow.date}
              onChange={(e) => updateShow({ date: e.target.value })}
            />
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
