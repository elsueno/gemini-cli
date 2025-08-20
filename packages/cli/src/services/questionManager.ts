export interface QuestionState {
  id: string;
  status: 'thinking' | 'error' | 'finished';
  request: string;
  response?: string;
  error?: string;
  createdAt: Date;
}

export class QuestionManager {
  private questions = new Map<string, QuestionState>();

  generateQuestionId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  submitQuestion(text: string): string {
    const id = this.generateQuestionId();
    const question: QuestionState = {
      id,
      status: 'thinking',
      request: text,
      createdAt: new Date(),
    };
    
    this.questions.set(id, question);
    return id;
  }

  getAnswer(questionId: string): QuestionState | null {
    return this.questions.get(questionId) || null;
  }

  notifyResponseComplete(questionId: string, response: string): void {
    const question = this.questions.get(questionId);
    if (question) {
      question.status = 'finished';
      question.response = response;
    }
  }

  notifyError(questionId: string, error: string): void {
    const question = this.questions.get(questionId);
    if (question) {
      question.status = 'error';
      question.error = error;
    }
  }

  getAllQuestions(): QuestionState[] {
    return Array.from(this.questions.values());
  }
}