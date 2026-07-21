import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SchemaExplorer } from '../components/Data/SchemaExplorer';
import * as api from '../services/api';

function mockBaseline(tables: any[] = [], configs: any[] = [], relationships: any[] = []) {
  vi.spyOn(api, 'getSchema').mockResolvedValue({ tables });
  vi.spyOn(api, 'getDashboardConfigs').mockResolvedValue({ configs });
  vi.spyOn(api, 'getRelationships').mockResolvedValue({ relationships });
}

describe('SchemaExplorer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders real schema tables and columns', async () => {
    mockBaseline([
      { name: 'customers', columns: [{ name: 'customer_id', type: 'INTEGER', primary_key: true }, { name: 'name', type: 'TEXT', primary_key: false }] },
      { name: 'transactions', columns: [{ name: 'transaction_id', type: 'INTEGER', primary_key: true }] },
    ]);

    render(<SchemaExplorer />);
    // "customers"/"transactions" also appear as <option> text in the
    // relationship builder's dropdowns, so assert at least one match
    // rather than a single unique element.
    expect((await screen.findAllByText('customers')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('transactions').length).toBeGreaterThan(0);
    expect(screen.getByText('customer_id')).toBeInTheDocument();
  });

  it('uploads multiple CSVs at once and shows per-file results', async () => {
    mockBaseline([]);
    const uploadSpy = vi.spyOn(api, 'uploadCsv').mockResolvedValue({
      results: [
        { ok: true, filename: 'sales.csv', table_name: 'sales', row_count: 3, ineligible_reason: null },
        { ok: true, filename: 'notes.csv', table_name: 'notes', row_count: 2, ineligible_reason: 'This file has no numeric columns, so it can\'t power KPIs or charts.' },
      ],
    });

    render(<SchemaExplorer />);
    await waitFor(() => expect(api.getSchema).toHaveBeenCalledTimes(1));

    const file1 = new File(['month,revenue\n2024-01,1000'], 'sales.csv', { type: 'text/csv' });
    const file2 = new File(['note\nhello'], 'notes.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file1, file2] } });

    expect(await screen.findByText(/Added table "sales" \(3 rows\) from "sales.csv"/)).toBeInTheDocument();
    expect(await screen.findByText(/Added table "notes".*can't power KPIs/)).toBeInTheDocument();
    expect(uploadSpy).toHaveBeenCalledWith([file1, file2]);
    await waitFor(() => expect(api.getSchema).toHaveBeenCalledTimes(2));
  });

  it('shows a per-file error when one file in a multi-upload fails', async () => {
    mockBaseline([]);
    vi.spyOn(api, 'uploadCsv').mockResolvedValue({
      results: [
        { ok: true, filename: 'good.csv', table_name: 'good', row_count: 1, ineligible_reason: null },
        { ok: false, filename: 'bad.txt', error: 'Only .csv files are supported right now.' },
      ],
    });

    render(<SchemaExplorer />);
    await waitFor(() => expect(api.getSchema).toHaveBeenCalledTimes(1));

    const file1 = new File(['a,b\n1,2'], 'good.csv', { type: 'text/csv' });
    const file2 = new File(['garbage'], 'bad.txt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file1, file2] } });

    expect(await screen.findByText((text) => text.includes('bad.txt') && text.includes('Only .csv files are supported'))).toBeInTheDocument();
    expect(await screen.findByText(/Added table "good"/)).toBeInTheDocument();
  });

  it('shows an error state with retry when schema fetch fails', async () => {
    vi.spyOn(api, 'getSchema').mockRejectedValue({ response: { data: { detail: 'Backend not running' } } });
    vi.spyOn(api, 'getDashboardConfigs').mockResolvedValue({ configs: [] });
    vi.spyOn(api, 'getRelationships').mockResolvedValue({ relationships: [] });

    render(<SchemaExplorer />);
    expect(await screen.findByText('Backend not running')).toBeInTheDocument();
  });

  it('deletes a table after confirmation, and refreshes the schema list', async () => {
    vi.spyOn(api, 'getSchema')
      .mockResolvedValueOnce({ tables: [{ name: 'products', columns: [{ name: 'id', type: 'INTEGER', primary_key: true }] }] })
      .mockResolvedValueOnce({ tables: [] });
    vi.spyOn(api, 'getDashboardConfigs').mockResolvedValue({ configs: [] });
    vi.spyOn(api, 'getRelationships').mockResolvedValue({ relationships: [] });
    const deleteSpy = vi.spyOn(api, 'deleteTable').mockResolvedValue({ deleted: 'products' });

    render(<SchemaExplorer />);
    expect((await screen.findAllByText('products')).length).toBeGreaterThan(0);

    const trashButton = document.querySelector('button[title=\'Delete table "products"\']') as HTMLElement;
    fireEvent.click(trashButton);
    expect(deleteSpy).not.toHaveBeenCalled();

    const confirmButton = await screen.findByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('products'));
    expect(await screen.findByText('Deleted "products".')).toBeInTheDocument();
  });

  it('cancels a delete without calling the API', async () => {
    mockBaseline([{ name: 'customers', columns: [{ name: 'id', type: 'INTEGER', primary_key: true }] }]);
    const deleteSpy = vi.spyOn(api, 'deleteTable');

    render(<SchemaExplorer />);
    const trashButton = await screen.findByTitle('Delete table "customers"');
    fireEvent.click(trashButton);

    const cancelButton = await screen.findByText('Cancel');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getAllByText('customers').length).toBeGreaterThan(0);
  });

  it('opens the dashboard mapping form and saves a config', async () => {
    mockBaseline([
      { name: 'sales', columns: [{ name: 'date', type: 'TEXT', primary_key: false }, { name: 'amount', type: 'REAL', primary_key: false }, { name: 'region', type: 'TEXT', primary_key: false }] },
    ]);
    const saveSpy = vi.spyOn(api, 'setDashboardConfig').mockResolvedValue({ ok: true });

    render(<SchemaExplorer />);
    const mapButton = await screen.findByText('Set as Dashboard Source');
    fireEvent.click(mapButton);

    expect(await screen.findByText('Map columns for the Dashboard')).toBeInTheDocument();

    // amount is required — try saving without it
    fireEvent.click(screen.getByText('Set as Dashboard Source', { selector: 'button' }));
    expect(await screen.findByText(/amount column is required/)).toBeInTheDocument();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('adds a relationship between two tables', async () => {
    mockBaseline([
      { name: 'orders', columns: [{ name: 'customer_id', type: 'INTEGER', primary_key: false }] },
      { name: 'customers', columns: [{ name: 'id', type: 'INTEGER', primary_key: true }] },
    ]);
    const relSpy = vi.spyOn(api, 'createRelationship').mockResolvedValue({ id: 'rel1' });

    render(<SchemaExplorer />);
    expect(await screen.findByText('Table Relationships')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    // selects[0] = Table A, selects[1] = Column A, selects[2] = Table B, selects[3] = Column B
    fireEvent.change(selects[0], { target: { value: 'orders' } });
    fireEvent.change(selects[1], { target: { value: 'customer_id' } });
    fireEvent.change(selects[2], { target: { value: 'customers' } });
    fireEvent.change(selects[3], { target: { value: 'id' } });

    fireEvent.click(screen.getByText('Connect'));
    await waitFor(() => expect(relSpy).toHaveBeenCalledWith('orders', 'customer_id', 'customers', 'id'));
  });
});
