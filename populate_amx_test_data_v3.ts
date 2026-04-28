import { 
  createDb, 
  companies, 
  agents, 
  agentMemories, 
  amxTransactions, 
  amxChainEvents, 
  amxCertificates,
  amxLedger
} from "./packages/db/dist/index.js";
import { eq, ilike } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

async function main() {
  const url = process.env.DATABASE_URL || "postgres://postgres@localhost:54329/postgres";
  const db = createDb(url);

  console.log("Checking for AMX Labs...");
  let [amxLabs] = await db.select().from(companies).where(ilike(companies.name, "%AMX Labs%"));
  
  if (!amxLabs) {
    console.log("AMX Labs not found, creating it...");
    const [created] = await db.insert(companies).values({
      id: uuidv4(),
      name: "AMX Labs",
      status: "active",
      issuePrefix: "AMX",
    }).returning();
    amxLabs = created;
  }
  
  const companyId = amxLabs.id;
  console.log(`Using Company: ${amxLabs.name} (${companyId})`);

  // Find/Create some agents
  let amxAgents = await db.select().from(agents).where(eq(agents.companyId, companyId)).limit(3);
  if (amxAgents.length === 0) {
    console.log("No agents found in AMX Labs, creating test agents...");
    const newAgents = [
      { id: uuidv4(), companyId, name: "Audit Lead", role: "lead", status: "active" },
      { id: uuidv4(), companyId, name: "Chain Watcher", role: "watcher", status: "active" },
      { id: uuidv4(), companyId, name: "Ledger Bot", role: "worker", status: "active" },
    ];
    await db.insert(agents).values(newAgents);
    amxAgents = await db.select().from(agents).where(eq(agents.companyId, companyId)).limit(3);
  }

  // Insert Agent Memories
  console.log("Inserting memories...");
  await db.insert(agentMemories).values([
    { 
      id: uuidv4(), 
      companyId, 
      agentId: amxAgents[0].id, 
      content: "Validated security protocol for V3 deployment. No anomalies detected.", 
      category: "decision",
      importance: 4
    },
    { 
      id: uuidv4(), 
      companyId, 
      agentId: amxAgents[1].id, 
      content: "Observed high-frequency trading pattern in the exchange. Applying noise filter.", 
      category: "pattern",
      importance: 3
    }
  ]);

  // Ensure Ledger exists
  let [ledger] = await db.select().from(amxLedger).where(eq(amxLedger.companyId, companyId));
  if (!ledger) {
      console.log("Creating ledger...");
      await db.insert(amxLedger).values({
          id: uuidv4(),
          companyId,
          tokenBalance: 5000,
          totalEarned: 15000,
          totalSpent: 10000,
          currency: "XP"
      });
  }

  // Insert Transactions
  console.log("Inserting transactions...");
  await db.insert(amxTransactions).values([
    { 
      id: uuidv4(), 
      companyId, 
      type: "credit", 
      amount: 1000, 
      description: "Store credit purchase via XpWallet",
      status: "completed"
    },
    { 
      id: uuidv4(), 
      companyId, 
      type: "debit", 
      amount: 450, 
      description: "Payment for 'Neural Python Optimizer' skill",
      status: "completed"
    }
  ] as any);

  // Insert Chain Events & Certificates
  console.log("Inserting chain events...");
  const chainEvents = [
    { 
      id: uuidv4(), 
      companyId, 
      action: "LEDGER_CREDIT", 
      principalType: "user", 
      principalId: "admin", 
      payload: { amount: 1000 },
      signature: "0x" + Math.random().toString(16).slice(2, 66)
    }
  ];
  await db.insert(amxChainEvents).values(chainEvents as any);

  console.log("Inserting certificates...");
  await db.insert(amxCertificates).values({
    id: uuidv4(),
    companyId,
    title: "V3 Audit Proficiency Certificate",
    issuedToId: amxAgents[0].id,
    issuedToType: "agent",
    proofHash: "0xABC123DEF456",
    metadata: { score: 98, level: "expert" }
  } as any);

  console.log("Done! AMX Labs test data populated.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Population failed:", err);
  process.exit(1);
});
