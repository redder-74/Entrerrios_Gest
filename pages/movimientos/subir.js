import { useState } from 'react'

export default function UploadPage() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files)
    setFiles(selectedFiles)
    setResult(null)
    e.target.value = '' // Reset input para permitir reselección
  }

  const handleUpload = async () => {
    if (!files.length) {
      setResult({
        success: false,
        error: 'No hay archivos seleccionados',
        details: 'Por favor, selecciona al menos un archivo Excel (.xls, .xlsx)'
      })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file)
      })

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Error en el servidor')
      }

      const data = await response.json()

      setResult({
        success: true,
        message: 'Archivo procesado correctamente',
        details: `Se procesaron ${data.summary?.totalSuccess || 0} registros`,
        data: data.results
      })

    } catch (error) {
      console.error('Error en la subida:', error)
      
      setResult({
        success: false,
        error: 'Error al subir el archivo',
        details: error.message || 'Ocurrió un error desconocido',
        debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Subir Movimientos Bancarios</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selecciona archivos Excel
          </label>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".xls,.xlsx"
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
            multiple
            key={Date.now()} // Fuerza recreación del input
          />
          <p className="mt-1 text-sm text-gray-500">
            Formatos aceptados: .xls, .xlsx (máx. 5MB)
          </p>
        </div>

        {files.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <h3 className="font-medium mb-2">Archivos listos para subir:</h3>
            <ul className="text-sm space-y-1">
              {files.map((file, index) => (
                <li key={index} className="flex items-center">
                  <span className="text-gray-600">{file.name}</span>
                  <span className="ml-auto text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={loading || !files.length}
          className={`px-4 py-2 rounded-md text-white ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {loading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Procesando...
            </span>
          ) : 'Subir Archivos'}
        </button>

        {result && (
          <div className={`mt-4 p-4 rounded-md ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <h3 className="font-medium flex items-center">
              {result.success ? (
                <>
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Éxito
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Error
                </>
              )}
            </h3>
            <p className="mt-1">{result.message || result.error}</p>
            <p className="mt-2 text-sm">{result.details}</p>
            
            {!result.success && process.env.NODE_ENV === 'development' && result.debug && (
              <div className="mt-3 p-2 bg-black bg-opacity-10 rounded text-xs font-mono overflow-x-auto">
                {result.debug}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
