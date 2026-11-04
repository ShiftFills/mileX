import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from '@shared/components/toast/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  template: `<router-outlet /><app-toast />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
