import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { config } from '../../config.js';
import { RecurringInvoicesService } from './recurring-invoices.service.js';

/**
 * Runs the recurring invoice job every hour. The job is idempotent, so running more often than
 * daily only means invoices appear soon after midnight in the organization's time zone, and a
 * server that was down catches up on its next run.
 */
@Injectable()
export class RecurringInvoicesScheduler {
  private readonly logger = new Logger(RecurringInvoicesScheduler.name);
  private running = false;

  constructor(private readonly recurring: RecurringInvoicesService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'recurring-invoices', disabled: !config.recurringJobEnabled })
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.recurring.runDue();
      if (result.created.length || result.failed.length) {
        this.logger.log(`Recurring invoices: ${result.created.length} created, ${result.failed.length} failed`);
      }
    } finally {
      this.running = false;
    }
  }
}
