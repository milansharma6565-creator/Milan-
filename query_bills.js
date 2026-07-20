const projectId = "gen-lang-client-0038654840";
const databaseId = "gen-lang-client-0038654840"; // Wait, databaseId in previous query was ai-studio-3b3dfcf8-1c07-47fa-8d45-f92feadefd5d
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
  const q = await runQuery({
    from: [{ collectionId: "bills" }],
    orderBy: [
      {
        field: { fieldPath: "createdAt" },
        direction: "DESCENDING"
      }
    ],
    limit: 20
  });

  const recentBills = q
    .filter(item => item.document)
    .map(item => {
      const fields = item.document.fields;
      return {
        id: item.document.name.split("/").pop(),
        billNumber: fields.billNumber?.stringValue,
        customerName: fields.customerName?.stringValue,
        franchiseId: fields.franchiseId?.stringValue || null,
        createdAt: fields.createdAt?.timestampValue
      };
    });
  console.log("20 Most Recent Bills:");
  console.log(JSON.stringify(recentBills, null, 2));
}

main();
