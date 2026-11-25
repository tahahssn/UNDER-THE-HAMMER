import { vi } from 'vitest';

// Provide jest-like API for compatibility
globalThis.jest = {
  fn: vi.fn,
  mock: vi.mock,
  spyOn: vi.spyOn,
  clearAllMocks: vi.clearAllMocks,
  resetAllMocks: vi.resetAllMocks,
} as any;

// Mock Prisma at module level for tests
vi.mock('@prisma/client', () => ({
  __esModule: true,
  PrismaClient: class PrismaClient {
    $connect = vi.fn();
    $disconnect = vi.fn();
  },
}));

