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
  console.log("Fetching bills from July 18 to July 20...");
  const q = await runQuery({
    from: [{ collectionId: "bills" }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "createdAt" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { timestampValue: "2026-07-18T00:00:00Z" }
            }
          }
        ]
      }
    },
    orderBy: [
      {
        field: { fieldPath: "createdAt" },
        direction: "ASCENDING"
      }
    ]
  });

  const bills = q
    .filter(item => item.document)
    .map(item => {
      const fields = item.document.fields;
      return {
        id: item.document.name.split("/").pop(),
        billNumber: fields.billNumber?.stringValue,
        customerName: fields.customerName?.stringValue,
        createdAt: fields.createdAt?.timestampValue
      };
    });
  console.log(JSON.stringify(bills, null, 2));
}

main();
