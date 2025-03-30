import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { IncomingForm } from 'formidable'
import { promises as fs } from 'fs'

export const config = {
  api: {
    bodyParser: false
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Método no permitido',
      details: 'Esta API solo acepta peticiones POST'
    })
  }

  console.log('Iniciando procesamiento de archivo...')

  try {
    const form = new IncomingForm()
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err)
        else resolve([fields, files])
      })
    })

    console.log('Archivos recibidos:', files)

    if (!files.files || files.files.length === 0) {
      console.error('No se recibieron archivos')
      return res.status(400).json({
        success: false,
        error: 'No se subieron archivos',
        details: 'Debes seleccionar al menos un archivo Excel'
      })
    }

    const file = files.files[0]
    console.log('Procesando archivo:', file.originalFilename)

    // Leer el archivo Excel
    const fileBuffer = await fs.readFile(file.filepath)
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])

    console.log('Datos leídos:', rawData.length, 'registros')

    if (!rawData || rawData.length === 0) {
      console.error('El archivo está vacío')
      return res.status(400).json({
        success: false,
        error: 'Archivo vacío',
        details: 'El archivo Excel no contiene datos procesables'
      })
    }

    // Transformar datos (ejemplo para CaixaBank)
    const transformedData = rawData.map(item => {
      const importe = (item['Ingreso (+)'] || 0) - (item['Gasto (-)'] || 0)
      
      return {
        Fecha: item['F. Operación'] ? new Date(item['F. Operación']).toISOString() : null,
        FechaValor: item['F. Valor'] ? new Date(item['F. Valor']).toISOString() : null,
        Descripcion: [item['Concepto común'], item['Concepto propio']].filter(Boolean).join(' - ').slice(0, 255),
        Importe: importe,
        Divisa: item.Divisa || 'EUR',
        SaldoPosterior: item['Saldo (+)'] || item['Saldo (-)'] || 0,
        Divisasaldo: item.Divisa || 'EUR',
        Oficina: item.Oficina || null,
        Revisado: false
      }
    })

    console.log('Datos transformados:', transformedData.length, 'registros')

    // Insertar en Supabase
    const { data, error } = await supabase
      .from('movimientos')
      .insert(transformedData)

    if (error) {
      console.error('Error en Supabase:', error)
      throw new Error(`Error al insertar datos: ${error.message}`)
    }

    console.log('Datos insertados correctamente')

    // Limpiar archivo temporal
    await fs.unlink(file.filepath).catch(console.error)

    return res.status(200).json({
      success: true,
      message: 'Archivo procesado correctamente',
      recordsProcessed: transformedData.length,
      firstRecord: transformedData[0] // Para depuración
    })

  } catch (error) {
    console.error('Error en el servidor:', error)
    return res.status(500).json({
      success: false,
      error: 'Error en el servidor',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
