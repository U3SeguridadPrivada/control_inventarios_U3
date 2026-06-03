import { Router } from 'express';
import { getBajas, processBajaItem } from '../controllers/bajas.controller';

const router = Router();

router.get('/', getBajas);
router.post('/:id/process', processBajaItem);

export default router;
