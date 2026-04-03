import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'admin'
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '3.1415926Pidashboad'

  // Only create the admin user if no users exist at all — idempotent
  const existingCount = await prisma.user.count()
  if (existingCount > 0) {
    console.log('[seed] Users already exist — skipping seed (idempotent)')
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
    },
  })

  console.log(`[seed] Admin user created: id=${user.id}, username=${user.username}`)
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
