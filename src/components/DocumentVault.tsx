import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileBox, Lock, Unlock, Upload, FileText, Trash2, ShieldAlert, Folder, X, Search, FileImage, File, Link, Plus } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { getPublicAppUrl, copyToClipboard } from '../constants';
import { format } from 'date-fns';

interface DocumentVaultProps {
  userEmail: string;
}

interface VaultMeta {
  password?: string;
}

interface UploadedDoc {
  id: string;
  name: string;
  url: string;
  folder: string;
  type: string;
  createdAt: Date;
}

export const DocumentVault: React.FC<DocumentVaultProps> = ({ userEmail }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [vaultPassword, setVaultPassword] = useState<string | null>(null);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = userEmail === 'milan.sharma6565@gmail.com';

  const defaultFolders = [
    { id: 'phed', name: 'PHED Documents' },
    { id: 'vehicle', name: 'Vehicle Document' },
    { id: 'kyc', name: 'Owner KYC Document' },
    { id: 'firm', name: 'Firm Documents' },
    { id: 'legal', name: 'Legal Document' },
    { id: 'drivers', name: 'Tractor Drivers' }
  ];

  const [customFolders, setCustomFolders] = useState<{id: string, name: string}[]>([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const folders = [...defaultFolders, ...customFolders];

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'documents'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.password) {
          setVaultPassword(data.password);
        } else {
          setVaultPassword(null);
        }
        if (data.folders) {
          setCustomFolders(data.folders);
        } else {
          setCustomFolders([]);
        }
      } else {
        setVaultPassword(null);
        setCustomFolders([]);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/documents'));

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    
    let q = query(collection(db, 'documents'));
    if (currentFolder) {
      q = query(collection(db, 'documents'), where('folder', '==', currentFolder));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as UploadedDoc;
      });
      docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setDocuments(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'documents'));

    return () => unsub();
  }, [isUnlocked, currentFolder]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultPassword) return;
    
    if (passwordInput === vaultPassword) {
      setIsUnlocked(true);
      setErrorMsg('');
    } else {
      setErrorMsg('Incorrect password');
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const newFolderId = `custom_${Date.now()}`;
      const newFolder: any = { id: newFolderId, name: newFolderName.trim() };
      if (currentFolder) {
        newFolder.parentId = currentFolder;
      }
      
      await setDoc(doc(db, 'settings', 'documents'), {
        folders: [...customFolders, newFolder]
      }, { merge: true });
      setShowCreateFolder(false);
      setNewFolderName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/documents');
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMsg('Only admin can set or change password.');
      return;
    }
    if (newPassword.length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }
    try {
      await setDoc(doc(db, 'settings', 'documents'), { password: newPassword }, { merge: true });
      setIsSettingPassword(false);
      setNewPassword('');
      setErrorMsg('');
      if (!isUnlocked) {
        setIsUnlocked(true); // Auto unlock after setting password as admin
      }
    } catch (err) {
      setErrorMsg('Failed to update password');
      handleFirestoreError(err, OperationType.WRITE, 'settings/documents');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    if (!currentFolder) return;
    setUploading(true);
    try {
      const pathSuffix = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `documents/${currentFolder}/${pathSuffix}`);
      
      try {
        // Attempt normal storage upload
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        await addDoc(collection(db, 'documents'), {
          name: file.name,
          url: downloadURL,
          folder: currentFolder,
          type: file.type,
          size: file.size,
          createdAt: serverTimestamp()
        });
        setUploading(false);
      } catch (storageErr: any) {
        console.warn("Firebase Storage failed, attempting Database Fallback...", storageErr);
        // Fallback to database for small files
        if (file.size > 1000000) {
          setUploading(false);
          alert(`File is too large for fallback upload (1MB limit). Storage Error: ${storageErr.message}`);
          return;
        }

        let reader: any;
        try {
          reader = new FileReader();
        } catch (e) {
          console.error('FileReader constructor failed:', e?.message || String(e));
          setUploading(false);
          return;
        }
        reader.onload = async () => {
          try {
            const base64String = reader.result as string;
            await addDoc(collection(db, 'documents'), {
              name: file.name,
              url: base64String,
              folder: currentFolder,
              type: file.type,
              size: file.size,
              storageType: 'base64',
              createdAt: serverTimestamp()
            });
            setUploading(false);
          } catch (dbErr: any) {
            console.error("Firestore fallback error:", dbErr?.message || String(dbErr));
            setUploading(false);
            alert('Upload failed: ' + dbErr.message);
          }
        };
        reader.onerror = () => {
          setUploading(false);
          alert('Failed to read file for fallback upload.');
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.error("Document upload failed:", err?.message || String(err));
      setUploading(false);
      alert('Upload failed: ' + err.message);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (docObj: UploadedDoc) => {
    if (!confirm(`Are you sure you want to delete ${docObj.name}?`)) return;
    
    try {
      // First try to delete from storage if it exists there
      try {
        const fileRef = ref(storage, docObj.url);
        await deleteObject(fileRef);
      } catch (e: any) {
        console.warn("Storage object not found or couldn't be deleted", e);
      }
      
      await deleteDoc(doc(db, 'documents', docObj.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `documents/${docObj.id}`);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (currentFolder) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!currentFolder) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const copyShareLink = async () => {
    const url = getPublicAppUrl();
    url.searchParams.set('tab', 'documents');
    await copyToClipboard(url.toString());
    alert('Share link copied to clipboard!');
  };

  if (vaultPassword === null) {
    if (isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center border border-slate-100">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert size={32} />
            </div>
            <h2 className="text-2xl font-display font-black text-slate-900 mb-2">Setup Vault Password</h2>
            <p className="text-slate-500 mb-6 font-medium">Please set a secure password to initialize the Document Vault.</p>
            
            <form onSubmit={handleSetPassword} className="space-y-4">
              <input 
                type="password" 
                placeholder="Enter new password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full text-center px-4 py-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errorMsg && <p className="text-red-500 text-sm font-bold">{errorMsg}</p>}
              <button 
                type="submit"
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
              >
                Set Password
              </button>
            </form>
          </div>
        </div>
      );
    } else {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center border border-slate-100">
            <FileBox className="text-slate-400 w-16 h-16 mx-auto mb-4" />
            <h2 className="text-2xl font-display font-black text-slate-900 mb-2">Vault Not Initialized</h2>
            <p className="text-slate-500 font-medium">The vault password has not been set yet. Please contact milan.sharma6565@gmail.com to initialize the vault.</p>
          </div>
        </div>
      );
    }
  }

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center border border-slate-100">
          <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-display font-black text-slate-900 mb-2">Secure Document Vault</h2>
          <p className="text-slate-500 mb-6 font-medium">Enter password to access protected documents.</p>
          
          <form onSubmit={handleUnlock} className="space-y-4">
            <input 
              type="password" 
              placeholder="••••••••"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              className="w-full text-center tracking-widest text-xl px-4 py-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-2 focus:ring-slate-400 focus:outline-none"
            />
            {errorMsg && <p className="text-red-500 text-sm font-bold">{errorMsg}</p>}
            <button 
              type="submit"
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all font-display tracking-wide"
            >
              Unlock Vault
            </button>
          </form>
          
          {isAdmin && (
            <button 
              onClick={() => setIsSettingPassword(true)}
              className="mt-6 text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors"
            >
              Change Password
            </button>
          )}

          {isSettingPassword && isAdmin && (
            <form onSubmit={handleSetPassword} className="mt-4 pt-4 border-t border-slate-100 space-y-4">
              <p className="text-sm font-bold text-slate-700">Set New Password</p>
              <input 
                type="password" 
                placeholder="New password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button 
                type="submit"
                className="w-full bg-blue-100 text-blue-700 font-bold py-3 rounded-xl hover:bg-blue-200 transition-all"
              >
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const renderIcon = (type: string) => {
    if (type.includes('image')) return <FileImage className="w-8 h-8 text-blue-500" />;
    if (type.includes('pdf')) return <FileText className="w-8 h-8 text-red-500" />;
    return <File className="w-8 h-8 text-slate-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-black text-slate-900 flex items-center gap-2">
            <Lock className="w-6 h-6 text-emerald-500" />
            Document Vault
          </h2>
          <p className="text-slate-500 font-medium tracking-tight">Secure storage for enterprise documents</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={copyShareLink}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-bold hover:bg-blue-100 transition-colors text-sm"
            title="Copy Vault Link"
          >
            <Link size={16} />
            Share Link
          </button>
          <button 
            onClick={() => {
              setIsUnlocked(false);
              setPasswordInput('');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm"
          >
            <Lock size={16} />
            Lock Vault
          </button>
        </div>
      </div>

      {!currentFolder ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {folders.filter(f => !f.parentId).map(folder => (
              <button
                key={folder.id}
                onClick={() => setCurrentFolder(folder.id)}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all flex items-center gap-4 group text-left"
              >
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Folder size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 text-lg">{folder.name}</h3>
                  <p className="text-sm font-medium text-slate-400">View documents</p>
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowCreateFolder(true)}
              className="bg-slate-50 border-2 border-dashed border-slate-200 p-6 rounded-3xl hover:border-blue-300 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-2 group"
            >
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:scale-110 transition-all shadow-sm">
                <Plus size={24} />
              </div>
              <span className="font-bold text-slate-500 group-hover:text-blue-600">Create New Folder</span>
            </button>
          </div>

          {/* Create Folder Modal */}
          <AnimatePresence>
            {showCreateFolder && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-900">New Folder</h3>
                    <button onClick={() => setShowCreateFolder(false)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200">
                      <X size={16} />
                    </button>
                  </div>
                  <form onSubmit={handleCreateFolder} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Folder Name</label>
                      <input 
                        type="text" 
                        required
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        placeholder="e.g. Audit Reports"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={!newFolderName.trim()}
                      className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition"
                    >
                      Create Folder
                    </button>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                const f = folders.find(f => f.id === currentFolder);
                setCurrentFolder(f?.parentId || null);
              }}
              className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
              <Folder className="w-6 h-6 text-blue-500" />
              {folders.find(f => f.id === currentFolder)?.name}
            </h3>
            <div className="ml-auto flex items-center gap-2">
               <button 
                  onClick={() => setShowCreateFolder(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  <Plus size={18} />
                  New Folder
               </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <button 
                onClick={handleUploadClick}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <Upload size={18} />
                )}
                Upload Document
              </button>
            </div>
          </div>

          {folders.filter(f => f.parentId === currentFolder).length > 0 && (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
               {folders.filter(f => f.parentId === currentFolder).map(folder => (
                 <button
                    key={folder.id}
                    onClick={() => setCurrentFolder(folder.id)}
                    className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all flex items-center gap-4 group text-left"
                  >
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Folder size={20} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">{folder.name}</h3>
                    </div>
                  </button>
               ))}
             </div>
          )}

          <div 
            className={`bg-white rounded-3xl border ${isDragging ? 'border-blue-500 bg-blue-50/30' : 'border-slate-100'} shadow-sm flex flex-col min-h-[400px] transition-colors relative`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-500/10 backdrop-blur-[1px] rounded-3xl border-2 border-dashed border-blue-500">
                <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center">
                  <Upload className="w-12 h-12 text-blue-500 mb-2 animate-bounce" />
                  <p className="font-bold text-blue-900 text-lg">Drop files here</p>
                  <p className="text-sm text-blue-600">to upload to {folders.find(f => f.id === currentFolder)?.name}</p>
                </div>
              </div>
            )}
            
            {documents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                <FileBox className="w-16 h-16 mb-4 text-slate-200" />
                <p className="font-medium text-lg text-slate-500">No documents in this folder</p>
                <p className="text-sm mt-1">Upload a document to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
                <AnimatePresence>
                  {documents.map((doc) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      key={doc.id}
                      className="group bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden flex flex-col hover:shadow-md transition-all"
                    >
                      <a 
                        href={doc.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        download={doc.url.startsWith('data:') ? doc.name : undefined}
                        className="flex-1 p-6 flex flex-col items-center justify-center gap-4 text-center hover:bg-blue-50/50 transition-colors"
                      >
                        {renderIcon(doc.type)}
                        <span className="font-bold text-sm text-slate-700 font-sans line-clamp-2">{doc.name}</span>
                      </a>
                      <div className="px-4 py-3 bg-white border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(doc.createdAt, 'MMM dd, yyyy')}</span>
                        <button 
                          onClick={() => handleDelete(doc)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Create Folder Modal for Subfolders */}
          <AnimatePresence>
            {showCreateFolder && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-900">New Subfolder</h3>
                    <button onClick={() => setShowCreateFolder(false)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200">
                      <X size={16} />
                    </button>
                  </div>
                  <form onSubmit={handleCreateFolder} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Folder Name</label>
                      <input 
                        type="text" 
                        required
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        placeholder="e.g. Audit Reports"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={!newFolderName.trim()}
                      className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition"
                    >
                      Create Folder
                    </button>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
