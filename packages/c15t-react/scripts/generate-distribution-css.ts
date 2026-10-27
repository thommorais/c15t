import { join } from 'node:path';

import { generateDistributionCss } from '@c15t/build/generate-distribution-css';

generateDistributionCss(join(import.meta.dirname, '..'));
