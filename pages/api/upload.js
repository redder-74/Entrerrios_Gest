import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// Configura Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    // Obtener archivos del request
    const files = req.files?.files; // Asume que se usa middleware como `multer` o `next-connect` para manejar FormData
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No se subieron archivos.' });
    }

    let allTransformedData = [];

    for (const file of files) {
      // Leer el archivo Excel
      const workbook = XLSX.read(file.data);
      const sheetName = workbook.SheetNames[0];
      const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      // Transformar según el banco de origen
      let transformedData;
      if (file.name.includes('Santander')) {
        transformedData = transformSantanderData(rawData);
      } else if (file.name.includes('Caixabank')) {
        transformedData = transformCaixabankData(rawData);
      } else {
        console.warn(`Archivo no reconocido: ${file.name}`);
        continue;
      }

      allTransformedData = [...allTransformedData, ...transformedData];
    }

    // Subir a Supabase
    const { data, error } = await supabase
      .from('movimientos')
      .insert(allTransformedData);

    if (error) {
      throw error;
    }

    return res.status(200).json({ 
      message: 'Archivos procesados correctamente.',
      count: allTransformedData.length
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      message: 'Error al procesar archivos',
      details: error.message 
    });
  }
}

// Transformación para Santander
function transformSantanderData(data) {
  return data.map(item => {
    // Convertir fechas de "dd/mm/aaaa" a "yyyy-mm-dd hh:mm:ss"
    const fechaOperacion = item['Fecha Operación'] 
      ? new Date(item['Fecha Operación'].split('/').reverse().join('-')).toISOString()
      : null;

    const fechaValor = item['Fecha Valor']
      ? new Date(item['Fecha Valor'].split('/').reverse().join('-')).toISOString()
      : null;

    // Convertir números (ej: "1.234,56" → 1234.56)
    const parseNumber = (str) => {
      if (typeof str === 'number') return str;
      return parseFloat(str.toString().replace(/\./g, '').replace(',', '.'));
    };

    return {
      Fecha: fechaOperacion,
      FechaValor: fechaValor,
      Descripcion: item['Concepto'] || '',
      Importe: parseNumber(item['Importe']) || 0,
      Divisa: item['Divisa'] || 'EUR',
      SaldoPosterior: parseNumber(item['Saldo']) || 0,
      Divisasaldo: item['Divisa'] || 'EUR',
      Oficina: null, // Santander no proporciona oficina
      Concepto1: item['Referencia 1'] || '',
      Concepto2: item['Referencia 2'] || '',
      Concepto3: item['Información adicional'] || '',
      Concepto4: '',
      Concepto5: '',
      Concepto6: '',
      Tipo: 0, // Valor por defecto
      Revisado: false
    };
  });
}

// Transformación para CaixaBank
function transformCaixabankData(data) {
  return data.map(item => {
    const fechaOperacion = item['F. Operación']
      ? new Date(item['F. Operación'].split('/').reverse().join('-')).toISOString()
      : null;

    const fechaValor = item['F. Valor']
      ? new Date(item['F. Valor'].split('/').reverse().join('-')).toISOString()
      : null;

    // Combinar Ingreso (+) y Gasto (-) en Importe
    const importe = (item['Ingreso (+)'] || 0) - (item['Gasto (-)'] || 0);

    return {
      Fecha: fechaOperacion,
      FechaValor: fechaValor,
      Descripcion: item['Concepto común'] || item['Concepto propio'] || '',
      Importe: importe,
      Divisa: item['Divisa'] || 'EUR',
      SaldoPosterior: item['Saldo (+)'] || item['Saldo (-)'] || 0,
      Divisasaldo: item['Divisa'] || 'EUR',
      Oficina: item['Oficina'] || null,
      Concepto1: item['Referencia 1'] || '',
      Concepto2: item['Referencia 2'] || '',
      Concepto3: item['Concepto complementario 1'] || '',
      Concepto4: item['Concepto complementario 2'] || '',
      Concepto5: item['Concepto complementario 3'] || '',
      Concepto6: item['Concepto complementario 4'] || '',
      Tipo: 0, // Valor por defecto
      Revisado: false
    };
  });
}