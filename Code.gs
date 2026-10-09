// Se pega en la hoja de Google: Extensiones > Apps Script
const NOMBRE_HOJA = 'GastoCasa';
const CARPETA_RAIZ = 'GastosCasa';   // Mi Unidad/GastosCasa
const CARPETA_FOTOS = 'Tickets';     // Mi Unidad/GastosCasa/Tickets
const TOKEN = 'Carabota2026'; // la misma que SHEET_TOKEN en Vercel

// Separador de argumentos de las formulas de tu hoja. Con la configuracion regional
// de Espana es ";" (si tu hoja estuviera en ingles seria ",").
const SEPARADOR_FORMULA = ';';

// OPCIONAL (recomendado): ID de la carpeta Tickets. Es lo que va tras "folders/"
// en la URL cuando abres la carpeta en Drive. Si lo rellenas, se usa esa carpeta
// exacta y no se busca por nombre.
const ID_CARPETA_TICKETS = '1Dr8H17-bauxsT0lcmy6AaYK_vhpikxqT';

// Comprobacion del despliegue: abre la URL /exec en el navegador.
// Si ves {"ok":true,"version":"drive-v7"} esta activa la version nueva.
function doGet() {
  return salida({ ok: true, version: 'drive-v7' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const d = JSON.parse(e.postData.contents);

    if (String(d.token || '').trim() !== String(TOKEN).trim()) {
      return salida({ ok: false, error: 'Token incorrecto' });
    }

    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOMBRE_HOJA);
    if (!hoja) {
      return salida({ ok: false, error: 'No existe la hoja "' + NOMBRE_HOJA + '"' });
    }

    // Si llega el nombre de la foto pero no la imagen, algo falla por el camino
    if (d.nombreFoto && !d.foto) {
      return salida({
        ok: false,
        error: 'Llego el nombre de la foto pero no la imagen (¿api/guardar.js sin actualizar en Vercel?)'
      });
    }

    // 1) Subir la foto a Drive. Si falla, no se escribe la fila.
    let urlFoto = '';
    let urlCarpeta = '';
    if (d.foto) {
      const blob = Utilities.newBlob(
        Utilities.base64Decode(d.foto),
        'image/jpeg',
        d.nombreFoto || 'ticket.jpg'
      );
      const carpeta = carpetaTickets();
      const archivo = carpeta.createFile(blob);
      urlFoto = archivo.getUrl();
      urlCarpeta = carpeta.getUrl();
    }

    // 2) Escribir la fila: Fecha | Establecimiento | Gasto | Nombre Foto
    hoja.appendRow([
      d.fecha || '',                       // solo fecha: AAAA-MM-DD
      d.establecimiento || '',
      (d.gasto === null || d.gasto === undefined) ? '' : d.gasto,
      d.nombreFoto || ''                   // este si lleva fecha y hora
    ]);

    const fila = hoja.getLastRow();
    hoja.getRange(fila, 1).setNumberFormat('dd/mm/yyyy');

    // El nombre de la foto pasa a ser un hipervinculo que abre la foto en Drive.
    if (urlFoto && d.nombreFoto) {
      ponerEnlace(hoja.getRange(fila, 4), urlFoto, d.nombreFoto);   // columna D = Nombre Foto
    }

    return salida({ ok: true, urlFoto: urlFoto, urlCarpeta: urlCarpeta });

  } catch (err) {
    return salida({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Devuelve la carpeta de fotos
function carpetaTickets() {
  if (ID_CARPETA_TICKETS) {
    return DriveApp.getFolderById(ID_CARPETA_TICKETS);
  }
  const raiz = buscarOCrear(DriveApp.getRootFolder(), CARPETA_RAIZ);
  return buscarOCrear(raiz, CARPETA_FOTOS);
}

function buscarOCrear(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

// Prueba desde el editor: crea un archivo de texto en la carpeta y muestra su enlace
// en Ver > Registros de ejecucion. Sirve tambien para dar permiso a Drive.
function autorizar() {
  const carpeta = carpetaTickets();
  const f = carpeta.createFile('prueba.txt', 'Si ves este archivo, la carpeta es correcta.');
  console.log('Carpeta: ' + carpeta.getUrl());
  console.log('Archivo de prueba: ' + f.getUrl());
}

// Escribe =HYPERLINK(url; nombre) en la celda. Usa primero el separador configurado
// (SEPARADOR_FORMULA) y, solo si la celda sale en error, prueba con el otro.
function ponerEnlace(celda, url, nombre) {
  const q = (t) => String(t).replace(/"/g, '""');
  const separadores = [SEPARADOR_FORMULA, SEPARADOR_FORMULA === ';' ? ',' : ';'];
  for (let i = 0; i < separadores.length; i++) {
    celda.setFormula('=HYPERLINK("' + q(url) + '"' + separadores[i] + '"' + q(nombre) + '")');
    SpreadsheetApp.flush();
    if (String(celda.getDisplayValue()).indexOf('#ERROR') !== 0) return true;
  }
  celda.setValue(nombre); // ultimo recurso: al menos queda el nombre en texto
  return false;
}

// Ejecutala UNA VEZ desde el editor para arreglar las celdas que ya muestran #ERROR!
function repararEnlaces() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOMBRE_HOJA);
  const ultima = hoja.getLastRow();
  let arregladas = 0;
  for (let fila = 2; fila <= ultima; fila++) {
    const celda = hoja.getRange(fila, 4);
    if (String(celda.getDisplayValue()).indexOf('#ERROR') !== 0) continue;
    const textos = String(celda.getFormula()).match(/"(?:[^"]|"")*"/g);
    if (textos && textos.length >= 2) {
      const limpiar = (t) => t.slice(1, -1).replace(/""/g, '"');
      ponerEnlace(celda, limpiar(textos[0]), limpiar(textos[1]));
      arregladas++;
    }
  }
  console.log('Celdas reparadas: ' + arregladas);
}

function salida(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
