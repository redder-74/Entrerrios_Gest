import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { IncomingForm } from 'formidable'

export const config = {
  api: {
    bodyParser: false
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

const ALLOWED_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Método no permitido',
      details: 'Solo se aceptan peticiones POST'
    })
  }

  const form = new IncomingForm({
    maxFileSize: 5 * 1024 * 1024, // 5MB
    keepExtensions: true
  })

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Error en el servidor',
        details: err.message
      })
    }

    // Validación 1: Archivos subidos
    if (!files.files || files.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se detectaron archivos',
        details: 'Por favor, selecciona al menos un archivo Excel'
      })
    }

    const file = files.files[0]

    // Validación 2: Tipo de archivo
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de archivo no válido',
        details: `Tipo detectado: ${file.mimetype}. Solo se aceptan archivos Excel (.xls, .xlsx)`,
        requiredFormat: 'Excel (XLS o XLSX)'
      })
    }

    // Validación 3: Tamaño del archivo
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'Archivo demasiado grande',
        details: `Tamaño: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Límite: 5MB`
      })
    }

    try {
      // Leer y procesar el archivo
      const workbook = XLSX.readFile(file.filepath)
      const sheetName = workbook.SheetNames[0]
      const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])

      // Validación 4: Estructura del Excel
      if (!rawData || rawData.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Archivo vacío o sin datos',
          details: 'El archivo Excel no contiene datos en la primera hoja'
        })
      }

      // Transformar datos según el banco
      let transformedData
      if (file.originalFilename.includes('Santander')) {
        transformedData = transformSantanderData(rawData)
      } else if (file.originalFilename.includes('Caixabank')) {
        transformedData = transformCaixabankData(rawData)
      } else {
        return res.status(400).json({
          success: false,
          error: 'Tipo de archivo no reconocido',
          details: 'El nombre del archivo debe contener "Santander" o "Caixabank"',
          requiredNaming: 'Ejemplo: "2024_10_Movimientos_Caixabank.xls"'
        })
      }

      // Validación 5: Datos transformados
      if (transformedData.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Datos no reconocidos',
          details: 'El archivo no contiene el formato esperado para este banco'
        })
      }

      // Insertar en Supabase
      const { error: dbError } = await supabase
        .from('movimientos')
        .insert(transformedData)

      if (dbError) {
        throw new Error(`Error en Supabase: ${dbError.message}`)
      }

      return res.status(200).json({
        success: true,
        message: 'Archivo procesado correctamente',
        filename: file.originalFilename,
        recordsProcessed: transformedData.length,
        firstRecord: transformedData[0] // Para depuración
      })

    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Error al procesar el archivo',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    }
  })
}

// Funciones de transformación (ejemplo para CaixaBank)
function transformCaixabankData(data) {
  const requiredColumns = ['F. Operación', 'F. Valor', 'Ingreso (+)', 'Gasto (-)']
  
  // Verificar columnas requeridas
  if (data.length > 0) {
    const missingColumns = requiredColumns.filter(col => !(col in data[0]))
    if (missingColumns.length > 0) {
      throw new Error(`Faltan columnas requeridas: ${missingColumns.join(', ')}`)
    }
  }

  return data.map(item => ({
    Fecha: convertDate(item['F. Operación']),
    FechaValor: convertDate(item['F. Valor']),
    Descripcion: [item['Concepto común'], item['Concepto propio']].filter(Boolean).join(' - '),
    Importe: (item['Ingreso (+)'] || 0) - (item['Gasto (-)'] || 0),
    Divisa: item.Divisa || 'EUR',
    Oficina: item.Oficina || null,
    // ... otros campos
  }))
}

function convertDate(dateStr) {
  if (!dateStr) return null
  const [day, month, year] = dateStr.split('/')
  return new Date(`${year}-${month}-${day}`).toISOString()
}
