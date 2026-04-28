
import { createDb, authUsers, instanceUserRoles, companies, companyMemberships } from '@paperclipai/db';
import { eq, and, desc } from 'drizzle-orm';

async function main() {
  const connectionString = process.env.DATABASE_URL ?? "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";
  const db = createDb(connectionString);
  
  // 1. Find the latest user
  const latestUsers = await db.select().from(authUsers).orderBy(desc(authUsers.createdAt)).limit(5);
  console.log('Recent Users:', JSON.stringify(latestUsers, null, 2));
  
  if (latestUsers.length === 0) {
    console.log('No users found to promote.');
    return;
  }
  
  const targetUser = latestUsers[0];
  console.log(`Promoting user: ${targetUser.email} (${targetUser.id})`);
  
  // 2. Promote to instance_admin
  const existingRole = await db.select().from(instanceUserRoles)
    .where(and(eq(instanceUserRoles.userId, targetUser.id), eq(instanceUserRoles.role, 'instance_admin')))
    .then(rows => rows[0]);
    
  if (!existingRole) {
    await db.insert(instanceUserRoles).values({
      userId: targetUser.id,
      role: 'instance_admin'
    });
    console.log('Role granted: instance_admin');
  } else {
    console.log('User already has instance_admin role.');
  }
  
  // 3. Promote to Company Owner for all companies
  const allCompanies = await db.select().from(companies);
  for (const company of allCompanies) {
    const existingMembership = await db.select().from(companyMemberships)
      .where(and(
        eq(companyMemberships.companyId, company.id),
        eq(companyMemberships.principalId, targetUser.id),
        eq(companyMemberships.principalType, 'user')
      ))
      .then(rows => rows[0]);
      
    if (!existingMembership) {
      await db.insert(companyMemberships).values({
        companyId: company.id,
        principalType: 'user',
        principalId: targetUser.id,
        status: 'active',
        membershipRole: 'owner'
      });
      console.log(`Granted ownership of company: ${company.name} (${company.id})`);
    } else {
      await db.update(companyMemberships)
        .set({ status: 'active', membershipRole: 'owner' })
        .where(eq(companyMemberships.id, existingMembership.id));
      console.log(`Updated ownership of company: ${company.name} (${company.id})`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}).finally(() => process.exit(0));
