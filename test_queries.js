const projectId = "gen-lang-client-0038654840";
const dbId = "ai-studio-3b3dfcf8-1c07-47fa-8d45-f92feadefd5d";
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;

async function runQuery(structuredQuery) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery })
  });
  return await res.json();
}

async function main() {
  const franchiseId = "legacy-rajhans";

  // 1. Let's test the index-based query for legacy-rajhans ordered by billNumber desc
  console.log("Testing index-based query (franchiseId == legacy-rajhans, orderBy billNumber desc)...");
  try {
    const q1 = await runQuery({
      from: [{ collectionId: "bills" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "franchiseId" },
          op: "EQUAL",
          value: { stringValue: franchiseId }
        }
      },
      orderBy: [
        {
          field: { fieldPath: "billNumber" },
          direction: "DESCENDING"
        }
      ],
      limit: 1
    });
    console.log("Index-based query response:");
    console.log(JSON.stringify(q1, null, 2));
  } catch (err) {
    console.error("Index-based query failed with error:", err);
  }

  // 2. Let's test the global index-based query ordered by billNumber desc
  console.log("\nTesting global index-based query (orderBy billNumber desc)...");
  try {
    const q2 = await runQuery({
      from: [{ collectionId: "bills" }],
      orderBy: [
        {
          field: { fieldPath: "billNumber" },
          direction: "DESCENDING"
        }
      ],
      limit: 1
    });
    console.log("Global index-based query response:");
    console.log(JSON.stringify(q2, null, 2));
  } catch (err) {
    console.error("Global index-based query failed with error:", err);
  }
}

main();
