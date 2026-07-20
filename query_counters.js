const projectId = "gen-lang-client-0038654840";
const databaseId = "ai-studio-3b3dfcf8-1c07-47fa-8d45-f92feadefd5d";
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery`;

async function main() {
  const query = {
    structuredQuery: {
      from: [{ collectionId: "counters" }]
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query)
    });
    const data = await res.json();
    console.log("Counters in Firestore:");
    const docs = data.filter(i => i.document).map(i => {
      const name = i.document.name.split("/").pop();
      return {
        id: name,
        fields: i.document.fields
      };
    });
    console.log(JSON.stringify(docs, null, 2));
  } catch (err) {
    console.error("Error fetching counters:", err);
  }
}

main();
