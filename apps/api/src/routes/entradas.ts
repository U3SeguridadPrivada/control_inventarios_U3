import { Router } from 'express';
import { getEntradas, createEntrada } from '../controllers/entradas.controller';

const router = Router();

router.get('/', getEntradas);
router.post('/', createEntrada);

export default router;
