import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;

if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export const emailService = {
  isConfigured(): boolean {
    return Boolean(transporter);
  },

  async send(msg: EmailMessage): Promise<{ delivered: boolean; mode: 'smtp' | 'deferred' }> {
    if (!transporter) {
      return { delivered: false, mode: 'deferred' };
    }
    try {
      await transporter.sendMail({
        from: env.SMTP_FROM,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      });
      return { delivered: true, mode: 'smtp' };
    } catch (err) {
      console.warn('[EmailService] Delivery deferred:', (err as Error).message);
      return { delivered: false, mode: 'deferred' };
    }
  },
};
