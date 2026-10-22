import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';
import { Textarea } from '@shared/components/textarea/textarea';

@Component({
  selector: 'app-supplier-inquiry',
  imports: [Alert, Button, Card, Input, Select, Textarea],
  templateUrl: './supplier-inquiry.html',
  styleUrl: './supplier-inquiry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierInquiry {
  protected readonly submitted = signal(false);

  protected submit(event: SubmitEvent): void {
    event.preventDefault();
    this.submitted.set(true);
  }
}
