import { Router } from 'express';
import { getSalidas, createSalida, createSalidasBulk, createReposicionBulk, createExtravioBulk } from '../controllers/salidas.controller';

const router = Router();

router.get('/', getSalidas);
router.post('/bulk', createSalidasBulk);
router.post('/reposicion', createReposicionBulk);
router.post('/extravio', createExtravioBulk);
router.post('/', createSalida);

export default router;
