import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { IncomingForm } from 'formidable'
import { promises as fs } from 'fs'

export const config = {
  api: {
    bodyParser: false
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

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

        // Insertar en Supabase
        const { error: insertError } = await supabase
          .from('movimientos')
          .insert(transformedData)

        if (insertError) {
          throw new Error(`Error en Supabase: ${insertError.message}`)
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

// Transformación para CaixaBank
function transformCaixabankData(data) {
  return data.map(item => {
    // Convertir importe (combinar Ingreso (+) y Gasto (-))
    const importe = (item['Ingreso (+)'] || 0) - (item['Gasto (-)'] || 0)

    return {
      Fecha: convertDate(item['F. Operación']),
      FechaValor: convertDate(item['F. Valor']),
      Descripcion: [item['Concepto común'], item['Concepto propio']]
        .filter(Boolean)
        .join(' - ')
        .slice(0, 255), // Limitar longitud
      Importe: importe,
      Divisa: item.Divisa || 'EUR',
      SaldoPosterior: item['Saldo (+)'] || item['Saldo (-)'] || 0,
      Divisasaldo: item.Divisa || 'EUR',
      Oficina: item.Oficina || null,
      Concepto1: item['Referencia 1']?.slice(0, 100) || '',
      Concepto2: item['Referencia 2']?.slice(0, 100) || '',
      Concepto3: item['Concepto complementario 1']?.slice(0, 100) || '',
      Concepto4: item['Concepto complementario 2']?.slice(0, 100) || '',
      Concepto5: item['Concepto complementario 3']?.slice(0, 100) || '',
      Concepto6: item['Concepto complementario 4']?.slice(0, 100) || '',
      Tipo: detectTransactionType(importe, item['Concepto común']),
      Revisado: false
    }
  })
}

// Transformación para Santander (similar pero con estructura diferente)
function transformSantanderData(data) {
  return data.map(item => {
    const importe = Number(item['Importe']) || 0

    return {
      Fecha: convertDate(item['Fecha Operación']),
      FechaValor: convertDate(item['Fecha Valor']),
      Descripcion: item.Concepto?.slice(0, 255) || '',
      Importe: importe,
      Divisa: item.Divisa || 'EUR',
      SaldoPosterior: Number(item.Saldo) || 0,
      Divisasaldo: item.Divisa || 'EUR',
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