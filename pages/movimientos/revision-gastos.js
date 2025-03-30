import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function RevisionGastos() {
  const [movimientos, setMovimientos] = useState([])
  const [conceptos, setConceptos] = useState([])
  const [selectedTipos, setSelectedTipos] = useState({})
  const [revisados, setRevisados] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMovimientos()
    fetchConceptos()
  }, [])

  const fetchMovimientos = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('TbMovimientos')
        .select('*')
        .or('Revisado.is.false,Revisado.is.null')
        .lt('Importe', 0)
        .order('FechaValor', { ascending: true })

      if (error) throw error
      setMovimientos(data || [])
      
      // Inicializar los estados para los dropdowns y checkboxes
      const initialTipos = {}
      const initialRevisados = {}
      data.forEach(mov => {
        initialTipos[mov.id] = ''
        initialRevisados[mov.id] = false
      })
      setSelectedTipos(initialTipos)
      setRevisados(initialRevisados)
    } catch (error) {
      console.error('Error fetching movimientos:', error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchConceptos = async () => {
    try {
      const { data, error } = await supabase
        .from('TbConceptos')
        .select('id, Tipo')
        .order('Tipo', { ascending: true })

      if (error) throw error
      setConceptos(data || [])
    } catch (error) {
      console.error('Error fetching conceptos:', error.message)
    }
  }

  const handleTipoChange = (movimientoId, tipoId) => {
    setSelectedTipos(prev => ({
      ...prev,
      [movimientoId]: tipoId
    }))
  }

  const handleRevisadoChange = (movimientoId) => {
    setRevisados(prev => ({
      ...prev,
      [movimientoId]: !prev[movimientoId]
    }))
  }

  const handleActualizar = async () => {
    try {
      setLoading(true)
      
      // Filtrar solo los movimientos marcados como revisados
      const movimientosAProcesar = movimientos.filter(mov => revisados[mov.id])
      
      // Actualizar los movimientos en TbMovimientos
      const updates = movimientosAProcesar.map(mov => 
        supabase
          .from('TbMovimientos')
          .update({ 
            Revisado: true,
            Tipo: selectedTipos[mov.id]
          })
          .eq('id', mov.id)
      )
      
      // Insertar nuevos registros en TbGastos
      const inserts = movimientosAProcesar.map(mov => {
        const fecha = new Date(mov.FechaValor)
        return supabase
          .from('TbGastos')
          .insert({
            Año: fecha.getFullYear(),
            Mes: fecha.getMonth() + 1, // Los meses van de 0 a 11
            Concepto: mov.Descripcion,
            Importe: mov.Importe,
            Tipo: selectedTipos[mov.id],
            Revisado: true
          })
      })
      
      // Ejecutar todas las operaciones
      const results = await Promise.all([...updates, ...inserts])
      
      // Verificar si hubo errores
      const hasErrors = results.some(result => result.error)
      if (hasErrors) {
        throw new Error('Ocurrieron errores al actualizar los datos')
      }
      
      // Refrescar la lista de movimientos
      await fetchMovimientos()
      
      alert('Cambios actualizados correctamente')
    } catch (error) {
      console.error('Error al actualizar:', error.message)
      alert('Error al actualizar: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading && movimientos.length === 0) {
    return <div>Cargando...</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Revisión de Gastos Pendientes</h1>
      
      <button
        onClick={handleActualizar}
        disabled={loading || !Object.values(revisados).some(v => v)}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-6 disabled:opacity-50"
      >
        {loading ? 'Procesando...' : 'Actualizar Cambios'}
      </button>
      
      {movimientos.length === 0 ? (
        <p>No hay gastos pendientes de revisión</p>
      ) : (
        <div className="space-y-6">
          {movimientos.map(movimiento => (
            <div key={movimiento.id} className="border p-4 rounded-lg shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold">{movimiento.Descripcion}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(movimiento.FechaValor).toLocaleDateString()} - 
                    Importe: {movimiento.Importe.toFixed(2)} €
                  </p>
                </div>
              </div>
              
              <div className="mt-4 flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={selectedTipos[movimiento.id] || ''}
                    onChange={(e) => handleTipoChange(movimiento.id, e.target.value)}
                    className="w-full p-2 border rounded"
                    disabled={loading}
                  >
                    <option value="">Selecciona un tipo</option>
                    {conceptos.map(concepto => (
                      <option key={concepto.id} value={concepto.id}>
                        {concepto.Tipo}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={`revisado-${movimiento.id}`}
                    checked={revisados[movimiento.id] || false}
                    onChange={() => handleRevisadoChange(movimiento.id)}
                    disabled={loading || !selectedTipos[movimiento.id]}
                    className="h-5 w-5 text-blue-600 rounded"
                  />
                  <label htmlFor={`revisado-${movimiento.id}`} className="ml-2 block text-sm text-gray-700">
                    Revisado
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
