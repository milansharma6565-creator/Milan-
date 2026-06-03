import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ActivityLog } from '../types';

export const activityLogger = {
  async log({
    franchiseId,
    franchiseName,
    userEmail,
    actionType,
    description,
    details = {}
  }: Omit<ActivityLog, 'id' | 'timestamp'>) {
    try {
      const logData = {
        franchiseId,
        franchiseName: franchiseName || 'Unknown Franchise',
        userEmail: userEmail || auth.currentUser?.email || 'Anonymous',
        actionType,
        description,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        ipAddress: 'Client App',
        details
      };
      await addDoc(collection(db, 'activities'), logData);
    } catch (err) {
      console.error('Failed to write activity log:', err);
    }
  }
};
