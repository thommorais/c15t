import { registerStockTranslations } from './stock';
import { baseTranslations } from './translations';

registerStockTranslations(baseTranslations);

export type { BaseTranslations } from './translations';
export { baseTranslations };
