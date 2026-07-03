import { Router } from 'express';
import express from 'express';
import { verifyController, receiveController } from './webhook.controller.js';

const router = Router();

router.get('/', verifyController);

router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  receiveController(req, res).catch((err) => {
    console.error('Webhook receive error', err);
  });
});

export default router;
