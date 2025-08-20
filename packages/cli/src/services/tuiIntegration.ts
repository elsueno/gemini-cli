import { TextBuffer } from '../ui/components/shared/text-buffer.js';

export interface TuiIntegrationCallbacks {
  onResponseComplete?: (questionId: string, response: string) => void;
  onError?: (questionId: string, error: string) => void;
}

export class TuiIntegration {
  private callbacks: TuiIntegrationCallbacks = {};
  private pendingQuestions = new Map<string, { buffer: TextBuffer; onSubmit: (value: string) => void }>();
  private currentQuestionId: string | null = null;

  setCallbacks(callbacks: TuiIntegrationCallbacks): void {
    this.callbacks = callbacks;
  }

  getCurrentQuestionId(): string | null {
    return this.currentQuestionId;
  }

  // Store reference to InputPrompt components for programmatic interaction
  registerInputPrompt(buffer: TextBuffer, onSubmit: (value: string) => void): void {
    // For now, store the most recent one
    this.pendingQuestions.set('current', { buffer, onSubmit });
  }

  // Programmatically submit text through TUI
  submitQuestion(text: string, questionId: string): void {
    const current = this.pendingQuestions.get('current');
    if (!current) {
      console.error('No InputPrompt registered for TUI integration');
      if (this.callbacks.onError) {
        this.callbacks.onError(questionId, 'TUI not available');
      }
      return;
    }

    try {
      // Set new text (this will replace the entire buffer)
      current.buffer.setText(text);
      
      // Store question ID for response tracking
      this.pendingQuestions.set(questionId, current);
      this.currentQuestionId = questionId;
      
      // Trigger submit (simulates Enter key)
      current.onSubmit(text);
    } catch (error) {
      console.error('Error submitting question through TUI:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(questionId, `TUI submission failed: ${error}`);
      }
    }
  }

  // Called when a response is captured from TUI
  notifyResponseComplete(questionId: string, response: string): void {
    if (this.callbacks.onResponseComplete) {
      this.callbacks.onResponseComplete(questionId, response);
    }
    // Clean up
    this.pendingQuestions.delete(questionId);
    if (this.currentQuestionId === questionId) {
      this.currentQuestionId = null;
    }
  }

  notifyError(questionId: string, error: string): void {
    if (this.callbacks.onError) {
      this.callbacks.onError(questionId, error);
    }
    // Clean up
    this.pendingQuestions.delete(questionId);
    if (this.currentQuestionId === questionId) {
      this.currentQuestionId = null;
    }
  }
}