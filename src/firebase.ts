import { initializeApp } from 'firebase/app';
import { 
  initializeAuth, 
  browserLocalPersistence, 
  browserPopupRedirectResolver, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, databaseId);
export const storage = getStorage(app);

// Use initializeAuth for more robust configuration
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { signInWithPopup, onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber };

// Test connection as required by constraints
async function testConnection() {
  try {
    // Use a very short-lived getDoc from server to verify connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    // Only warn if it's a configuration/permission issue, ignore offline/network errors
    // but log them for debugging
    if (error?.message?.includes('permission-denied') || error?.code === 'permission-denied') {
       console.warn("Firestore permissions check failed. This is expected if 'test/connection' doc doesn't exist.");
    } else {
       console.log("Initial Firestore connectivity test result:", error?.message);
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export const safeJson = (obj: any) => {
  try {
    const cache = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          return '[Circular]';
        }
        cache.add(value);
      }
      return value;
    });
  } catch (e) {
    try {
      // Fallback for objects that might fail with WeakSet (rare) or other issues
      const simpleCache: any[] = [];
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (simpleCache.includes(value)) return '[Circular]';
          simpleCache.push(value);
        }
        return value;
      });
    } catch (innerError) {
      return "[Serialization Failed]";
    }
  }
};

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth.currentUser;
  
  // Extract only needed data to avoid circular references in the first place
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo: currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId || null,
        email: provider.email || null,
      })) || []
    },
    operationType,
    path
  };
  
  const jsonString = safeJson(errInfo);
  console.error(`Firestore Error [${operationType}] at [${path || 'unknown'}]:`, jsonString);
  
  // For the throw message, we'll try to use the JSON but fallback to a simple message if needed
  const finalMessage = jsonString && jsonString !== "[Serialization Failed]" 
    ? jsonString 
    : `Firestore ${operationType} failed at ${path}. Error: ${errInfo.error}`;
    
  throw new Error(finalMessage);
}
