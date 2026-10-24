import { Injectable, computed, inject, signal } from '@angular/core';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { DeliveryAddress } from '@shared/models';
import { StorageService } from './storage.service';

/** Addresses shown to first-time visitors (no stored list yet). */
const DEMO_ADDRESSES: readonly DeliveryAddress[] = [
  {
    id: 'address-home',
    type: 'home',
    fullName: 'Sujan Saha',
    mobile: '9876543210',
    pincode: '600042',
    house: 'No. 24',
    street: '2nd Street, Saidapet',
    city: 'Chennai',
    state: 'Tamil Nadu',
  },
  {
    id: 'address-work',
    type: 'work',
    fullName: 'Sujan Saha',
    mobile: '9876543210',
    pincode: '600032',
    house: 'Office',
    street: 'Guindy Industrial Estate',
    city: 'Chennai',
    state: 'Tamil Nadu',
  },
];

/** Saved delivery addresses and the one chosen for the current order. */
@Injectable({ providedIn: 'root' })
export class AddressService {
  private readonly storage = inject(StorageService);
  private readonly _addresses = signal<DeliveryAddress[]>(this.readAddresses());
  /** An address used for this order only ("save for future orders" unticked). */
  private readonly oneOff = signal<DeliveryAddress | null>(null);
  private readonly selectedId = signal<string | null>(this.storage.get<string>(STORAGE_KEYS.selectedAddress));

  readonly addresses = this._addresses.asReadonly();
  readonly selected = computed(() => {
    const id = this.selectedId();
    const oneOff = this.oneOff();
    if (oneOff && oneOff.id === id) return oneOff;
    const list = this._addresses();
    return list.find((address) => address.id === id) ?? list[0] ?? null;
  });

  select(id: string): void {
    this.selectedId.set(id);
    this.storage.set(STORAGE_KEYS.selectedAddress, id);
  }

  /** Adds (no `id`) or updates (existing `id`) a saved address, selects it and returns it. */
  save(address: Omit<DeliveryAddress, 'id'> & { id?: string }): DeliveryAddress {
    const saved: DeliveryAddress = { ...address, id: address.id ?? `address-${Date.now()}` };
    const list = this._addresses();
    this.persist(
      list.some((item) => item.id === saved.id)
        ? list.map((item) => (item.id === saved.id ? saved : item))
        : [...list, saved],
    );
    this.select(saved.id);
    return saved;
  }

  /** Uses an address for this order without adding it to the saved list. */
  useOnce(address: Omit<DeliveryAddress, 'id'>): DeliveryAddress {
    const temporary: DeliveryAddress = { ...address, id: 'address-one-off' };
    this.oneOff.set(temporary);
    this.selectedId.set(temporary.id);
    return temporary;
  }

  private persist(list: DeliveryAddress[]): void {
    this._addresses.set(list);
    this.storage.set(STORAGE_KEYS.addresses, list);
  }

  private readAddresses(): DeliveryAddress[] {
    const stored = this.storage.get<unknown>(STORAGE_KEYS.addresses);
    if (!Array.isArray(stored)) return [...DEMO_ADDRESSES];
    return stored.filter(
      (entry): entry is DeliveryAddress =>
        typeof entry === 'object' && entry !== null && typeof (entry as DeliveryAddress).id === 'string',
    );
  }
}
