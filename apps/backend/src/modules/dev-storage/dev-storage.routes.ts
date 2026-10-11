import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LOCAL_ASSET_PATH, LOCAL_UPLOAD_PATH, type LocalDiskStorage } from '../../integrations/storage/local-disk';
import { AppError } from '../../utils/app-error';

const CONTENT_TYPE_BY_EXT: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

/**
 * Development-only stand-in for the R2 upload + CDN endpoints (registered only when
 * STORAGE_DRIVER=local, which env.ts forbids in production).
 */
export const devStorageRoutes: FastifyPluginAsyncZod<{ storage: LocalDiskStorage }> = async (app, { storage }) => {
  app.addContentTypeParser(
    [...IMAGE_CONTENT_TYPES],
    { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.put(
    LOCAL_UPLOAD_PATH,
    { schema: { querystring: z.object({ token: z.string().min(1) }) } },
    async (request, reply) => {
      const claims = storage.verifyUpload(request.query.token);
      if (!claims) throw new AppError('FORBIDDEN', 'Upload link is invalid or expired.');
      const body = request.body as Buffer;
      if (request.headers['content-type'] !== claims.contentType || body.length !== claims.sizeBytes) {
        throw new AppError('FORBIDDEN', 'File does not match the upload link.');
      }
      await storage.write(claims.key, body);
      return reply.status(200).send();
    },
  );

  app.get(`${LOCAL_ASSET_PATH}/*`, async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    const ext = key.split('.').pop() ?? '';
    const file = CONTENT_TYPE_BY_EXT[ext] ? await storage.read(key).catch(() => null) : null;
    if (!file) throw new AppError('NOT_FOUND', 'Image not found.');
    return reply
      .header('content-type', CONTENT_TYPE_BY_EXT[ext])
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('cross-origin-resource-policy', 'cross-origin')
      .send(file);
  });
};
