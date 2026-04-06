import express from 'express';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../db.js';
import { signToken } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

authRouter.post('/register', async (req, res) => {
  const { email, password, displayName, role } = req.body;

  if (!email || !password || !displayName || !role) {
    return res.status(400).json({ error: 'email, password, displayName, role are required' });
  }

  if (!Object.values(UserRole).includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${Object.values(UserRole).join(', ')}` });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return res.status(409).json({ error: 'Email already in use' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      role
    },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true }
  });
  const token = signToken(user);
  return res.status(201).json({ token, user });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const safeUser = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt
  };

  const token = signToken(user);
  return res.json({ token, user: safeUser });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});
