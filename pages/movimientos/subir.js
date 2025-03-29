import { useState } from 'react';

export default function UploadPage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpload = async () => {
    if (files.length === 0) {
      setMessage('Por favor, selecciona al menos un archivo.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      setMessage(result.message);
    } catch (error) {
      setMessage('Error al subir archivos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Subir Movimientos Bancarios</h1>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files))}
          accept=".xlsx,.xls"
          className="mb-4 block"
        />
        <button
          onClick={handleUpload}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Procesando...' : 'Subir Archivos'}
        </button>
        {message && <p className="mt-4 text-sm text-gray-700">{message}</p>}
      </div>
    </div>
  );
}