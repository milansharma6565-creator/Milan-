import { Bill } from '../types';

export interface WhatsAppTemplateItem {
  id: string;
  title: string;
  titleHi: string;
  category: 'lifecycle' | 'account' | 'hydrant' | 'broadcast';
  eventType?: string;
  description: string;
  descriptionHi: string;
  template: string;
  defaultTemplate: string;
  variables: string[];
  enabled: boolean;
}

export interface WhatsAppStatusResponse {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrCodeDataUrl: string | null;
  rawQr: string | null;
  user: {
    id: string;
    name?: string;
    phone?: string;
  } | null;
  connectedAt: string | null;
  autoNotifications: {
    onOrderBooked: boolean;
    onFilling: boolean;
    onDispatched: boolean;
    onDelivered: boolean;
    onCancelled: boolean;
    onPaymentReminder?: boolean;
    onPaymentReceipt?: boolean;
    onMonthlyPass?: boolean;
    onHydrantToken?: boolean;
  };
}

export const whatsappService = {
  // Fetch live WhatsApp session & QR status
  async getStatus(): Promise<WhatsAppStatusResponse> {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (!res.ok) throw new Error('Failed to fetch WhatsApp status');
      return await res.json();
    } catch (e: any) {
      console.warn('WhatsApp getStatus error:', e);
      return {
        status: 'disconnected',
        qrCodeDataUrl: null,
        rawQr: null,
        user: null,
        connectedAt: null,
        autoNotifications: {
          onOrderBooked: true,
          onFilling: true,
          onDispatched: true,
          onDelivered: true,
          onCancelled: true,
        },
      };
    }
  },

  // Get all WhatsApp templates
  async getTemplates(): Promise<Record<string, WhatsAppTemplateItem>> {
    try {
      const res = await fetch('/api/whatsapp/templates');
      if (!res.ok) throw new Error('Failed to fetch WhatsApp templates');
      const data = await res.json();
      return data.templates || {};
    } catch (e: any) {
      console.warn('WhatsApp getTemplates error:', e);
      return {};
    }
  },

  // Save / Update one or multiple WhatsApp templates
  async saveTemplates(templates: Record<string, Partial<WhatsAppTemplateItem>>): Promise<any> {
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Update a single template
  async updateTemplate(templateId: string, updates: Partial<WhatsAppTemplateItem>): Promise<any> {
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, ...updates }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Trigger connect / generate fresh QR
  async connect(forceRefresh = false): Promise<WhatsAppStatusResponse> {
    const res = await fetch('/api/whatsapp/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceRefresh }),
    });
    if (!res.ok) throw new Error('Failed to connect WhatsApp');
    return await res.json();
  },

  // Disconnect & clear session
  async disconnect(): Promise<WhatsAppStatusResponse> {
    const res = await fetch('/api/whatsapp/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to disconnect WhatsApp');
    return await res.json();
  },

  // Send single message
  async sendMessage(to: string, message: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/whatsapp/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  },

  // Send media (Thermal bill JPEG / PDF)
  async sendMedia(
    to: string,
    mediaDataUrl: string,
    caption?: string,
    mimetype = 'image/jpeg',
    fileName = 'Receipt.jpg'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/whatsapp/send-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, mediaDataUrl, caption, mimetype, fileName }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  },

  // Trigger Automated Order Lifecycle Notification
  async notifyOrder(
    bill: Bill | any,
    eventType: 'booked' | 'filling' | 'dispatched' | 'delivered' | 'cancelled' | 'bill_generated',
    franchise?: any,
    imageDataUrl?: string
  ): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
    try {
      const res = await fetch('/api/whatsapp/notify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill, eventType, franchise, imageDataUrl }),
      });
      return await res.json();
    } catch (e: any) {
      console.warn(`WhatsApp order notification (${eventType}) skipped or failed:`, e);
      return { success: false, error: e.message };
    }
  },

  // Queue bulk broadcast
  async queueBroadcast(
    recipients: Array<{ phone: string; name: string }>,
    messageTemplate: string,
    franchise?: any
  ): Promise<{ success: boolean; queuedCount?: number; error?: string }> {
    try {
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, messageTemplate, franchise }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Get broadcast queue status
  async getBroadcastStatus(): Promise<{ pendingInQueue: number; isProcessing: boolean }> {
    try {
      const res = await fetch('/api/whatsapp/broadcast-status');
      return await res.json();
    } catch (e) {
      return { pendingInQueue: 0, isProcessing: false };
    }
  },

  // Clear broadcast queue
  async clearBroadcast(): Promise<{ success: boolean; clearedCount?: number }> {
    try {
      const res = await fetch('/api/whatsapp/clear-broadcast', { method: 'POST' });
      return await res.json();
    } catch (e: any) {
      return { success: false };
    }
  },

  // Update notification settings
  async updateSettings(settings: Partial<WhatsAppStatusResponse['autoNotifications']>): Promise<any> {
    try {
      const res = await fetch('/api/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
