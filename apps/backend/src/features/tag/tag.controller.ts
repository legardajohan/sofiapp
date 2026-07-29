import type { RequestHandler } from 'express';
import { createTag, deleteTag, listTags, updateTag } from './tag.service.js';
import type { CreateTagBody, UpdateTagBody } from './tag.validation.js';

export const listTagsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await listTags(tenantId));
};

export const createTagController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const tag = await createTag(tenantId, req.body as CreateTagBody);
  res.status(201).json(tag);
};

export const updateTagController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const tag = await updateTag(tenantId, id, req.body as UpdateTagBody);
  res.status(200).json(tag);
};

export const deleteTagController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  await deleteTag(tenantId, id);
  res.status(204).send();
};
