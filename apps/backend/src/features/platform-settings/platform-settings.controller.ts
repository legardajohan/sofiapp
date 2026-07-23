import type { Request, Response } from 'express';
import { getSettingsResponse, updateSettings } from './platform-settings.service.js';
import type { UpdatePlatformSettingsDTO } from './platform-settings.types.js';

export async function getPlatformSettingsController(_req: Request, res: Response): Promise<void> {
  res.json(await getSettingsResponse());
}

export async function updatePlatformSettingsController(
  req: Request,
  res: Response,
): Promise<void> {
  res.json(await updateSettings(req.body as UpdatePlatformSettingsDTO));
}
