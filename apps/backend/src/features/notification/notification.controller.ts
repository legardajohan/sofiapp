import type { RequestHandler } from 'express';
import {
  countUnread,
  listNotifications,
  markAllAsRead,
  markAsRead,
} from './notification.service.js';
import type { ListNotificationsQuery } from './notification.validation.js';

export const listNotificationsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const userId = req.user!.sub;
  const result = await listNotifications(
    tenantId,
    userId,
    req.validatedQuery as unknown as ListNotificationsQuery,
  );
  res.status(200).json(result);
};

export const unreadCountController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const userId = req.user!.sub;
  res.status(200).json({ count: await countUnread(tenantId, userId) });
};

export const markReadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const userId = req.user!.sub;
  const id = req.params['id'] as string;
  const notification = await markAsRead(tenantId, userId, id);
  res.status(200).json(notification);
};

export const markAllReadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const userId = req.user!.sub;
  await markAllAsRead(tenantId, userId);
  res.status(204).send();
};
