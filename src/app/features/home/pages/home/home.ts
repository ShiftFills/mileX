import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Footer } from '@layouts/components/footer/footer';
import { StorefrontHeader } from '@layouts/components/storefront-header/storefront-header';
import { HeroBanner } from '../../components/hero-banner/hero-banner';
import { HomeShowcases } from '../../components/home-showcases/home-showcases';
import { SupplierInquiry } from '../../components/supplier-inquiry/supplier-inquiry';

@Component({
  selector: 'app-home',
  imports: [Footer, HeroBanner, HomeShowcases, RouterLink, StorefrontHeader, SupplierInquiry],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly routes = APP_ROUTES;
  protected readonly categories = [
    {
      name: 'Smart Watches',
      query: 'smart-watches',
      discount: 'Min. 25% Off',
      image: '/images/watch.svg',
    },
    {
      name: 'Laptop',
      query: 'laptops',
      discount: 'Min. 55% Off',
      image: '/images/laptop.svg',
    },
    {
      name: 'Canon Cameras',
      query: 'cameras',
      discount: 'Min. 40% Off',
      image: '/images/camera.svg',
    },
    {
      name: 'Headphones',
      query: 'headphones',
      discount: 'Min. 55% Off',
      image: '/images/headphones.svg',
    },
    {
      name: 'Mobile Phones',
      query: 'mobile-phones',
      discount: 'Min. 25% Off',
      image: '/images/mobile-phone.svg',
    },
  ];
}
