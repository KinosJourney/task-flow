import { z } from 'zod';
import { MODULE_IDS } from '../modules';

export const moduleId = z.enum(MODULE_IDS);

export const id = z.string().min(1).max(80);

/** 日期一律是本地时区的 YYYY-MM-DD（不是 UTC，见 ui-spec 2.5 末尾） */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期需为 YYYY-MM-DD');

export const idInput = z.object({ id }).strict();
