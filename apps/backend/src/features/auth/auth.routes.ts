import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { loginSchema } from './auth.validation.js';
import { loginController, meController, logoutController } from './auth.controller.js';

const router = Router();

router.post('/login', validate(loginSchema), asyncHandler(loginController));

router.get('/me', authenticateJWT, asyncHandler(meController));

router.post('/logout', authenticateJWT, asyncHandler(logoutController));

export default router;
