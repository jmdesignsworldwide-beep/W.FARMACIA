/** CSV con separador AUTODETECTADO (coma, punto y coma o tabulador). */

export function detectarSeparador(texto: string): string {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  let mejor = ',';
  let mejorPuntaje = -1;
  for (const sep of [';', ',', '\t']) {
    const counts = lineas.map((l) => l.split(sep).length);
    const max = Math.max(1, ...counts);
    if (max <= 1) continue;
    const consistentes = counts.filter((c) => c === max).length;
    const puntaje = max * 100 + consistentes;
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = sep; }
  }
  return mejor;
}

export function parseCsv(texto: string): { filas: string[][]; separador: string } {
  const sep = detectarSeparador(texto);
  const filas: string[][] = [];
  let campo = '';
  let fila: string[] = [];
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += ch;
    } else if (ch === '"') {
      comillas = true;
    } else if (ch === sep) {
      fila.push(campo); campo = '';
    } else if (ch === '\n') {
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else if (ch !== '\r') {
      campo += ch;
    }
  }
  if (campo.length || fila.length) { fila.push(campo); filas.push(fila); }
  return { filas, separador: sep === '\t' ? 'tabulador' : sep };
}
