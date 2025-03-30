import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { IncomingForm } from 'formidable'
import { promises as fs } from 'fs'

export const config = {
  api: {
    bodyParser: false
  }
}

//const supabaseUrl = process.env.SUPABASE_URL || 'https://lfvplndopkeubhequkrf.supabase.co'
//const supabaseKey = process.env.SUPABASE_KEY || //'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdnBsbmRvcGtldWJoZXF1a3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMyNDIxNzYsImV4cCI6MjA1ODgxODE3Nn0.bUrI2y//bDisLUNI58oc-23bpeGF5gB2rs707XSk1HFqI'

//Inicializar Supabase
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY')
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

// Tipos MIME permitidos
const ALLOWED_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream' // Para algunos .xls
]

// Columnas requeridas por banco
const BANK_REQUIREMENTS = {
  caixabank: ['F. Operación', 'F. Valor', 'Ingreso (+)', 'Gasto (-)', 'Divisa'],
  santander: ['Fecha Operación', 'Fecha Valor', 'Concepto', 'Importe', 'Divisa']
}

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
    keepExtensions: true,
    multiples: true
  })

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err)
        else resolve([fields, files])
      })
    })

    // Validación 1: Archivos subidos
    if (!files.files || !Array.isArray(files.files) || files.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se detectaron archivos',
        details: 'Por favor, selecciona al menos un archivo Excel',
        errorCode: 'NO_FILES'
      })
    }

    const processingResults = []
    
    for (const file of files.files) {
      try {
        // Validación 2: Tipo de archivo
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          processingResults.push({
            filename: file.originalFilename,
            success: false,
            error: 'Formato de archivo no válido',
            details: `Tipo detectado: ${file.mimetype || 'desconocido'}`,
            allowedTypes: ALLOWED_MIME_TYPES,
            errorCode: 'INVALID_FILE_TYPE'
          })
          continue
        }

        // Validación 3: Tamaño del archivo
        if (file.size > 5 * 1024 * 1024) {
          processingResults.push({
            filename: file.originalFilename,
            success: false,
            error: 'Archivo demasiado grande',
            details: `Tamaño: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Límite: 5MB`,
            errorCode: 'FILE_TOO_LARGE'
          })
          continue
        }

        // Leer archivo Excel
        const fileBuffer = await fs.readFile(file.filepath)
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])

        // Validación 4: Datos en el archivo
        if (!rawData || rawData.length === 0) {
          processingResults.push({
            filename: file.originalFilename,
            success: false,
            error: 'Archivo vacío o sin datos',
            details: 'El archivo Excel no contiene datos en la primera hoja',
            errorCode: 'EMPTY_FILE'
          })
          continue
        }

        // Determinar tipo de archivo
        let bankType
        if (file.originalFilename.toLowerCase().includes('caixabank')) {
          bankType = 'caixabank'
        } else if (file.originalFilename.toLowerCase().includes('santander')) {
          bankType = 'santander'
        } else {
          processingResults.push({
            filename: file.originalFilename,
            success: false,
            error: 'Tipo de archivo no reconocido',
            details: 'El nombre del archivo debe contener "Santander" o "Caixabank"',
            requiredNaming: 'Ejemplo: "2024_10_Movimientos_Caixabank.xls"',
            errorCode: 'UNKNOWN_BANK_TYPE'
          })
          continue
        }

        // Validación 5: Estructura del archivo
        const missingColumns = BANK_REQUIREMENTS[bankType].filter(
          col => !rawData[0].hasOwnProperty(col)
        )

        if (missingColumns.length > 0) {
          processingResults.push({
            filename: file.originalFilename,
            success: false,
            error: 'Estructura de archivo incorrecta',
            details: `Faltan columnas requeridas: ${missingColumns.join(', ')}`,
            requiredColumns: BANK_REQUIREMENTS[bankType],
            errorCode: 'MISSING_COLUMNS'
          })
          continue
        }

        // Transformar datos
        const transformedData = bankType === 'caixabank' 
          ? transformCaixabankData(rawData) 
          : transformSantanderData(rawData)

        // Validación 6: Datos transformados
        if (transformedData.length === 0) {
          processingResults.push({
            filename: file.originalFilename,
            success: false,
            error: 'No se pudieron procesar los datos',
            details: 'El formato de los datos no coincide con lo esperado',
            errorCode: 'TRANSFORM_ERROR'
          })
          continue
        }

	// Logs de Diagnostico
	console.log('Datos a insertar:', {
  	  sample: transformedData[0],
  	  count: transformedData.length,
  	  supabaseConfig: {
    	    url: supabaseUrl,
	    table: 'TbMovimientos'
  }
})

        // Insertar en Supabase
       const { data, error } = await supabase
  	.from('TbMovimientos')
  	.insert(transformedData)
   	.select() // Para obtener feedback

       console.log('Resultado de Supabase:', { data, error })

      if (error) {
  	console.error('Error detallado de Supabase:', {
    	   message: error.message,
    	   code: error.code,
    	   details: error.details,  // Coma añadida aquí
    	   hint: error.hint
     	});
     throw new Error(`Error al insertar en TbMovimientos: ${error.message}`);
     }

        processingResults.push({
          filename: file.originalFilename,
          success: true,
          recordsProcessed: transformedData.length,
          firstRecord: transformedData[0] // Para referencia
        })

      } catch (error) {
        processingResults.push({
          filename: file?.originalFilename || 'desconocido',
          success: false,
          error: 'Error al procesar archivo',
          details: error.message,
          errorCode: 'PROCESSING_ERROR',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        })
      } finally {
        // Eliminar archivo temporal
        if (file?.filepath) {
          await fs.unlink(file.filepath).catch(() => {})
        }
      }
    }

    // Resultado final
    const allSuccess = processingResults.every(r => r.success)
    const someSuccess = processingResults.some(r => r.success)

    return res.status(allSuccess ? 200 : someSuccess ? 207 : 400).json({
      success: someSuccess,
      processedFiles: processingResults.length,
      results: processingResults,
      summary: {
        totalSuccess: processingResults.filter(r => r.success).length,
        totalErrors: processingResults.filter(r => !r.success).length
      }
    })

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Error en el servidor',
      details: error.message,
      errorCode: 'SERVER_ERROR',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

