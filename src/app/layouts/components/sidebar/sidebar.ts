import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface SidebarLink {
  label: string;
  path: string;
  icon?: 'dashboard' | 'products' | 'cart';
  children?: SidebarLink[];
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly title = input<string>('');
  readonly links = input.required<SidebarLink[]>();
  readonly variant = input<'default' | 'admin'>('default');
}
