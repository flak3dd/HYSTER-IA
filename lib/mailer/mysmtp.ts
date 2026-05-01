/**
 * my.smtp.com API Integration
 * Based on common SMTP API service patterns
 * API Endpoint: https://my.smtp.com/api/v1/send
 */

export interface MySmtpEmailOptions {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
}

export interface MySmtpResponse {
  success: boolean
  messageId?: string
  error?: string
  data?: any
}

class MySmtpClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.MYSMTP_API_KEY || '';
    this.baseUrl = process.env.MYSMTP_API_URL || 'https://my.smtp.com/api/v1';
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async sendEmail(options: MySmtpEmailOptions): Promise<MySmtpResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'MYSMTP_API_KEY is not configured'
      };
    }

    const { to, subject, html, text, from, attachments, headers, tags } = options;
    const defaultFrom = process.env.MAIL_FROM || 'noreply@example.com';

    try {
      const emailData: any = {
        from: from || defaultFrom,
        to: Array.isArray(to) ? to : [to],
        subject,
      };

      if (html) emailData.html = html;
      if (text) emailData.text = text;
      if (attachments) emailData.attachments = attachments;
      if (headers) emailData.headers = headers;
      if (tags) emailData.tags = tags;

      const response = await fetch(`${this.baseUrl}/send`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(emailData),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || data.error || 'Failed to send email via my.smtp.com'
        };
      }

      return {
        success: true,
        messageId: data.id || data.messageId,
        data
      };
    } catch (error) {
      console.error('my.smtp.com email error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async sendBatchEmails(emails: MySmtpEmailOptions[]): Promise<MySmtpResponse[]> {
    const results = await Promise.allSettled(
      emails.map(email => this.sendEmail(email))
    );

    return results.map((result, index) => ({
      index,
      ...result.status === 'fulfilled' ? result.value : {
        success: false,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
      }
    }));
  }

  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/account`, {
        method: 'GET',
        headers: this.headers,
      });

      return {
        valid: response.ok,
        error: response.ok ? undefined : 'Invalid API key'
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to validate API key'
      };
    }
  }
}

// Export singleton instance
export const mySmtpClient = new MySmtpClient();

// Convenience functions
export async function sendMySmtpEmail(options: MySmtpEmailOptions): Promise<MySmtpResponse> {
  return mySmtpClient.sendEmail(options);
}

export async function sendMySmtpBatchEmails(emails: MySmtpEmailOptions[]): Promise<MySmtpResponse[]> {
  return mySmtpClient.sendBatchEmails(emails);
}

export async function validateMySmtpApiKey(): Promise<{ valid: boolean; error?: string }> {
  return mySmtpClient.validateApiKey();
}