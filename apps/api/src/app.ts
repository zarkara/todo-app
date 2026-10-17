import express, { type Express } from 'express';

export const buildApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
};
