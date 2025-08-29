const CastMatrixView = ({ sketches, people }) => {
  return (
    <div className="rounded-2xl border p-4 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-3">Cast-overzicht</h2>
      <table className="min-w-full border text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1">Sketch</th>
            {people.map(p => <th key={p.id} className="border px-2 py-1">{p.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {sketches.map(sk => (
            <tr key={sk.id} className="odd:bg-gray-50 even:bg-white">
              <td className="border px-2 py-1">{sk.title}</td>
              {people.map(p => (
                <td key={p.id} className="border text-center">
                  {sk.performers?.includes(p.id) ? "🎭" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
