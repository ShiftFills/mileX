import { Injectable, computed, inject, signal } from '@angular/core';
import { User } from '@shared/models';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { StorageService } from './storage.service';

/**
 * Session state only (who is signed in, and their token).
 * Login/register API calls will be added with the `auth` feature.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storage = inject(StorageService);

  private readonly _user = signal<User | null>(this.storage.get<User>(STORAGE_KEYS.user));
  private readonly _token = signal<string | null>(
    this.storage.get<string>(STORAGE_KEYS.accessToken),
  );

  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token() && !!this._user());

  setSession(user: User, token: string): void {
    this._user.set(user);
    this._token.set(token);
    this.storage.set(STORAGE_KEYS.user, user);
    this.storage.set(STORAGE_KEYS.accessToken, token);
  }

  clearSession(): void {
    this._user.set(null);
    this._token.set(null);
    this.storage.remove(STORAGE_KEYS.user);
    this.storage.remove(STORAGE_KEYS.accessToken);
  }
}
