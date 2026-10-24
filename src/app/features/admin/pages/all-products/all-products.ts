import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';
import { Table, TableCellContext, TableColumn, TableHeaderContext } from '@shared/components/table/table';
import { ADMIN_PRODUCTS, AdminProductRow } from '../../data/admin-products';

interface ProductEditForm {
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: string;
  status: AdminProductRow['status'];
}

const PAGE_SIZE = 6;

@Component({
  selector: 'app-admin-all-products',
  imports: [Badge, Button, Card, Checkbox, Dialog, Input, Select, Table],
  templateUrl: './all-products.html',
  styleUrl: './all-products.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllProducts {
  private readonly router = inject(Router);
  protected readonly products = signal(ADMIN_PRODUCTS);
  protected readonly query = signal('');
  protected readonly category = signal('');
  protected readonly brand = signal('');
  protected readonly statusTab = signal<'All' | 'Active' | 'Inactive'>('All');
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());
  protected readonly openActionMenuId = signal<number | null>(null);
  protected readonly editingProduct = signal<AdminProductRow | null>(null);
  protected readonly editForm = signal<ProductEditForm | null>(null);
  protected readonly editError = signal('');
  private readonly selectAllHeader = viewChild<TemplateRef<TableHeaderContext<AdminProductRow>>>('selectAllHeader');
  private readonly selectRowCell = viewChild<TemplateRef<TableCellContext<AdminProductRow>>>('selectRowCell');
  private readonly imageCell = viewChild<TemplateRef<TableCellContext<AdminProductRow>>>('imageCell');
  private readonly statusCell = viewChild<TemplateRef<TableCellContext<AdminProductRow>>>('statusCell');
  private readonly actionCell = viewChild<TemplateRef<TableCellContext<AdminProductRow>>>('actionCell');
  protected readonly tableColumns = computed<readonly TableColumn<AdminProductRow>[]>(() => [
    {
      key: 'selection', label: '', width: '4%', tabletWidth: '5%', selection: true, hideOnSmall: true,
      headerTemplate: this.selectAllHeader(), cellTemplate: this.selectRowCell(),
    },
    {
      key: 'image', label: 'Image', width: '8%', tabletWidth: '10%', hideOnSmall: true,
      cellTemplate: this.imageCell(),
    },
    { key: 'name', label: 'Product Name', width: '16%', tabletWidth: '30%', mobileWidth: '40%', emphasized: true },
    { key: 'sku', label: 'SKU / Product Code', width: '17%', optional: true },
    { key: 'category', label: 'Category', width: '11%', optional: true },
    { key: 'brand', label: 'Brand', width: '8%', optional: true },
    { key: 'price', label: 'Price', width: '8%', tabletWidth: '13%', mobileWidth: '20%', bold: true },
    { key: 'stock', label: 'Stock', width: '6%', tabletWidth: '10%', mobileWidth: '15%' },
    {
      key: 'status', label: 'Status', width: '8%', tabletWidth: '12%', mobileWidth: '25%',
      cellTemplate: this.statusCell(),
    },
    {
      key: 'actions', label: 'Action', width: '8%', tabletWidth: '20%', hideOnSmall: true,
      overflowVisible: true,
      cellTemplate: this.actionCell(),
    },
  ]);
  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visibleRows();
    return rows.length > 0 && rows.every((row) => this.selectedIds().has(row.id));
  });
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / PAGE_SIZE)));
  protected readonly pageNumbers = computed(() => {
    const count = Math.min(this.pageCount(), 5);
    const first = Math.min(Math.max(1, this.page() - 2), this.pageCount() - count + 1);
    return Array.from({ length: count }, (_, index) => first + index);
  });
  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.products().filter((row) => {
      const matchesQuery = !query || `${row.name} ${row.sku} ${row.category} ${row.brand}`.toLowerCase().includes(query);
      const matchesCategory = !this.category() || row.category === this.category();
      const matchesBrand = !this.brand() || row.brand === this.brand();
      const matchesStatus = this.statusTab() === 'All' || row.status === this.statusTab();
      return matchesQuery && matchesCategory && matchesBrand && matchesStatus;
    });
  });
  protected readonly visibleRows = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });

  protected setQuery(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.query.set(input.value);
      this.page.set(1);
    }
  }

  protected setCategory(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) {
      this.category.set(select.value);
      this.page.set(1);
    }
  }

  protected setBrand(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) {
      this.brand.set(select.value);
      this.page.set(1);
    }
  }

  protected setStatus(status: 'All' | 'Active' | 'Inactive'): void {
    this.statusTab.set(status);
    this.page.set(1);
  }

  protected statusChange(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement && ['All', 'Active', 'Inactive'].includes(select.value)) {
      this.setStatus(select.value as 'All' | 'Active' | 'Inactive');
    }
  }

  protected toggleSelected(id: number, checked: boolean): void {
    this.selectedIds.update((selected) => {
      const next = new Set(selected);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected toggleAllVisible(checked: boolean): void {
    this.selectedIds.update((selected) => {
      const next = new Set(selected);
      for (const row of this.visibleRows()) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  protected setPage(page: number): void {
    if (page >= 1 && page <= this.pageCount()) this.page.set(page);
  }

  protected rangeStart(): number {
    return this.filteredRows().length ? (this.page() - 1) * PAGE_SIZE + 1 : 0;
  }

  protected rangeEnd(): number {
    return Math.min(this.page() * PAGE_SIZE, this.filteredRows().length);
  }

  protected addProduct(): void {
    void this.router.navigateByUrl('/admin/products/new');
  }

  protected editProduct(product: AdminProductRow): void {
    this.openActionMenuId.set(null);
    void this.router.navigate(['/admin/products', product.id, 'edit']);
  }

  protected variants(): void {
    void this.router.navigateByUrl('/admin/products/variants');
  }

  protected toggleActionMenu(productId: number): void {
    this.openActionMenuId.update((openId) => openId === productId ? null : productId);
  }

  protected openEdit(product: AdminProductRow): void {
    this.editingProduct.set(product);
    this.editForm.set({
      name: product.name,
      sku: product.sku,
      category: product.category,
      brand: product.brand,
      price: product.price.replace(/[^\d.]/g, ''),
      stock: String(product.stock),
      status: product.status,
    });
    this.editError.set('');
    this.openActionMenuId.set(null);
  }

  protected setEditField(key: keyof ProductEditForm, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    this.editForm.update((form) => form ? { ...form, [key]: target.value } : form);
    this.editError.set('');
  }

  protected saveEdit(): void {
    const selected = this.editingProduct();
    const form = this.editForm();
    if (!selected || !form) return;

    const price = Number(form.price);
    const stock = Number(form.stock);
    if (
      !form.name.trim() || !form.sku.trim() || !form.category || !form.brand ||
      !Number.isFinite(price) || price <= 0 ||
      !Number.isInteger(stock) || stock < 0
    ) {
      this.editError.set('Enter a name, SKU, category, brand, valid price, and whole stock quantity of 0 or more.');
      return;
    }

    this.products.update((rows) => rows.map((row) => row.id === selected.id ? {
      ...row,
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category,
      brand: form.brand,
      price: `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      stock,
      status: form.status,
    } : row));
    this.closeEdit();
  }

  protected closeEdit(): void {
    this.editingProduct.set(null);
    this.editForm.set(null);
    this.editError.set('');
  }
}
