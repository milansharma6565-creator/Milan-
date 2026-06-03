import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// --- ULTIMATE CIRCULAR STRUCTURE SAFETY SHIELD ---
// Prevents any "Converting circular structure to JSON" exceptions globally in the app,
// including third-party SDKs, Firestore internals, leaflet/google maps, or log listeners.
const originalStringify = JSON.stringify;

function safeSanitizer(val: any, visited = new WeakSet()): any {
  if (val === null || val === undefined) return val;
  const t = typeof val;
  if (t !== 'object' && t !== 'function') return val;
  if (visited.has(val)) return '[Circular]';
  visited.add(val);

  // Detect DOM nodes safely across window/iframe boundaries
  if (typeof Node !== 'undefined' && val instanceof Node) {
    return '[DOM Node]';
  } else if (val && typeof val === 'object' && ('nodeType' in val || 'ownerDocument' in val)) {
    return '[DOM Node]';
  }

  // Native wrappers
  if (val instanceof Date) return val.toISOString();
  if (val instanceof RegExp) return val.toString();
  if (val instanceof Error) {
    return { message: val.message, stack: val.stack, name: val.name };
  }

  // Traverse arrays
  if (Array.isArray(val)) {
    return val.map(item => safeSanitizer(item, visited));
  }

  // Traverse generic objects
  const result: any = {};
  for (const key in val) {
    try {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        result[key] = safeSanitizer(val[key], visited);
      }
    } catch {
      result[key] = '[Access Error]';
    }
  }
  return result;
}

JSON.stringify = function (value: any, replacer?: any, space?: any) {
  const seen = new WeakSet();

  const customReplacer = function (this: any, key: string, val: any) {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);

      if (typeof Node !== 'undefined' && val instanceof Node) {
        return '[DOM Node]';
      }
    }

    if (typeof replacer === 'function') {
      return replacer.call(this, key, val);
    } else if (Array.isArray(replacer)) {
      if (key === '' || replacer.includes(key)) {
        return val;
      }
      return undefined;
    }
    return val;
  };

  try {
    return originalStringify(value, customReplacer, space);
  } catch (err) {
    try {
      const cleanObj = safeSanitizer(value);
      return originalStringify(cleanObj, undefined, space);
    } catch {
      return '"[Unserializable]"';
    }
  }
};
// -------------------------------------------------

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

