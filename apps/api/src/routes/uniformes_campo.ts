import { Router } from 'express';
import { getUniformesCampo } from '../controllers/uniformescapo.controller';

const router = Router();

router.get('/', getUniformesCampo);
// router.post('/', createUniformeCampo);

export default router;
