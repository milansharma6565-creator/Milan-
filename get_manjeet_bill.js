const projectId = "gen-lang-client-0038654840";
const dbId = "ai-studio-3b3dfcf8-1c07-47fa-8d45-f92feadefd5d";
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/bills/9ClV6Tz3y3GfNWN6aLZo`;

async function main() {
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Bill 9ClV6Tz3y3GfNWN6aLZo Details:");
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error fetching bill details:", err);
  }
}

main();
