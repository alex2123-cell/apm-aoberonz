import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { ah, HttpError } from '../lib/http';
import { signToken } from '../lib/auth';
import { INDUSTRIES } from '../lib/constants';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(80),
  interests: z.array(z.enum(INDUSTRIES)).max(11).optional(),
});

authRouter.post(
  '/register',
  ah(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new HttpError(409, 'That email is already registered');
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: await bcrypt.hash(body.password, 12),
        interests: body.interests?.length
          ? { create: body.interests.map((industry) => ({ industry, weight: 3 })) }
          : undefined,
      },
    });
    const token = signToken({ id: user.id, role: user.role, companyId: user.companyId });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);

const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string() });

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, 'Wrong email or password');
    }
    const token = signToken({ id: user.id, role: user.role, companyId: user.companyId });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId },
    });
  }),
);
