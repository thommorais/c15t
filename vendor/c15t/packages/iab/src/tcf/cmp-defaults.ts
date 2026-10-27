import { version } from '../version';

export const CMP_VERSION = version;

export const CMP_VERSION_NUMBER = Number.parseInt(version, 10) || 1;
