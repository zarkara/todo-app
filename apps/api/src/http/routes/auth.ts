import { loginSchema, registerSchema } from '@todo/shared';
import { Router } from 'express';
import type { AuthService } from '../../services/authService';
import { asyncHandler } from '../middleware';

export const authRoutes = (authService: AuthService) =>
  Router()
    .post(
      '/login',
      asyncHandler(async (req, res) => {
        res.json(await authService.login(loginSchema.parse(req.body)));
      }),
    )
    .post(
      '/register',
      asyncHandler(async (req, res) => {
        res.status(201).json(await authService.register(registerSchema.parse(req.body)));
      }),
    );
