import mongoose from 'mongoose';
import Transaction from '../models/Transaction';

interface GenerateOptions {
  accountId: mongoose.Types.ObjectId;
  finalBalance: number;
  adminId: mongoose.Types.ObjectId;
}

const creditDescriptions = [
  'Salary deposit',
  'Wire transfer received',
  'Direct deposit',
  'Refund processed',
  'Freelance payment',
  'Interest earned',
  'Bonus payment',
  'Cash deposit',
  'Transfer from savings',
  'Commission payment',
];

const debitDescriptions = [
  'Grocery purchase',
  'Electric bill payment',
  'Internet subscription',
  'Restaurant payment',
  'ATM withdrawal',
  'Online shopping',
  'Phone bill',
  'Gas station',
  'Insurance premium',
  'Rent payment',
  'Water bill',
  'Streaming subscription',
  'Gym membership',
  'Transportation',
  'Medical payment',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

export default async function generateTransactionHistory({ accountId, finalBalance, adminId }: GenerateOptions): Promise<void> {
  if (finalBalance <= 0) return;

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Generate between 40-80 transactions spread over the year
  const txnCount = Math.floor(Math.random() * 41) + 40;

  // Generate random dates sorted oldest first
  const dates: Date[] = [];
  for (let i = 0; i < txnCount; i++) {
    const ts = oneYearAgo.getTime() + Math.random() * (now.getTime() - oneYearAgo.getTime());
    dates.push(new Date(ts));
  }
  dates.sort((a, b) => a.getTime() - b.getTime());

  // Build transactions forward, keeping balance always >= 0
  // Start with a generous initial deposit, then simulate activity
  const initialDeposit = Math.round(randBetween(finalBalance * 0.5, finalBalance * 2) * 100) / 100;

  const transactions: any[] = [];
  let balance = initialDeposit;

  // First: initial deposit (1 day before first transaction)
  const firstDate = new Date(dates[0]);
  firstDate.setTime(firstDate.getTime() - 86400000);

  transactions.push({
    account_id: accountId,
    type: 'credit',
    amount: initialDeposit,
    balance_after: initialDeposit,
    description: 'Initial deposit',
    created_at: firstDate,
    created_by: adminId,
  });

  // Generate credit/debit transactions
  for (let i = 0; i < txnCount; i++) {
    const isCredit = Math.random() < 0.45;

    if (isCredit) {
      const amount = randBetween(50, finalBalance * 0.25);
      balance = Math.round((balance + amount) * 100) / 100;
      transactions.push({
        account_id: accountId,
        type: 'credit',
        amount,
        balance_after: balance,
        description: pick(creditDescriptions),
        created_at: dates[i],
        created_by: adminId,
      });
    } else {
      const maxDebit = Math.min(balance * 0.4, finalBalance * 0.15);
      if (maxDebit < 5) {
        // Balance too low to debit, do a small credit instead
        const amount = randBetween(50, finalBalance * 0.15);
        balance = Math.round((balance + amount) * 100) / 100;
        transactions.push({
          account_id: accountId,
          type: 'credit',
          amount,
          balance_after: balance,
          description: pick(creditDescriptions),
          created_at: dates[i],
          created_by: adminId,
        });
      } else {
        const amount = randBetween(5, maxDebit);
        balance = Math.round((balance - amount) * 100) / 100;
        transactions.push({
          account_id: accountId,
          type: 'debit',
          amount,
          balance_after: balance,
          description: pick(debitDescriptions),
          created_at: dates[i],
          created_by: adminId,
        });
      }
    }
  }

  // Final adjustment to land exactly on finalBalance
  const diff = Math.round((finalBalance - balance) * 100) / 100;
  if (Math.abs(diff) > 0.01) {
    transactions.push({
      account_id: accountId,
      type: diff > 0 ? 'credit' : 'debit',
      amount: Math.abs(diff),
      balance_after: finalBalance,
      description: diff > 0 ? 'Transfer received' : 'Service fee',
      created_at: new Date(now.getTime() - 3600000),
      created_by: adminId,
    });
  }

  await Transaction.insertMany(transactions);
}
