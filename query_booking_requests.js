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
  console.log("Fetching booking requests...");
  const q = await runQuery({
    from: [{ collectionId: "bookingRequests" }],
    orderBy: [
      {
        field: { fieldPath: "requestedAt" },
        direction: "DESCENDING"
      }
    ],
    limit: 10
  });

  const requests = q
    .filter(item => item.document)
    .map(item => {
      const fields = item.document.fields;
      return {
        id: item.document.name.split("/").pop(),
        customerName: fields.customerName?.stringValue,
        status: fields.status?.stringValue,
        billId: fields.billId?.stringValue,
        requestedAt: fields.requestedAt?.timestampValue
      };
    });
  console.log(JSON.stringify(requests, null, 2));
}

main();
