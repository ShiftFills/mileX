import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-admin-section',
  templateUrl: './admin-section.html',
  styleUrl: './admin-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSection {
  protected readonly heading = inject(ActivatedRoute).snapshot.data['heading'] as string;
}
