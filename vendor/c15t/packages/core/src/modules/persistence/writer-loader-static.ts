import type { WriterLoader } from './writer-loader';
import { createPersistenceWriter } from './writer/writer';

const writerModule = { createPersistenceWriter };

export const pageWriterLoader: WriterLoader = {
	load: () => Promise.resolve(writerModule),
	module: writerModule,
};

export const preloadWriter = (): (() => void) => () => undefined;
