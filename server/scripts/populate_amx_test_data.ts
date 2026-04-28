import { 
  createDb, 
  companies, 
  agents, 
  agentMemories, 
  amxTransactions, 
  amxChainEvents, 
  amxCertificates,
  amxLedger
} from "@paperclipai/db";
import { eq, ilike } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

async function main() {
  const url = process.env.DATABASE_URL || "postgres://postgres@localhost:54329/postgres";
  const db = createDb(url);

  // 1. Find AMX Labs
  const [amxLabs] = await db.select().from(companies).where(ilike(companies.name, "%AMX Labs%"));
  if (!amxLabs) {
    console.error("AMX Labs company not found!");
    process.exit(1);
  }
  const companyId = amxLabs.id;
  console.log(`Using Company: ${amxLabs.name} (${companyId})`);

  // 2. Find/Create some agents
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

  // 3. Clear existing test data (optional, but good for clean tests)
  // await db.delete(agentMemories).where(eq(agentMemories.companyId, companyId));

  // 4. Insert Agent Memories
  console.log("Inserting memories...");
  const memories = [
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
    },
    { 
      id: uuidv4(), 
      companyId, 
      agentId: amxAgents[2].id, 
      content: "Learned new reconciliation logic for cross-chain settlements.", 
      category: "learning",
      importance: 5
    }
  ];
  await db.insert(agentMemories).values(memories);

  // 5. Ensure Ledger exists
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

  // 6. Insert Transactions
  console.log("Inserting transactions...");
  const transactions = [
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
  ];
  await db.insert(amxTransactions).values(transactions as any);

  // 7. Insert Chain Events & Certificates
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
    },
    { 
      id: uuidv4(), 
      companyId, 
      action: "MEMORY_COMMITTED", 
      principalType: "agent", 
      principalId: amxAgents[0].id, 
      payload: { memoryId: memories[0].id },
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
