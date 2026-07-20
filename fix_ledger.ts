import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import config from './firebase-applet-config.json' assert { type: 'json' };

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function main() {
  try {
    const accSnap = await getDocs(query(collection(db, 'accounts'), limit(5)));
    console.log(`Successfully fetched ${accSnap.size} accounts.`);
    accSnap.forEach(d => {
      console.log(d.id, '=>', d.data().name);
    });
  } catch (err) {
    console.error('Error fetching via firebase client:', err);
  }
}

main();