//Conversion de Fechas
function formatSupabaseDate(dateStr) {
  if (!dateStr) return null;
  
  // Para formato "dd/mm/yyyy"
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 00:00:00`;
  }
  
  // Para objetos Date
  if (dateStr instanceof Date) {
    return dateStr.toISOString().replace('T', ' ').replace('.000Z', '');
  }
  
  return null;
}

// Transformación para CaixaBank
function transformCaixabankData(data) {
  return data
    .filter(item => item['F. Operación'] && item['F. Valor']) // Filtra filas sin fechas
    .map(item => {
      try {
        // Conversión segura de números
        const parseNum = (val) => {
          if (typeof val === 'number') return val
          const num = parseFloat(String(val).replace(/\./g, '').replace(',', '.'))
          return isNaN(num) ? 0 : num
        }

        return {
          Fecha: formatSupabaseDate(item['F. Operación']),
          FechaValor: formatSupabaseDate(item['F. Valor']),
          Descripcion: [item['Concepto común'], item['Concepto propio']]
            .filter(Boolean)
            .join(' - ')
            .slice(0, 255),
          Importe: parseNum(item['Ingreso (+)']) - parseNum(item['Gasto (-)']),
          Divisa: (item.Divisa || 'EUR').trim(),
          SaldoPosterior: parseNum(item['Saldo (+)'] || item['Saldo (-)'] || 0),
	  DivisaSaldo: String(item.Divisa || 'EUR').trim().slice(0, 3),
          Oficina: item.Oficina ? String(item.Oficina).slice(0, 20) : null,
          Revisado: false
	  
        }
      } catch (e) {
        console.error('Error transformando fila:', item, e)
        return null
      }
    })
    .filter(Boolean) // Eliminar nulos
}
// Transformación para Santander (similar pero con estructura diferente)
function transformSantanderData(data) {
  return data.map(item => {
    const importe = Number(item['Importe']) || 0

    return {
      Fecha: formatSupabaseDate(item['Fecha Operación']),
      FechaValor: formatSupabaseDate(item['Fecha Valor']),
      Descripcion: item.Concepto?.slice(0, 255) || '',
      Importe: importe,
      Divisa: item.Divisa || 'EUR',
      SaldoPosterior: Number(item.Saldo) || 0,
      DivisaSaldo: item.Divisa || 'EUR',
      Oficina: null, // Santander no proporciona oficina
      Concepto1: item['Referencia 1']?.slice(0, 100) || '',
      Concepto2: item['Referencia 2']?.slice(0, 100) || '',
      Concepto3: item['Información adicional']?.slice(0, 100) || '',
      Concepto4: '',
      Concepto5: '',
      Concepto6: '',
      Tipo: detectTransactionType(importe, item.Concepto),
      Revisado: false
    }
  })
}

// Helper: Convertir fecha dd/mm/aaaa a ISO
function convertDate(dateStr) {
  if (!dateStr) return null
  try {
    // Para formato dd/mm/aaaa
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/')
      return new Date(`${year}-${month}-${day}`).toISOString()
    }
    // Para objetos Date de Excel
    return new Date(dateStr).toISOString()
  } catch {
    return null
  }
}

// Helper: Detectar tipo de transacción
function detectTransactionType(amount, description) {
  if (!description) return 0
  
  const desc = description.toLowerCase()
  if (desc.includes('transferencia')) return 1
  if (desc.includes('recibo')) return 2
  if (desc.includes('tarjeta')) return 3
  if (desc.includes('ingreso')) return 4
  return amount >= 0 ? 5 : 6 // Otros (positivo/negativo)
}
}
