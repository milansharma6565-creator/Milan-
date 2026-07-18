const fetch = require('node-fetch'); // or use dynamic import / standard fetch if Node 18+

async function run() {
  const projectId = 'gen-lang-client-0038654840';
  const dbs = ['(default)', 'ai-studio-tankerwala-3b3dfcf8-1c07-47fa-8d45-f92feadefd5d'];
  
  for (const dbId of dbs) {
    console.log(`--- Checking Database: ${dbId} ---`);
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(dbId)}/documents/franchises`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.documents) {
        console.log(`Found ${data.documents.length} franchises:`);
        data.documents.forEach(doc => {
          console.log(` - ${doc.name.split('/').pop()}`);
        });
      } else {
        console.log(`No franchises found or error: ${JSON.stringify(data)}`);
      }

      // Check accounts
      const accUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(dbId)}/documents/accounts?pageSize=10`;
      const accRes = await fetch(accUrl);
      const accData = await accRes.json();
      if (accData.documents) {
        console.log(`Found accounts (first few):`);
        accData.documents.forEach(doc => {
          const name = doc.fields?.name?.stringValue || 'Unknown';
          const bal = doc.fields?.currentBalance?.doubleValue || doc.fields?.currentBalance?.integerValue || 0;
          console.log(`   * ${name}: Balance = ${bal}`);
        });
      } else {
        console.log(`No accounts found or error: ${JSON.stringify(accData)}`);
      }
    } catch (e) {
      console.error(`Error checking ${dbId}:`, e.message);
    }
  }
}

run();
