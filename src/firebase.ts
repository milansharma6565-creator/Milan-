import { initializeApp } from 'firebase/app';
import { 
  initializeAuth, 
  browserLocalPersistence, 
  browserPopupRedirectResolver, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
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
  useFetchStreams: false, // Disables fetch streams of fetch-polling to prevent blocks in proxy/iframe setups
} as any, databaseId);
export const storage = getStorage(app);

// Use initializeAuth for more robust configuration
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { signInWithPopup, signInWithRedirect, onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber };

// Test connection as required by constraints
async function testConnection() {
  // Add a deferred delay so the browser has time to warm up network sockets (especially in iframe sandboxes)
  setTimeout(async () => {
    let retries = 3;
    while (retries > 0) {
      try {
        // Use a very short-lived getDoc from server to verify connectivity
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Initial Firestore connectivity test: Connected successfully!");
        break;
      } catch (error: any) {
        retries--;
        const isOffline = error?.message?.includes('offline') || error?.code === 'unavailable';
        if (isOffline && retries > 0) {
          console.log(`Firestore connection transient state, retrying in 2s... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // Only warn if it's a configuration/permission issue, ignore offline/network errors
        // but log them for debugging
        if (error?.message?.includes('permission-denied') || error?.code === 'permission-denied') {
           console.warn("Firestore permissions check failed. This is expected if 'test/connection' doc doesn't exist.");
        } else {
           console.log("Initial Firestore connectivity test result:", error?.message);
        }
        break;
      }
    }
  }, 1500);
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
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
        
        // Specifically avoid DOM elements
        if (value instanceof Node) return '[DOM Node]';

        // Check constructor
        const ctor = value.constructor;
        if (ctor && ctor !== Object && ctor !== Array) {
          if (ctor === Date) {
            return value.toISOString();
          }
          if (ctor === RegExp) {
            return value.toString();
          }
          if (value instanceof Error) {
            return { message: value.message, stack: value.stack, name: value.name };
          }
          return `[Object:${ctor.name || 'Custom'}]`;
        }
      }
      return value;
    });
  } catch (e) {
    return "[Serialization Failed]";
  }
};

export function safeString(val: any): string {
  try {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (val instanceof Error) return { message: val.message, stack: val.stack, name: val.name }.message || 'Error';
    if (typeof val === 'object') {
      return safeJson(val);
    }
    return String(val);
  } catch (e) {
    return '[Unserializable Object]';
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth.currentUser;
  
  // Extract only needed data to avoid circular references in the first place
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : safeString(error),
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
  console.error(`🔴 FIRESTORE ERROR [${operationType}] at [${path || 'unknown'}]:`, jsonString);
  
  // Do NOT throw here to prevent app-wide crashes from single component query failures
  // Instead, the calling component can decide if it wants to show an error UI
}
