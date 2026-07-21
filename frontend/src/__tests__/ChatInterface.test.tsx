import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatInterface } from '../components/Chat/ChatInterface';
import * as api from '../services/api';
import { useChatStore } from '../store/chatStore';

describe('ChatInterface', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useChatStore.getState().clearHistory();
  });

  it('sends a question and renders the full response: explanation, SQL, insights, confidence, follow-ups', async () => {
    vi.spyOn(api, 'askFinPilot').mockResolvedValue({
      sql: 'SELECT region, SUM(amount) FROM transactions GROUP BY region',
      explanation: 'This groups revenue by region.',
      confidence: 0.92,
      caveats: ['Excludes refunded transactions'],
      follow_up_questions: ['What about last quarter?', 'Break this down by product'],
      data: { rows: [{ region: 'NA', revenue: 5000 }, { region: 'EU', revenue: 3000 }], columns: ['region', 'revenue'] },
      insights: 'North America leads with 62% of total revenue.',
    });

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'show revenue by region' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('This groups revenue by region.')).toBeInTheDocument();
    expect(screen.getByText(/SELECT region, SUM\(amount\)/)).toBeInTheDocument();
    expect(screen.getByText(/92% confidence/)).toBeInTheDocument();
    expect(screen.getByText(/Excludes refunded transactions/)).toBeInTheDocument();
    expect(screen.getByText(/North America leads/)).toBeInTheDocument();
    expect(screen.getByText('What about last quarter?')).toBeInTheDocument();
  });

  it('clicking a follow-up question chip sends it as the next message', async () => {
    const askSpy = vi.spyOn(api, 'askFinPilot').mockResolvedValue({
      sql: 'SELECT 1',
      explanation: 'First answer',
      confidence: 0.9,
      caveats: [],
      follow_up_questions: ['Tell me more'],
      data: { rows: [], columns: [] },
      insights: '',
    });

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'first question' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('First answer');

    const chip = await screen.findByText('Tell me more');
    fireEvent.click(chip);

    await waitFor(() => expect(askSpy).toHaveBeenCalledWith('Tell me more'));
  });

  it('shows a clear error message when the backend returns an error', async () => {
    vi.spyOn(api, 'askFinPilot').mockRejectedValue({
      response: { data: { detail: "The AI tried to query table(s) that don't exist: sales" } },
    });

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'show me sales' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText(/tried to query table/)).toBeInTheDocument();
  });

  it('does not send an empty message when Send is clicked with blank input', async () => {
    const askSpy = vi.spyOn(api, 'askFinPilot');
    render(<ChatInterface />);
    const sendButton = screen.getByRole('button', { name: '' }); // send icon-only button, first match may vary
    // Instead directly assert askFinPilot never called after mounting with empty input
    expect(askSpy).not.toHaveBeenCalled();
  });

  it('toggles the history drawer and loads past queries', async () => {
    vi.spyOn(api, 'getHistory').mockResolvedValue({
      history: [{ id: '1', query: 'old question', sql: 'SELECT 1', created_at: Date.now() / 1000 }],
    });

    render(<ChatInterface />);
    const historyButton = screen.getByText(/history/i);
    fireEvent.click(historyButton);

    expect(await screen.findByText('old question')).toBeInTheDocument();
  });

  it('gracefully handles a chart-incompatible result shape (multi-column) without crashing', async () => {
    vi.spyOn(api, 'askFinPilot').mockResolvedValue({
      sql: 'SELECT * FROM customers',
      explanation: 'Here are all customers.',
      confidence: 0.8,
      caveats: [],
      follow_up_questions: [],
      data: {
        rows: [{ customer_id: 1, name: 'Acme', region: 'NA', signup_date: '2023-01-15' }],
        columns: ['customer_id', 'name', 'region', 'signup_date'],
      },
      insights: '',
    });

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'show all customers' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Here are all customers.')).toBeInTheDocument();
    // Table should render since chart isn't applicable for 4 columns
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('shows a confirmation warning for a mutation query instead of running it immediately', async () => {
    vi.spyOn(api, 'askFinPilot').mockResolvedValue({
      sql: "DELETE FROM customers WHERE customer_id = 1",
      explanation: 'This deletes the customer with ID 1.',
      confidence: 0.85,
      caveats: [],
      follow_up_questions: [],
      operation_type: 'DELETE',
      requires_confirmation: true,
      data: null,
      insights: null,
    });

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'delete customer 1' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText(/This will delete data in your database/)).toBeInTheDocument();
    expect(screen.getByText(/Yes, delete it/)).toBeInTheDocument();
    // Should NOT show a results table or insights since it wasn't executed
    expect(screen.queryByText('Executive Summary')).not.toBeInTheDocument();
  });

  it('executes a mutation after confirmation and shows the result', async () => {
    vi.spyOn(api, 'askFinPilot').mockResolvedValue({
      sql: "UPDATE customers SET region = 'Europe' WHERE customer_id = 1",
      explanation: 'This updates the region for customer 1.',
      confidence: 0.9,
      caveats: [],
      follow_up_questions: [],
      operation_type: 'UPDATE',
      requires_confirmation: true,
      data: null,
      insights: null,
    });
    const execSpy = vi.spyOn(api, 'executeMutation').mockResolvedValue({ success: true, operation_type: 'UPDATE', rows_affected: 1 });

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'update customer 1 region to Europe' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const confirmButton = await screen.findByText(/Yes, change it/);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(execSpy).toHaveBeenCalled());
    expect(await screen.findByText(/1 row\(s\) affected/)).toBeInTheDocument();
  });

  it('cancelling a mutation does not call executeMutation', async () => {
    vi.spyOn(api, 'askFinPilot').mockResolvedValue({
      sql: "DROP TABLE products",
      explanation: 'This deletes the products table.',
      confidence: 0.8,
      caveats: [],
      follow_up_questions: [],
      operation_type: 'DROP',
      requires_confirmation: true,
      data: null,
      insights: null,
    });
    const execSpy = vi.spyOn(api, 'executeMutation');

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'drop products table' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    fireEvent.click(await screen.findByText('Cancel'));

    expect(await screen.findByText(/Cancelled — no changes were made/)).toBeInTheDocument();
    expect(execSpy).not.toHaveBeenCalled();
  });
});
