import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env';

/**
 * Mail transport — Phase 1 console-only (stdout). Phase 2 swap ke SMTP
 * via nodemailer. Interface tetep `async send()` supaya call-site gak
 * berubah pas transport diganti.
 *
 * Prefix `[DEV EMAIL]` di-hardcode supaya gampang di-grep dari log dev.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: 'console' | 'smtp';
  private readonly from: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.transport = this.config.get('MAIL_TRANSPORT', { infer: true });
    this.from = this.config.get('MAIL_FROM', { infer: true });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const subject = 'ARISE — Verify your email';
    const body = [
      'Hi Hunter,',
      '',
      'Verifikasi email lo untuk aktivasi account ARISE.',
      'Paste token di-bawah ke POST /v1/auth/verify-email:',
      '',
      token,
      '',
      'Token kadaluarsa dalam 24 jam.',
      '',
      '— ARISE System',
    ].join('\n');

    await this.send({ to, subject, body });
  }

  private async send(opts: { to: string; subject: string; body: string }): Promise<void> {
    if (this.transport === 'console') {
      this.logger.log(`[DEV EMAIL] → ${opts.to}`);
      this.logger.log(`  From:    ${this.from}`);
      this.logger.log(`  Subject: ${opts.subject}`);
      this.logger.log(`  Body:\n${opts.body}`);
      return;
    }
    throw new Error(`Mail transport "${this.transport}" not implemented (Phase 1)`);
  }
}
