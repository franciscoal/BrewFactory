/**
 * BrewFactory — webhook para registrar decisiones en esta hoja de cálculo.
 *
 * Instalación (5 minutos, ver README):
 *  1. En la hoja: Extensiones → Apps Script. Pega este código (sustituye el que haya) y guarda.
 *  2. Ajustes del proyecto (engranaje) → Propiedades de la secuencia de comandos → añade SECRETO con un texto largo y aleatorio.
 *  3. Implementar → Nueva implementación → tipo «Aplicación web».
 *     Ejecutar como: Yo. Quién tiene acceso: Cualquier usuario.
 *  4. Copia la URL que termina en /exec en SHEETS_WEBHOOK_URL, y el secreto en SHEETS_SECRET (fichero .env.local).
 *  5. Si cambias este código, hay que publicar una versión nueva: Implementar → Administrar implementaciones → editar → Nueva versión.
 *
 * Seguridad: el script se ejecuta con TU cuenta, así que la hoja puede seguir siendo privada; «Cualquier usuario» solo
 * permite llamar a esta URL, y sin el secreto no escribe nada. El secreto no está en el código sino en las propiedades.
 *
 * Protocolo: POST con {secreto, mensajes: [...]}. Cada mensaje es
 *   {op: 'anadir', hoja, columnas, filas: [{columna: valor}], unicaPor?}
 *   {op: 'actualizar', hoja, filtro: {columna: valor}, campos: {columna: valor}}
 */

var MAX_CELDA = 49000; // Google Sheets admite 50.000 caracteres por celda.

function doPost(e) {
  var candado = LockService.getScriptLock();
  var tieneCandado = false;
  try {
    var cuerpo = JSON.parse(e.postData.contents);
    var secreto = PropertiesService.getScriptProperties().getProperty('SECRETO');
    if (!secreto || cuerpo.secreto !== secreto) return salida_({ ok: false, error: 'Secreto incorrecto.' });
    if (!Array.isArray(cuerpo.mensajes)) return salida_({ ok: false, error: 'Faltan los mensajes.' });

    candado.waitLock(25000);
    tieneCandado = true;
    var cuenta = { anadidas: 0, actualizadas: 0 };
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var cache = {};
    cuerpo.mensajes.forEach(function (m) {
      if (m.op === 'anadir') anadir_(libro, cache, m, cuenta);
      else if (m.op === 'actualizar') actualizar_(libro, cache, m, cuenta);
      else throw new Error('Operación desconocida: ' + m.op);
    });
    return salida_({ ok: true, anadidas: cuenta.anadidas, actualizadas: cuenta.actualizadas });
  } catch (err) {
    return salida_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (tieneCandado) candado.releaseLock();
  }
}

/** Sirve para comprobar en el navegador que el despliegue está vivo (no revela nada). */
function doGet() {
  return salida_({ ok: true, servicio: 'BrewFactory registro' });
}

function salida_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

/** Devuelve la hoja y su cabecera, creándola o ampliándola con las columnas que falten. */
function hoja_(libro, cache, nombre, columnas) {
  var h = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  var c = cache[nombre];
  if (!c) {
    var ancho = h.getLastColumn();
    var cabecera = ancho > 0 ? h.getRange(1, 1, 1, ancho).getValues()[0].map(String) : [];
    c = cache[nombre] = { hoja: h, cabecera: cabecera, datos: null };
    if (cabecera.length === 0) h.setFrozenRows(1);
  }
  var nuevas = (columnas || []).filter(function (col) { return c.cabecera.indexOf(col) < 0; });
  if (nuevas.length > 0) {
    h.getRange(1, c.cabecera.length + 1, 1, nuevas.length).setValues([nuevas]).setFontWeight('bold');
    c.cabecera = c.cabecera.concat(nuevas);
    c.datos = null;
  }
  return c;
}

/** Los textos que empiezan por = + - @ se guardarían como fórmulas: se fuerzan a texto. Se limita el tamaño. */
function valor_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  var t = String(v);
  if (t.length > MAX_CELDA) t = t.substring(0, MAX_CELDA) + '…[TRUNCADO]';
  if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t;
  return t;
}

/** Lee (una vez por petición) todos los datos de la hoja, sin la cabecera. */
function datos_(c) {
  if (c.datos === null) {
    var filas = c.hoja.getLastRow() - 1;
    c.datos = filas > 0 && c.cabecera.length > 0 ? c.hoja.getRange(2, 1, filas, c.cabecera.length).getValues() : [];
  }
  return c.datos;
}

function anadir_(libro, cache, m, cuenta) {
  var c = hoja_(libro, cache, m.hoja, m.columnas);
  var filas = m.filas;
  if (m.unicaPor) {
    var i = c.cabecera.indexOf(m.unicaPor);
    var existentes = datos_(c).map(function (f) { return String(f[i]); });
    filas = filas.filter(function (f) { return existentes.indexOf(String(f[m.unicaPor])) < 0; });
  }
  if (filas.length === 0) return;
  var matriz = filas.map(function (f) {
    return c.cabecera.map(function (col) { return valor_(f[col]); });
  });
  c.hoja.getRange(c.hoja.getLastRow() + 1, 1, matriz.length, c.cabecera.length).setValues(matriz);
  c.datos = null;
  cuenta.anadidas += matriz.length;
}

function actualizar_(libro, cache, m, cuenta) {
  var c = hoja_(libro, cache, m.hoja, Object.keys(m.campos));
  var claves = Object.keys(m.filtro);
  var indices = claves.map(function (k) { return c.cabecera.indexOf(k); });
  if (indices.indexOf(-1) >= 0) throw new Error('El filtro usa una columna que no existe en «' + m.hoja + '».');
  var datos = datos_(c);
  datos.forEach(function (fila, n) {
    var coincide = claves.every(function (k, j) { return String(fila[indices[j]]) === String(m.filtro[k]); });
    if (!coincide) return;
    Object.keys(m.campos).forEach(function (col) {
      var j = c.cabecera.indexOf(col);
      var v = valor_(m.campos[col]);
      c.hoja.getRange(n + 2, j + 1).setValue(v);
      fila[j] = v;
    });
    cuenta.actualizadas++;
  });
}
