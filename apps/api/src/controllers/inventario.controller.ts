import { Request, Response } from 'express';
import { db } from '../db';
import { entradas, salidas } from '../db/schema';
import { sql } from 'drizzle-orm';
import PDFDocument from 'pdfkit';

export const ARTICULOS_CATALOGO = [
  "Camisolas", "Pantalones", "Botas", "Chamarras", "Chamarras Color Café",
  "Fornituras", "Silbatos", "Gorras", "Porta Gas", "Gas Pimienta", "Broches"
];

export const getInventario = async (req: Request, res: Response) => {
  try {
    const [entradasPorArticulo, salidasPorArticulo] = await Promise.all([
      db.select({
        articulo: entradas.articulo,
        estado: entradas.estado,
        total: sql<number>`SUM(${entradas.cantidad})`,
      }).from(entradas).groupBy(entradas.articulo, entradas.estado),

      db.select({
        articulo: salidas.articulo,
        estado_fisico: salidas.estado_fisico,
        enCampo:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END)`,
        enBajas:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END)`,
        definitivos:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END)`,
        devueltos:    sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END)`,
        extraviados:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END)`,
        perdidas:     sql<number>`SUM(CASE WHEN (${salidas.concepto} IN ('Extravío','Inutilizable') AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
        inutilizables_directos: sql<number>`SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
      }).from(salidas).groupBy(salidas.articulo, salidas.estado_fisico),
    ]);

    const entMap: Record<string, { nuevo: number, usado: number, inutilizable: number, total: number }> = {};
    for (const e of entradasPorArticulo) {
      if (!entMap[e.articulo]) entMap[e.articulo] = { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
      if (e.estado === 'Nuevo') entMap[e.articulo].nuevo += Number(e.total);
      else if (e.estado === 'Usado') entMap[e.articulo].usado += Number(e.total);
      else if (e.estado === 'Inutilizable' || e.estado === 'Para Baja') entMap[e.articulo].inutilizable += Number(e.total);
      entMap[e.articulo].total += Number(e.total);
    }

    const salMap: Record<string, { nuevo: number, usado: number, totalDisp: number, base: any }> = {};
    for (const s of salidasPorArticulo) {
      if (!salMap[s.articulo]) salMap[s.articulo] = { nuevo: 0, usado: 0, totalDisp: 0, 
        base: { enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0, devueltos: 0, extraviados: 0 } 
      };
      
      const sacados = Number(s.enCampo) + Number(s.enBajas) + Number(s.definitivos) + Number(s.devueltos) + Number(s.extraviados) + Number(s.inutilizables_directos);
      
      if (s.estado_fisico === 'Nuevo') salMap[s.articulo].nuevo += sacados;
      else if (s.estado_fisico === 'Usado') salMap[s.articulo].usado += sacados;
      
      salMap[s.articulo].base.enCampo += Number(s.enCampo);
      salMap[s.articulo].base.enBajas += Number(s.enBajas);
      salMap[s.articulo].base.definitivos += Number(s.definitivos);
      salMap[s.articulo].base.devueltos += Number(s.devueltos);
      salMap[s.articulo].base.extraviados += Number(s.extraviados);
      salMap[s.articulo].base.perdidas += Number(s.perdidas);
    }

    const inventario = ARTICULOS_CATALOGO.map(articulo => {
      const e = entMap[articulo] ?? { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
      const s = salMap[articulo] ?? { nuevo: 0, usado: 0, totalDisp: 0, base: { enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0 } };
      
      const almacenNuevo = e.nuevo - s.nuevo;
      const almacenUsado = e.usado - s.usado;
      const almacenInutilizable = e.inutilizable; 
      const almacen = almacenNuevo + almacenUsado + almacenInutilizable;

      return {
        articulo,
        totalEntradas: e.total,
        almacen,
        almacenNuevo,
        almacenUsado,
        almacenInutilizable,
        enCampo:     s.base.enCampo,
        enBajas:     s.base.enBajas,
        perdidas:    s.base.perdidas,
        definitivos: s.base.definitivos,
        totalExistente: almacen + s.base.enCampo + s.base.enBajas,
        stockBajo: (almacenNuevo + almacenUsado) <= 5,
      };
    });

    res.json(inventario);
  } catch (error) {
    console.error('getInventario error:', error);
    res.status(500).json({ error: 'Failed to generate inventario' });
  }
};

// Detalle por artículo+talla para el modal de Salidas
export const getInventarioDetalle = async (req: Request, res: Response) => {
  try {
    const [entsDetalle, salsDetalle] = await Promise.all([
      db.select({
        articulo: entradas.articulo,
        talla:    entradas.talla,
        estado:   entradas.estado,
        total:    sql<number>`SUM(${entradas.cantidad})`,
      }).from(entradas).groupBy(entradas.articulo, entradas.talla, entradas.estado),

      db.select({
        articulo:     salidas.articulo,
        talla:        salidas.talla,
        estado_fisico: salidas.estado_fisico,
        enCampo:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END)`,
        enBajas:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END)`,
        definitivos:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END)`,
        devueltos:    sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END)`,
        extraviados:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END)`,
        perdidas:     sql<number>`SUM(CASE WHEN (${salidas.concepto} IN ('Extravío','Inutilizable') AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
        inutilizables_directos: sql<number>`SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
      }).from(salidas).groupBy(salidas.articulo, salidas.talla, salidas.estado_fisico),
    ]);

    const entMap: Record<string, { nuevo: number, usado: number, total: number }> = {};
    for (const e of entsDetalle) {
      const key = `${e.articulo}|||${e.talla ?? ''}`;
      if (!entMap[key]) entMap[key] = { nuevo: 0, usado: 0, total: 0 };
      if (e.estado === 'Nuevo') entMap[key].nuevo += Number(e.total);
      else if (e.estado === 'Usado') entMap[key].usado += Number(e.total);
      entMap[key].total += Number(e.total);
    }

    const salMap: Record<string, { nuevo: number, usado: number, total: number }> = {};
    for (const s of salsDetalle) {
      const key = `${s.articulo}|||${s.talla ?? ''}`;
      if (!salMap[key]) salMap[key] = { nuevo: 0, usado: 0, total: 0 };
      const sacados = Number(s.enCampo) + Number(s.enBajas) + Number(s.definitivos) + Number(s.devueltos) + Number(s.extraviados) + Number(s.inutilizables_directos);
      if (s.estado_fisico === 'Nuevo') salMap[key].nuevo += sacados;
      else if (s.estado_fisico === 'Usado') salMap[key].usado += sacados;
      salMap[key].total += sacados;
    }

    const allKeys = new Set([...Object.keys(entMap), ...Object.keys(salMap)]);
    
    const result = Array.from(allKeys).map(key => {
      const [articulo, tallaRaw] = key.split('|||');
      const talla = tallaRaw || null;
      
      const e = entMap[key] ?? { nuevo: 0, usado: 0, total: 0 };
      const s = salMap[key] ?? { nuevo: 0, usado: 0, total: 0 };
      
      const almacenNuevo = e.nuevo - s.nuevo;
      const almacenUsado = e.usado - s.usado;
      const almacen = almacenNuevo + almacenUsado;
      
      return { 
        articulo, 
        talla, 
        almacen,
        almacenNuevo,
        almacenUsado
      };
    }).filter(r => r.almacen > 0);

    res.json(result);
  } catch (error) {
    console.error('getInventarioDetalle error:', error);
    res.status(500).json({ error: 'Failed to generate inventario detalle' });
  }
};

