import { inject, provideAppInitializer } from '@angular/core';
import { environment } from '@env/environment';
import { AuthService } from './services/auth.service';

const DEMO_USER = { id: 'demo', email: 'sujansaha@gmail.com', firstName: 'Sujan', lastName: 'saha' };

/**
 * Development-only shortcut while no auth API exists:
 *   /?demo=login   signs in a demo user (shows the signed-in header menu, unlocks guarded routes)
 *   /?demo=logout  signs out again
 * Does nothing in production builds.
 */
export function provideDemoSession() {
  return provideAppInitializer(() => {
    if (environment.production) return;
    const action = new URLSearchParams(window.location.search).get('demo');
    const auth = inject(AuthService);
    if (action === 'login') auth.setSession(DEMO_USER, 'demo-token');
    if (action === 'logout') auth.clearSession();
  });
}
