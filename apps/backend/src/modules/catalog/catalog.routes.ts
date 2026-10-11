import {
  ImageUploadRequestSchema,
  ProductCreateRequestSchema,
  ProductUpdateRequestSchema,
  rolesFor,
  SlugSchema,
} from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthGuards } from '../../middleware/auth';
import { createCatalogController } from './catalog.controller';
import type { CatalogService } from './catalog.service';

const IdParams = z.object({ id: z.uuid() });

/** /api/v1/products — public storefront reads (active products, sellable stock only). */
export const publicCatalogRoutes: FastifyPluginAsyncZod<{ service: CatalogService }> = async (app, { service }) => {
  const c = createCatalogController(service);
  app.get('/', c.listPublic);
  app.get('/:slug', { schema: { params: z.object({ slug: SlugSchema }) } }, c.detailPublic);
};

/** /api/v1/admin — products + image uploads, ADMIN only (catalog:manage). */
export const adminCatalogRoutes: FastifyPluginAsyncZod<{ service: CatalogService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  const c = createCatalogController(service);
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(rolesFor('catalog:manage')));

  app.get('/products', c.listAdmin);
  app.get('/products/:id', { schema: { params: IdParams } }, c.getAdmin);
  app.post('/products', { schema: { body: ProductCreateRequestSchema } }, c.create);
  app.patch('/products/:id', { schema: { params: IdParams, body: ProductUpdateRequestSchema } }, c.update);
  app.post('/products/:id/publish', { schema: { params: IdParams } }, c.publish);
  app.post('/products/:id/unpublish', { schema: { params: IdParams } }, c.unpublish);
  app.post(
    '/uploads/product-image',
    { schema: { body: ImageUploadRequestSchema }, config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
    c.presignImage,
  );
};
