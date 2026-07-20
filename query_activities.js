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
  console.log("Searching for activities with '01011' or 'manjeet singh'...");
  const q = await runQuery({
    from: [{ collectionId: "activities" }]
  });

  const matchedLogs = q
    .filter(item => item.document)
    .map(item => {
      const fields = item.document.fields;
      return {
        id: item.document.name.split("/").pop(),
        actionType: fields.actionType?.stringValue,
        description: fields.description?.stringValue,
        userEmail: fields.userEmail?.stringValue,
        createdAt: fields.createdAt?.timestampValue
      };
    })
    .filter(log => log.description.includes("01011") || log.description.toLowerCase().includes("manjeet"));

  console.log(JSON.stringify(matchedLogs, null, 2));
}

main();
