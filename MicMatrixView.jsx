const MicMatrixView = ({ sketches, mics, people }) => {
  return (
    <div className="rounded-2xl border p-4 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-3">Microfoon-overzicht</h2>
      <table className="min-w-full border text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1">Sketch</th>
            {mics.map(m => <th key={m.id} className="border px-2 py-1">{m.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {sketches.map(sk => (
            <tr key={sk.id} className="odd:bg-gray-50 even:bg-white">
              <td className="border px-2 py-1">{sk.title}</td>
              {mics.map(m => (
                <td key={m.id} className="border text-center">
                  {sk.mics?.includes(m.id) ? "🎤" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
