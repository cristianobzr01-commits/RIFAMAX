
import { RaffleState, Participant, Purchase } from '../types';

const DB_NAME = 'MegaRifaDB';
const DB_VERSION = 1;

export class DatabaseService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state');
        }
        if (!db.objectStoreNames.contains('participants')) {
          db.createObjectStore('participants', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('myPurchases')) {
          db.createObjectStore('myPurchases', { keyPath: 'number' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => reject('Erro ao abrir base de dados');
    });
  }

  async saveState(state: any): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['state'], 'readwrite');
      const store = transaction.objectStore('state');
      // Convert Set and Map to Array for storage
      const data = {
        ...state,
        soldNumbers: Array.from(state.soldNumbers),
        numberOwners: Array.from(state.numberOwners.entries()),
        participants: Array.from(state.participants.entries()),
        phoneToNumbers: Array.from(state.phoneToNumbers.entries()),
        emailToNumbers: Array.from(state.emailToNumbers.entries()),
        participantToNumbers: Array.from(state.participantToNumbers.entries()),
      };
      store.put(data, 'current_raffle');
      transaction.oncomplete = () => resolve();
    });
  }

  async loadState(): Promise<any | null> {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['state'], 'readonly');
      const store = transaction.objectStore('state');
      const request = store.get('current_raffle');
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async saveMyPurchase(purchase: Purchase): Promise<void> {
    if (!this.db) return;
    const transaction = this.db.transaction(['myPurchases'], 'readwrite');
    transaction.objectStore('myPurchases').put(purchase);
  }

  async getMyPurchases(): Promise<Purchase[]> {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['myPurchases'], 'readonly');
      const store = transaction.objectStore('myPurchases');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) return;
    const stores = ['state', 'participants', 'myPurchases'];
    const transaction = this.db.transaction(stores, 'readwrite');
    stores.forEach(s => transaction.objectStore(s).clear());
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve();
    });
  }
}

export const dbService = new DatabaseService();
