import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, tap } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ProductCatalogService, ProductLookupOption } from '@core/services/product-catalog.service';
import { HeroBanner } from '../../components/hero-banner/hero-banner';
import { HomeShowcases } from '../../components/home-showcases/home-showcases';
import { SupplierInquiry } from '../../components/supplier-inquiry/supplier-inquiry';

@Component({
  selector: 'app-home',
  imports: [HeroBanner, HomeShowcases, RouterLink, SupplierInquiry],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly productCatalog = inject(ProductCatalogService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly routes = APP_ROUTES;
  protected readonly categories = signal<ProductLookupOption[]>([]);
  protected readonly categoriesStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly categoriesError = signal<string | null>(null);

  constructor() {
    this.loadCategories();
  }

  protected retryCategories(): void {
    this.loadCategories();
  }

  private loadCategories(): void {
    this.categoriesStatus.set('loading');
    this.categoriesError.set(null);
    this.productCatalog.loadCategories().pipe(
      tap((categories) => {
        this.categories.set(categories);
        this.categoriesStatus.set('success');
      }),
      catchError((error: unknown) => {
        this.categoriesError.set(this.productCatalog.getErrorMessage(error));
        this.categoriesStatus.set('error');
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }
}
