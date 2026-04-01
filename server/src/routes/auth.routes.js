import express from 'express';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../db.js';
import { signToken } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();
const pendingRegistrations = new Map();

authRouter.post('/register-init', async (req, res) => {
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

  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const passwordHash = await bcrypt.hash(password, 10);
  pendingRegistrations.set(email, {
    email,
    passwordHash,
    displayName,
    role,
    verificationCode,
    expiresAt: Date.now() + 15 * 60 * 1000
  });

  console.log(`[EMAIL VERIFICATION] ${email}: ${verificationCode}`);
  return res.status(200).json({ message: 'Код подтверждения отправлен на email' });
});

authRouter.post('/register-confirm', async (req, res) => {
  const { email, code } = req.body;
  const pending = pendingRegistrations.get(email);
  if (!pending) return res.status(400).json({ error: 'No pending registration found' });
  if (Date.now() > pending.expiresAt) {
    pendingRegistrations.delete(email);
    return res.status(400).json({ error: 'Verification code expired' });
  }
  if (pending.verificationCode !== code) return res.status(400).json({ error: 'Invalid verification code' });

  const user = await prisma.user.create({
    data: {
      email: pending.email,
      passwordHash: pending.passwordHash,
      displayName: pending.displayName,
      role: pending.role
    },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true }
  });
  pendingRegistrations.delete(email);
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
