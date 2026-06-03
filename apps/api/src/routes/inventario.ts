import { Router } from 'express';
import { getInventario, getInventarioDetalle, downloadInventarioPdf } from '../controllers/inventario.controller';

const router = Router();

router.get('/export-pdf', downloadInventarioPdf);
router.get('/detalle', getInventarioDetalle); // Must be before /:id routes
router.get('/', getInventario);

export default router;
