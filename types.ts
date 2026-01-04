
export enum NumberStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD'
}

export interface Participant {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface Purchase {
  number: number;
  date: number;
  prizeName: string;
}

export interface RaffleNumber {
  id: number;
  status: NumberStatus;
  ownerId?: string;
}

export interface RaffleState {
  totalNumbers: number;
  pricePerNumber: number;
  maxPurchaseLimit: number;
  maxEntriesPerPhone: number;
  soldNumbers: Set<number>;
  numberOwners: Map<number, string>;
  reservedNumbers: Map<number, { expiresAt: number }>;
  participants: Map<string, Participant>;
  phoneToNumbers: Map<string, number[]>;
  participantToNumbers: Map<string, number[]>;
  winner?: {
    number: number;
    participant: Participant;
    message?: string;
  };
}
