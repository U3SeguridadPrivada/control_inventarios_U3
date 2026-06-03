import { Router } from 'express';
import { getGuardias, createGuardia, getExpediente, initiateBaja } from '../controllers/guardias.controller';

const router = Router();

router.get('/', getGuardias);
router.post('/', createGuardia);
router.get('/:id/expediente', getExpediente);
router.post('/:id/baja', initiateBaja);

export default router;
