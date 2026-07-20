const projectId = "gen-lang-client-0038654840";
const dbId = "ai-studio-3b3dfcf8-1c07-47fa-8d45-f92feadefd5d";
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/bills/cCXGZ2K8oG6WkpKg9v5v`;

async function main() {
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Bill cCXGZ2K8oG6WkpKg9v5v Details:");
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error fetching bill details:", err);
  }
}

main();
