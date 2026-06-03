import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, register, me, listUsers, updateUser, deleteUser, resetPassword } from '../controllers/auth.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máx 10 intentos
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, login);
router.get('/me', requireAuth, me);

// Solo admin
router.post('/register', requireAuth, requireRole('admin'), register);
router.get('/users', requireAuth, requireRole('admin'), listUsers);
router.patch('/users/:id', requireAuth, requireRole('admin'), updateUser);
router.patch('/users/:id/password', requireAuth, requireRole('admin'), resetPassword);
router.delete('/users/:id', requireAuth, requireRole('admin'), deleteUser);

export default router;
