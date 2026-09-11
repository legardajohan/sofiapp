import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { aiAnswerSchema, getAssistantSchema, updateAssistantSchema } from './ai.validation.js';
import {
  aiAnswerController,
  getAssistantController,
  updateAssistantController,
} from './ai-assistant.controller.js';

const router = Router();

// Chatbot con RAG y su configuración (HU-IA-01): solo admin del tenant.
const aiRoles = authorize(['admin']);

router.post(
  '/answer',
  authenticateJWT,
  requireTenant,
  aiRoles,
  validate(aiAnswerSchema),
  asyncHandler(aiAnswerController),
);

router.get(
  '/assistant',
  authenticateJWT,
  requireTenant,
  aiRoles,
  validate(getAssistantSchema),
  asyncHandler(getAssistantController),
);

router.put(
  '/assistant',
  authenticateJWT,
  requireTenant,
  aiRoles,
  validate(updateAssistantSchema),
  asyncHandler(updateAssistantController),
);

export default router;
