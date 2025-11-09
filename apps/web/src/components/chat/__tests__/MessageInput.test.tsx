import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '../MessageInput';

describe('MessageInput', () => {
  it('renders input and send button', () => {
    render(<MessageInput onSendMessage={jest.fn()} />);

    expect(screen.getByLabelText('Message input')).toBeInTheDocument();
    expect(screen.getByLabelText('Send message')).toBeInTheDocument();
  });

  it('calls onSendMessage when send button clicked', async () => {
    const handleSend = jest.fn();
    const user = userEvent.setup();

    render(<MessageInput onSendMessage={handleSend} />);

    const input = screen.getByLabelText('Message input');
    const sendButton = screen.getByLabelText('Send message');

    await user.type(input, 'Test message');
    await user.click(sendButton);

    expect(handleSend).toHaveBeenCalledWith('Test message');
  });

  it('calls onSendMessage when Enter key pressed', () => {
    const handleSend = jest.fn();
    render(<MessageInput onSendMessage={handleSend} />);

    const input = screen.getByLabelText('Message input');

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleSend).toHaveBeenCalledWith('Test message');
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSendMessage={jest.fn()} />);

    const input = screen.getByLabelText('Message input') as HTMLInputElement;
    const sendButton = screen.getByLabelText('Send message');

    await user.type(input, 'Test message');
    await user.click(sendButton);

    expect(input.value).toBe('');
  });

  it('does not send empty messages', async () => {
    const handleSend = jest.fn();
    const user = userEvent.setup();

    render(<MessageInput onSendMessage={handleSend} />);

    const sendButton = screen.getByLabelText('Send message');
    await user.click(sendButton);

    expect(handleSend).not.toHaveBeenCalled();
  });

  it('disables input and button when disabled prop is true', () => {
    render(<MessageInput onSendMessage={jest.fn()} disabled />);

    expect(screen.getByLabelText('Message input')).toBeDisabled();
    expect(screen.getByLabelText('Send message')).toBeDisabled();
  });
});
