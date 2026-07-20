const projectId = "gen-lang-client-0038654840";
const dbId = "ai-studio-3b3dfcf8-1c07-47fa-8d45-f92feadefd5d";
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;

async function main() {
  const query = {
    structuredQuery: {
      from: [{ collectionId: "franchises" }]
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query)
    });
    const data = await res.json();
    console.log("Franchises:");
    console.log(JSON.stringify(data.filter(i => i.document).map(i => i.document.fields), null, 2));
  } catch (err) {
    console.error(err);
  }
}

main();
