// components/RevisarMovimientos.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function RevisarMovimientos() {
  const [movimientos, setMovimientos] = useState([]);
  const [conceptos, setConceptos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      // Cargar movimientos no revisados
      const { data: movs } = await supabase
        .from('TbMovimientos')
        .select('*')
        .eq('Revisado', false);

      // Cargar conceptos para el dropdown
      const { data: conc } = await supabase
        .from('TbConceptos')
        .select('id, Tipo')
        .order('Tipo', { ascending: true });

      setMovimientos(movs || []);
      setConceptos(conc || []);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTipoChange = (id, value) => {
    setMovimientos(prev => prev.map(m => 
      m.id === id ? { ...m, tipoSeleccionado: value } : m
    ));
  };

  const handleRevisadoChange = (id) => {
    setMovimientos(prev => prev.map(m => 
      m.id === id ? { ...m, marcadoRevisado: !m.marcadoRevisado } : m
    ));
  };

  const actualizarCambios = async () => {
    try {
      setLoading(true);
      const updates = movimientos
        .filter(m => m.marcadoRevisado)
        .map(m => ({
          id: m.id,
          Tipo: m.tipoSeleccionado,
          Revisado: true
        }));

      // Actualización por lotes
      const { error } = await supabase
        .from('TbMovimientos')
        .upsert(updates);

      if (error) throw error;
      
      // Recargar datos actualizados
      await cargarDatos();
    } catch (error) {
      console.error('Error actualizando:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Cargando...</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Revisar Movimientos</h2>
      
      <button 
        onClick={actualizarCambios}
        disabled={loading}
        className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Actualizar Cambios
      </button>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="py-2 px-4 border">Fecha</th>
              <th className="py-2 px-4 border">Descripción</th>
              <th className="py-2 px-4 border">Importe</th>
              <th className="py-2 px-4 border">Tipo</th>
              <th className="py-2 px-4 border">Revisado</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map(mov => (
              <tr key={mov.id} className="border">
                <td className="py-2 px-4 border">{new Date(mov.Fecha).toLocaleDateString()}</td>
                <td className="py-2 px-4 border">{mov.Descripcion}</td>
                <td className="py-2 px-4 border">{mov.Importe} {mov.Divisa}</td>
                <td className="py-2 px-4 border">
                  <select
                    value={mov.tipoSeleccionado || ''}
                    onChange={(e) => handleTipoChange(mov.id, e.target.value)}
                    className="border p-1 rounded"
                  >
                    <option value="">Seleccionar...</option>
                    {conceptos.map(concepto => (
                      <option key={concepto.id} value={concepto.id}>
                        {concepto.Tipo}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 px-4 border text-center">
                  <input
                    type="checkbox"
                    checked={mov.marcadoRevisado || false}
                    onChange={() => handleRevisadoChange(mov.id)}
                    className="h-4 w-4"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}