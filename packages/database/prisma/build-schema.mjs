#!/usr/bin/env node
/**
 * Builds the unified schema.prisma from modular domain files.
 * Run before `prisma generate` or `prisma migrate`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(__dir, 'schema');
const outputPath = path.join(__dir, 'schema.prisma');

// Read all .prisma files in domain order
const domainOrder = [
  'base',
  'identity',
  'staff',
  'teams',
  'cricket',
  'news',
  'rooms',
  'auction',
  'squads',
  'chat',
  'billing',
  'support',
  'admin',
];

let combined = '';

for (const domain of domainOrder) {
  const filePath = path.join(schemaDir, `${domain}.prisma`);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    combined += `// ===== ${domain}.prisma =====\n${content}\n\n`;
  }
}

fs.writeFileSync(outputPath, combined);
console.log(`✓ Schema built: ${outputPath}`);
