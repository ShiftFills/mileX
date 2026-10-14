import { ChangeDetectionStrategy, Component, TemplateRef, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

export interface TableHeaderContext<T> {
  $implicit: readonly T[];
}

export interface TableCellContext<T> {
  $implicit: T;
  row: T;
  index: number;
}

export interface TableColumn<T extends object> {
  key: string;
  label: string;
  width?: string;
  tabletWidth?: string;
  mobileWidth?: string;
  optional?: boolean;
  hideOnSmall?: boolean;
  selection?: boolean;
  emphasized?: boolean;
  bold?: boolean;
  headerTemplate?: TemplateRef<TableHeaderContext<T>>;
  cellTemplate?: TemplateRef<TableCellContext<T>>;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  selector: 'app-table',
  styleUrl: './table.scss',
  templateUrl: './table.html',
})
export class Table<T extends object = object> {
  readonly columns = input<readonly TableColumn<T>[]>([]);
  readonly rows = input<readonly T[]>([]);
  readonly emptyMessage = input('No records found.');

  protected valueFor(row: T, key: string): unknown {
    return (row as Record<string, unknown>)[key];
  }
}