export const downloadInventarioPdf = async (req: Request, res: Response) => {
  try {
    const [entradasPorArticulo, salidasPorArticulo] = await Promise.all([
      db.select({
        articulo: entradas.articulo,
        estado: entradas.estado,
        total: sql<number>`SUM(${entradas.cantidad})`,
      }).from(entradas).groupBy(entradas.articulo, entradas.estado),

      db.select({
        articulo: salidas.articulo,
        estado_fisico: salidas.estado_fisico,
        enCampo:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END)`,
        enBajas:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END)`,
        definitivos:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END)`,
        devueltos:    sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END)`,
        extraviados:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END)`,
        perdidas:     sql<number>`SUM(CASE WHEN (${salidas.concepto} IN ('Extravío','Inutilizable') AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
        inutilizables_directos: sql<number>`SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
      }).from(salidas).groupBy(salidas.articulo, salidas.estado_fisico),
    ]);

    const entMap: Record<string, { nuevo: number, usado: number, inutilizable: number, total: number }> = {};
    for (const e of entradasPorArticulo) {
      if (!entMap[e.articulo]) entMap[e.articulo] = { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
      if (e.estado === 'Nuevo') entMap[e.articulo].nuevo += Number(e.total);
      else if (e.estado === 'Usado') entMap[e.articulo].usado += Number(e.total);
      else if (e.estado === 'Inutilizable' || e.estado === 'Para Baja') entMap[e.articulo].inutilizable += Number(e.total);
      entMap[e.articulo].total += Number(e.total);
    }

    const salMap: Record<string, { nuevo: number, usado: number, totalDisp: number, base: any }> = {};
    for (const s of salidasPorArticulo) {
      if (!salMap[s.articulo]) salMap[s.articulo] = { nuevo: 0, usado: 0, totalDisp: 0, 
        base: { enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0, devueltos: 0, extraviados: 0 } 
      };
      
      const sacados = Number(s.enCampo) + Number(s.enBajas) + Number(s.definitivos) + Number(s.devueltos) + Number(s.extraviados) + Number(s.inutilizables_directos);
      
      if (s.estado_fisico === 'Nuevo') salMap[s.articulo].nuevo += sacados;
      else if (s.estado_fisico === 'Usado') salMap[s.articulo].usado += sacados;
      
      salMap[s.articulo].base.enCampo += Number(s.enCampo);
      salMap[s.articulo].base.enBajas += Number(s.enBajas);
      salMap[s.articulo].base.definitivos += Number(s.definitivos);
      salMap[s.articulo].base.devueltos += Number(s.devueltos);
      salMap[s.articulo].base.extraviados += Number(s.extraviados);
      salMap[s.articulo].base.perdidas += Number(s.perdidas);
    }

    const inventarioResumen = ARTICULOS_CATALOGO.map(articulo => {
      const e = entMap[articulo] ?? { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
      const s = salMap[articulo] ?? { nuevo: 0, usado: 0, totalDisp: 0, base: { enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0 } };
      
      const almacenNuevo = e.nuevo - s.nuevo;
      const almacenUsado = e.usado - s.usado;
      const almacenInutilizable = e.inutilizable; 
      const almacen = almacenNuevo + almacenUsado + almacenInutilizable;

      return {
        articulo,
        almacen,
        almacenNuevo,
        almacenUsado,
        almacenInutilizable
      };
    });

    const [entsDetalle, salsDetalle] = await Promise.all([
      db.select({
        articulo: entradas.articulo,
        talla:    entradas.talla,
        estado:   entradas.estado,
        total:    sql<number>`SUM(${entradas.cantidad})`,
      }).from(entradas).groupBy(entradas.articulo, entradas.talla, entradas.estado),

      db.select({
        articulo:     salidas.articulo,
        talla:        salidas.talla,
        estado_fisico: salidas.estado_fisico,
        enCampo:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END)`,
        enBajas:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END)`,
        definitivos:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END)`,
        devueltos:    sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END)`,
        extraviados:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END)`,
        perdidas:     sql<number>`SUM(CASE WHEN (${salidas.concepto} IN ('Extravío','Inutilizable') AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
        inutilizables_directos: sql<number>`SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
      }).from(salidas).groupBy(salidas.articulo, salidas.talla, salidas.estado_fisico),
    ]);

    const entMapDetalle: Record<string, { nuevo: number, usado: number, total: number }> = {};
    for (const e of entsDetalle) {
      const key = `${e.articulo}|||${e.talla ?? ''}`;
      if (!entMapDetalle[key]) entMapDetalle[key] = { nuevo: 0, usado: 0, total: 0 };
      if (e.estado === 'Nuevo') entMapDetalle[key].nuevo += Number(e.total);
      else if (e.estado === 'Usado') entMapDetalle[key].usado += Number(e.total);
      entMapDetalle[key].total += Number(e.total);
    }

    const salMapDetalle: Record<string, { nuevo: number, usado: number, total: number }> = {};
    for (const s of salsDetalle) {
      const key = `${s.articulo}|||${s.talla ?? ''}`;
      if (!salMapDetalle[key]) salMapDetalle[key] = { nuevo: 0, usado: 0, total: 0 };
      const sacados = Number(s.enCampo) + Number(s.enBajas) + Number(s.definitivos) + Number(s.devueltos) + Number(s.extraviados) + Number(s.inutilizables_directos);
      if (s.estado_fisico === 'Nuevo') salMapDetalle[key].nuevo += sacados;
      else if (s.estado_fisico === 'Usado') salMapDetalle[key].usado += sacados;
      salMapDetalle[key].total += sacados;
    }

    const allKeys = new Set([...Object.keys(entMapDetalle), ...Object.keys(salMapDetalle)]);
    
    const inventarioDetalle = Array.from(allKeys).map(key => {
      const [articulo, tallaRaw] = key.split('|||');
      const talla = tallaRaw || null;
      
      const e = entMapDetalle[key] ?? { nuevo: 0, usado: 0, total: 0 };
      const s = salMapDetalle[key] ?? { nuevo: 0, usado: 0, total: 0 };
      
      const almacenNuevo = e.nuevo - s.nuevo;
      const almacenUsado = e.usado - s.usado;
      const almacen = almacenNuevo + almacenUsado;
      
      return { 
        articulo, 
        talla, 
        almacen,
        almacenNuevo,
        almacenUsado
      };
    }).filter(r => r.almacen > 0);

    // Configurar encabezados de respuesta HTTP para PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=inventario_almacen.pdf');

    const doc = new PDFDocument({ bufferPages: true, size: 'LETTER', margin: 40 });
    doc.pipe(res);

    // --- PÁGINA 1: RESUMEN GENERAL ---
    doc.rect(40, 40, 532, 60).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('U3 SEGURIDAD PRIVADA', 60, 52);
    doc.fontSize(10).font('Helvetica').text('CONTROL DE INVENTARIO - REPORTE GENERAL DE ALMACÉN', 60, 75);

    const fechaLocal = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text(`Generado: ${fechaLocal}`, 40, 115, { align: 'right' });

    doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('RESUMEN GENERAL DE STOCK EN ALMACÉN', 40, 135);
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, 152).lineTo(572, 152).stroke();

    const startX = 40;
    let currentY = 165;

    // Header de Tabla
    doc.rect(startX, currentY, 532, 22).fill('#1e293b');
    doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
    doc.text('Artículo', startX + 12, currentY + 7, { width: 170 });
    doc.text('Stock Nuevo', startX + 192, currentY + 7, { width: 80, align: 'center' });
    doc.text('Stock Usado', startX + 282, currentY + 7, { width: 80, align: 'center' });
    doc.text('Inutilizable', startX + 372, currentY + 7, { width: 80, align: 'center' });
    doc.text('Total Almacén', startX + 462, currentY + 7, { width: 60, align: 'center' });
    currentY += 22;

    // Filas de Tabla
    let idx = 0;
    for (const item of inventarioResumen) {
      if (idx % 2 === 0) {
        doc.rect(startX, currentY, 532, 18).fill('#f8fafc');
      }
      doc.fillColor('#334155').fontSize(8).font('Helvetica');
      doc.text(item.articulo, startX + 12, currentY + 5, { width: 170 });
      doc.text(item.almacenNuevo.toString(), startX + 192, currentY + 5, { width: 80, align: 'center' });
      doc.text(item.almacenUsado.toString(), startX + 282, currentY + 5, { width: 80, align: 'center' });
      doc.text(item.almacenInutilizable.toString(), startX + 372, currentY + 5, { width: 80, align: 'center' });
      
      doc.fillColor('#0f172a').font('Helvetica-Bold');
      doc.text(item.almacen.toString(), startX + 462, currentY + 5, { width: 60, align: 'center' });
      
      doc.strokeColor('#f1f5f9').lineWidth(0.5).moveTo(startX, currentY + 18).lineTo(startX + 532, currentY + 18).stroke();
      currentY += 18;
      idx++;
    }

    // --- PÁGINA 2 EN ADELANTE: DETALLE POR TALLA ---
    doc.addPage();
    doc.rect(40, 40, 532, 40).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold').text('DETALLE DE STOCK POR TALLA EN ALMACÉN', 60, 54);

    currentY = 95;

    const itemsByArticulo: Record<string, typeof inventarioDetalle> = {};
    for (const r of inventarioDetalle) {
      if (!itemsByArticulo[r.articulo]) {
        itemsByArticulo[r.articulo] = [];
      }
      itemsByArticulo[r.articulo].push(r);
    }

    for (const articulo of ARTICULOS_CATALOGO) {
      const items = itemsByArticulo[articulo] || [];
      if (items.length === 0) continue;

      const heightNeeded = 15 + 18 + (items.length * 16) + 15;

      if (currentY + heightNeeded > 720) {
        doc.addPage();
        doc.rect(40, 40, 532, 30).fill('#0f172a');
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('DETALLE DE STOCK POR TALLA EN ALMACÉN (CONTINUACIÓN)', 60, 50);
        currentY = 85;
      }

      doc.fillColor('#0f172a').fontSize(9.5).font('Helvetica-Bold').text(articulo.toUpperCase(), startX, currentY);
      currentY += 14;

      doc.rect(startX, currentY, 532, 16).fill('#475569');
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
      doc.text('Talla / Medida', startX + 12, currentY + 4.5, { width: 150 });
      doc.text('Stock Nuevo', startX + 172, currentY + 4.5, { width: 120, align: 'center' });
      doc.text('Stock Usado', startX + 302, currentY + 4.5, { width: 120, align: 'center' });
      doc.text('Total en Almacén', startX + 432, currentY + 4.5, { width: 90, align: 'center' });
      currentY += 16;

      let dIdx = 0;
      for (const d of items) {
        if (dIdx % 2 === 0) {
          doc.rect(startX, currentY, 532, 15).fill('#f1f5f9');
        }
        doc.fillColor('#334155').fontSize(7.5).font('Helvetica');
        doc.text(d.talla || 'Única / No aplica', startX + 12, currentY + 4.5, { width: 150 });
        doc.text(d.almacenNuevo.toString(), startX + 172, currentY + 4.5, { width: 120, align: 'center' });
        doc.text(d.almacenUsado.toString(), startX + 302, currentY + 4.5, { width: 120, align: 'center' });
        
        doc.fillColor('#0f172a').font('Helvetica-Bold');
        doc.text(d.almacen.toString(), startX + 432, currentY + 4.5, { width: 90, align: 'center' });

        doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(startX, currentY + 15).lineTo(startX + 532, currentY + 15).stroke();
        currentY += 15;
        dIdx++;
      }

      currentY += 12;
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(40, 745).lineTo(572, 745).stroke();
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica');
      doc.text('U3 Seguridad Privada — Control de Inventario & Almacén', 40, 752);
      doc.text(`Página ${i + 1} de ${range.count}`, 40, 752, { align: 'right' });
    }

    doc.end();
  } catch (error) {
    console.error('downloadInventarioPdf error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};
