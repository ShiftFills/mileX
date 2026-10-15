import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Button } from '@shared/components/button/button';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';

interface Variant {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  color: string;
  material: string;
  size: string;
  weight: string;
  stock: number;
  price: number;
}

@Component({
  selector: 'app-product-variants',
  imports: [DecimalPipe, FormsModule, Button, Dialog, Input, Select],
  templateUrl: './product-variants.html',
  styleUrl: './product-variants.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariants {
  protected readonly variants = signal<Variant[]>(Array.from({ length: 6 }, (_, i) => ({
    id: i + 1, name: 'Black - Regular', sku: 'MLEX-001', barcode: '8901234567890', color: 'Black', material: 'Plastic', size: 'M', weight: '', stock: 120, price: 2500,
  })));
  protected readonly page = signal(1);
  protected readonly dialog = signal<'add' | 'edit' | 'delete' | null>(null);
  protected readonly selected = signal<Variant | null>(null);
  protected readonly menu = signal<number | null>(null);
  protected readonly form = signal({ name: '', sku: '', barcode: '', size: '', color: '', material: '', weight: '', price: '', stock: '' });
  protected readonly error = signal(false);

  protected openAdd(): void {
    this.selected.set(null);
    this.form.set({ name: '', sku: '', barcode: '', size: '', color: '', material: '', weight: '', price: '', stock: '' });
    this.error.set(false);
    this.dialog.set('add');
  }
  protected openEdit(row: Variant): void {
    this.selected.set(row);
    this.form.set({ name: row.name, sku: row.sku, barcode: row.barcode, size: row.size, color: row.color, material: row.material, weight: row.weight, price: String(row.price), stock: String(row.stock) });
    this.error.set(false);
    this.dialog.set('edit');
    this.menu.set(null);
  }
  protected openDelete(row: Variant): void { this.selected.set(row); this.dialog.set('delete'); this.menu.set(null); }
  protected close(): void { this.dialog.set(null); this.error.set(false); }
  protected setField(key: keyof ReturnType<typeof this.form>, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) this.form.update((v) => ({ ...v, [key]: target.value }));
  }
  protected save(): void {
    const v = this.form();
    if (!v.name.trim() || !v.sku.trim() || !v.color || !v.price.trim() || !v.stock.trim()) { this.error.set(true); return; }
    const row: Variant = { id: this.selected()?.id ?? Date.now(), name: v.name, sku: v.sku, barcode: v.barcode || '—', color: v.color, material: v.material || '—', size: v.size, weight: v.weight, stock: Number(v.stock), price: Number(v.price) };
    this.variants.update((rows) => this.dialog() === 'edit' ? rows.map((x) => x.id === row.id ? row : x) : [row, ...rows]);
    this.close();
  }
  protected confirmDelete(): void { const id = this.selected()?.id; this.variants.update((rows) => rows.filter((r) => r.id !== id)); this.close(); }
  protected setPage(n: number): void { this.page.set(Math.max(1, Math.min(6, n))); }
}
