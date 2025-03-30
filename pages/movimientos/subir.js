import { useState } from 'react'
import { useRouter } from 'next/router'

export default function UploadPage() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const router = useRouter()

  const handleUpload = async () => {
    if (files.length === 0) {
      setResult({
        success: false,
        error: 'No hay archivos seleccionados',
        details: 'Por favor, selecciona al menos un archivo'
      })
      return
    }

    setLoading(true)
    setResult(null)

    const formData = new FormData()
    files.forEach(file => formData.append('files', file))

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error desconocido')
      }

      setResult({
        success: true,
        message: data.message,
        details: `Procesados ${data.recordsProcessed} registros`,
        filename: data.filename
      })

      // Resetear el formulario después de 5 segundos
      setTimeout(() => {
        setFiles([])
        setResult(null)
      }, 5000)

    } catch (error) {
      const errorData = error.response ? await error.response.json() : null
      
      setResult({
        success: false,
        error: errorData?.error || 'Error en la subida',
        details: errorData?.details || error.message,
        requiredFormat: errorData?.requiredFormat,
        requiredNaming: errorData?.requiredNaming
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
            Selecciona archivos Excel (Santander o CaixaBank)
          </label>
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files))}
            accept=".xls,.xlsx"
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
          <p className="mt-1 text-sm text-gray-500">
            Formatos aceptados: .xls, .xlsx (máx. 5MB)
          </p>
        </div>

        <button
          onClick={handleUpload}
          disabled={loading || files.length === 0}
          className={`px-4 py-2 rounded-md text-white ${loading || files.length === 0 ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} transition-colors`}
        >
          {loading ? 'Procesando...' : 'Subir Archivos'}
        </button>

        {/* Mostrar resultados */}
        {result && (
          <div className={`mt-4 p-4 rounded-md ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <h3 className="font-medium">
              {result.success ? '✅ Éxito' : '❌ Error'}
            </h3>
            <p className="mt-1">{result.message || result.error}</p>
            
            {result.details && (
              <p className="mt-2 text-sm">{result.details}</p>
            )}

            {!result.success && (
              <div className="mt-3 text-sm">
                {result.requiredFormat && (
                  <p><span className="font-medium">Formato requerido:</span> {result.requiredFormat}</p>
                )}
                {result.requiredNaming && (
                  <p><span className="font-medium">Nombre requerido:</span> {result.requiredNaming}</p>
                )}
              </div>
            )}

            {result.success && (
              <div className="mt-3 text-sm">
                <p><span className="font-medium">Archivo:</span> {result.filename}</p>
                <p><span className="font-medium">Registros:</span> {result.recordsProcessed}</p>
              </div>
            )}
          </div>
        )}

        {/* Ejemplo de nombres válidos */}
        <div className="mt-6 bg-gray-50 p-4 rounded-md">
          <h3 className="font-medium text-gray-700 mb-2">Ejemplos de nombres válidos:</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 2024_10_Movimientos_Santander.xlsx</li>
            <li>• 2025_02_Caixabank.xls</li>
            <li>• Movimientos_2024_Santander.xlsx</li>
          </ul>
        </div>
      </div>
    </div>
  )
}