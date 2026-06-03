import { Router } from 'express';
import { getDashboardMetrics } from '../controllers/dashboard.controller';

const router = Router();

router.get('/metrics', getDashboardMetrics);

export default router;
